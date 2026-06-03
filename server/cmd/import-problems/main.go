package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type sourceProblem struct {
	Title             string           `json:"title"`
	Slug              string           `json:"slug"`
	Difficulty        string           `json:"difficulty"`
	Tags              []string         `json:"tags"`
	Description       string           `json:"description"`
	InputDescription  string           `json:"input_description"`
	OutputDescription string           `json:"output_description"`
	Hint              string           `json:"hint"`
	TimeLimitMS       int              `json:"time_limit_ms"`
	MemoryLimitMB     int              `json:"memory_limit_mb"`
	IsPublished       bool             `json:"is_published"`
	TestCases         []sourceTestCase `json:"test_cases"`
}

type sourceTestCase struct {
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsSample       bool   `json:"is_sample"`
	SortOrder      int    `json:"sort_order"`
}

func main() {
	file := flag.String("file", "../data/yoj_cleaned_problems.json", "cleaned problem json file")
	dryRun := flag.Bool("dry-run", false, "parse and validate only; do not write database")
	onlySlug := flag.String("only-slug", "", "import only one problem by slug")
	flag.Parse()

	problems, err := readProblems(*file)
	if err != nil {
		log.Fatal(err)
	}

	if *onlySlug != "" {
		filtered := make([]sourceProblem, 0, 1)
		for _, problem := range problems {
			if problem.Slug == *onlySlug {
				filtered = append(filtered, problem)
			}
		}
		problems = filtered
	}

	if err := validateProblems(problems); err != nil {
		log.Fatal(err)
	}

	log.Printf("loaded %d problems from %s", len(problems), *file)

	if *dryRun {
		log.Println("dry-run passed; database was not modified")
		return
	}

	cfg := config.Load()
	db, err := gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatalf("connect database failed: %v", err)
	}

	start := time.Now()
	var created, updated int

	for index, problem := range problems {
		wasCreated, err := importProblem(db, problem)
		if err != nil {
			log.Fatalf("import %s failed: %v", problem.Slug, err)
		}
		if wasCreated {
			created++
		} else {
			updated++
		}
		log.Printf("[%d/%d] imported %s", index+1, len(problems), problem.Slug)
	}

	log.Printf("done: created=%d updated=%d elapsed=%s", created, updated, time.Since(start).Round(time.Millisecond))
}

func readProblems(file string) ([]sourceProblem, error) {
	content, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}

	var problems []sourceProblem
	if err := json.Unmarshal(content, &problems); err != nil {
		return nil, err
	}

	return problems, nil
}

func validateProblems(problems []sourceProblem) error {
	if len(problems) == 0 {
		return errors.New("no problems to import")
	}

	seen := map[string]bool{}

	for _, problem := range problems {
		slug := strings.TrimSpace(problem.Slug)
		if slug == "" {
			return fmt.Errorf("problem %q has empty slug", problem.Title)
		}
		if seen[slug] {
			return fmt.Errorf("duplicate slug %q", slug)
		}
		seen[slug] = true

		if strings.TrimSpace(problem.Title) == "" {
			return fmt.Errorf("%s has empty title", slug)
		}
		if strings.TrimSpace(problem.Description) == "" {
			return fmt.Errorf("%s has empty description", slug)
		}
		if problem.Difficulty != "Easy" && problem.Difficulty != "Medium" && problem.Difficulty != "Hard" {
			return fmt.Errorf("%s has invalid difficulty %q", slug, problem.Difficulty)
		}
		if len(problem.TestCases) == 0 {
			return fmt.Errorf("%s has no test cases", slug)
		}
		for i, tc := range problem.TestCases {
			if strings.TrimRight(tc.ExpectedOutput, "\r\n") == "" {
				return fmt.Errorf("%s test case %d has empty expected_output", slug, i+1)
			}
		}
	}

	return nil
}

func importProblem(db *gorm.DB, input sourceProblem) (bool, error) {
	created := false

	err := db.Transaction(func(tx *gorm.DB) error {
		var problem model.Problem
		err := tx.Unscoped().Where("slug = ?", input.Slug).First(&problem).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			created = true
			problem = model.Problem{Slug: input.Slug}
		} else if err != nil {
			return err
		}

		timeLimit := input.TimeLimitMS
		if timeLimit <= 0 {
			timeLimit = 1000
		}
		memoryLimit := input.MemoryLimitMB
		if memoryLimit <= 0 {
			memoryLimit = 128
		}

		problem.Title = strings.TrimSpace(input.Title)
		problem.Slug = strings.TrimSpace(input.Slug)
		problem.Description = strings.TrimSpace(input.Description)
		problem.InputDescription = strings.TrimSpace(input.InputDescription)
		problem.OutputDescription = strings.TrimSpace(input.OutputDescription)
		problem.Difficulty = strings.TrimSpace(input.Difficulty)
		problem.TimeLimitMS = timeLimit
		problem.MemoryLimitMB = memoryLimit
		problem.Hint = strings.TrimSpace(input.Hint)
		problem.IsPublished = input.IsPublished

		if created {
			if err := tx.Create(&problem).Error; err != nil {
				return err
			}
		} else {
			// Restore a soft-deleted problem if the slug already exists in deleted rows.
			if err := tx.Unscoped().Model(&problem).Update("deleted_at", nil).Error; err != nil {
				return err
			}
			if err := tx.Save(&problem).Error; err != nil {
				return err
			}
		}

		tags := make([]model.Tag, 0, len(input.Tags))
		for _, name := range input.Tags {
			name = strings.TrimSpace(name)
			if name == "" {
				continue
			}

			tag, err := ensureTag(tx, name)
			if err != nil {
				return err
			}
			tags = append(tags, tag)
		}

		if err := tx.Model(&problem).Association("Tags").Replace(tags); err != nil {
			return err
		}

		// These files are the source of truth. Replace old test cases so fixed IO takes effect.
		if err := tx.Where("problem_id = ?", problem.ID).Delete(&model.TestCase{}).Error; err != nil {
			return err
		}

		cases := make([]model.TestCase, 0, len(input.TestCases))
		for i, tc := range input.TestCases {
			sortOrder := tc.SortOrder
			if sortOrder <= 0 {
				sortOrder = i + 1
			}
			cases = append(cases, model.TestCase{
				ProblemID:      problem.ID,
				Input:          strings.TrimRight(tc.Input, "\r\n"),
				ExpectedOutput: strings.TrimRight(tc.ExpectedOutput, "\r\n"),
				IsSample:       tc.IsSample,
				SortOrder:      sortOrder,
			})
		}

		if err := tx.Create(&cases).Error; err != nil {
			return err
		}

		return nil
	})

	return created, err
}

func ensureTag(tx *gorm.DB, name string) (model.Tag, error) {
	var tag model.Tag
	err := tx.Unscoped().Where("name = ?", name).First(&tag).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		tag = model.Tag{Name: name}
		return tag, tx.Create(&tag).Error
	}
	if err != nil {
		return tag, err
	}

	if err := tx.Unscoped().Model(&tag).Update("deleted_at", nil).Error; err != nil {
		return tag, err
	}

	return tag, nil
}
