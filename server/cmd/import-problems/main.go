package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/database"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type sourceProblem struct {
	Title             string
	Slug              string
	Difficulty        string
	Tags              []string
	Description       string
	InputDescription  string
	OutputDescription string
	Hint              string
	TestCases         []sourceTestCase
}

type sourceTestCase struct {
	Input  string
	Output string
}

type importStats struct {
	Created   int
	Updated   int
	Problems  int
	TestCases int
}

var testCasePattern = regexp.MustCompile(`"input"\s*:\s*"(.*?)"\s*,\s*"output"\s*:\s*"(.*?)"`)

func main() {
	var filePath string
	var dryRun bool
	flag.StringVar(&filePath, "file", "", "path to the markdown problem set")
	flag.BoolVar(&dryRun, "dry-run", false, "parse and validate only")
	flag.Parse()

	if strings.TrimSpace(filePath) == "" {
		resolved, err := defaultProblemSetPath()
		if err != nil {
			log.Fatalf("resolve problem set path: %v", err)
		}
		filePath = resolved
	}

	problems, err := parseProblemSet(filePath)
	if err != nil {
		log.Fatalf("parse problem set: %v", err)
	}
	stats := importStats{Problems: len(problems)}
	for _, problem := range problems {
		stats.TestCases += len(problem.TestCases)
	}

	if dryRun {
		log.Printf("parsed %d problems and %d test cases from %s", stats.Problems, stats.TestCases, filePath)
		return
	}

	cfg := config.Load()
	ctx := context.Background()
	db, err := database.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	stats, err = importProblems(db, problems)
	if err != nil {
		log.Fatalf("import problems: %v", err)
	}
	log.Printf("import finished: %d created, %d updated, %d problems, %d test cases", stats.Created, stats.Updated, stats.Problems, stats.TestCases)
}

func defaultProblemSetPath() (string, error) {
	candidates := []string{
		"OJ系统题目集（50道基础题）.md",
		filepath.Join("..", "OJ系统题目集（50道基础题）.md"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	matches, err := filepath.Glob("OJ*.md")
	if err == nil && len(matches) > 0 {
		return matches[0], nil
	}
	matches, err = filepath.Glob(filepath.Join("..", "OJ*.md"))
	if err == nil && len(matches) > 0 {
		return matches[0], nil
	}
	return "", errors.New("problem set markdown was not found")
}

func parseProblemSet(filePath string) ([]sourceProblem, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(raw) {
		return nil, errors.New("problem set file is not valid UTF-8")
	}

	lines := strings.Split(string(raw), "\n")
	problems := make([]sourceProblem, 0, 50)
	var current *sourceProblem
	inTestCases := false

	flush := func() error {
		if current == nil {
			return nil
		}
		if err := validateProblem(*current); err != nil {
			return err
		}
		problems = append(problems, *current)
		current = nil
		return nil
	}

	for lineNumber, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || line == `\[` || line == `\]` {
			continue
		}

		if line == `\{` {
			if current != nil {
				return nil, fmt.Errorf("line %d: nested problem object", lineNumber+1)
			}
			current = &sourceProblem{Difficulty: "Easy"}
			inTestCases = false
			continue
		}
		if current == nil {
			continue
		}
		if line == `\},` || line == `\}` {
			if err := flush(); err != nil {
				return nil, fmt.Errorf("line %d: %w", lineNumber+1, err)
			}
			inTestCases = false
			continue
		}
		if line == `\]` {
			inTestCases = false
			continue
		}

		if strings.HasPrefix(line, `"test\_cases"`) || strings.HasPrefix(line, `"test_cases"`) {
			inTestCases = true
			continue
		}

		if inTestCases {
			if strings.HasPrefix(line, `\]`) {
				inTestCases = false
				continue
			}
			tc, ok := parseTestCaseLine(line)
			if !ok {
				return nil, fmt.Errorf("line %d: invalid test case line", lineNumber+1)
			}
			current.TestCases = append(current.TestCases, tc)
			continue
		}

		key, value, ok := parseFieldLine(line)
		if !ok {
			return nil, fmt.Errorf("line %d: invalid field line", lineNumber+1)
		}
		switch key {
		case "title":
			current.Title = value
		case "slug":
			current.Slug = value
		case "difficulty":
			current.Difficulty = value
		case "tags":
			current.Tags = splitTags(value)
		case "description":
			current.Description = value
		case "input_format":
			current.InputDescription = value
		case "output_format":
			current.OutputDescription = value
		case "hint":
			current.Hint = value
		default:
			return nil, fmt.Errorf("line %d: unsupported field %q", lineNumber+1, key)
		}
	}

	if current != nil {
		if err := flush(); err != nil {
			return nil, err
		}
	}
	if len(problems) == 0 {
		return nil, errors.New("no problems found")
	}
	return problems, nil
}

func parseFieldLine(line string) (string, string, bool) {
	separator := strings.Index(line, ":")
	if separator < 0 {
		return "", "", false
	}
	key := strings.TrimSpace(line[:separator])
	value := strings.TrimSpace(line[separator+1:])
	value = strings.TrimSuffix(value, ",")

	key = strings.Trim(key, `"`)
	key = markdownUnescape(key)
	if !strings.HasPrefix(value, `"`) || !strings.HasSuffix(value, `"`) {
		return "", "", false
	}
	value = strings.TrimPrefix(value, `"`)
	value = strings.TrimSuffix(value, `"`)
	return key, markdownUnescape(value), true
}

func parseTestCaseLine(line string) (sourceTestCase, bool) {
	matches := testCasePattern.FindStringSubmatch(line)
	if len(matches) != 3 {
		return sourceTestCase{}, false
	}
	return sourceTestCase{
		Input:  markdownUnescape(matches[1]),
		Output: markdownUnescape(matches[2]),
	}, true
}

func markdownUnescape(value string) string {
	replacer := strings.NewReplacer(
		`\\n`, "\n",
		`\\t`, "\t",
		`\[`, `[`,
		`\]`, `]`,
		`\{`, `{`,
		`\}`, `}`,
		`\_`, `_`,
		`\+`, `+`,
		`\-`, `-`,
		`\!`, `!`,
		`\#`, `#`,
		`\<`, `<`,
		`\>`, `>`,
	)
	return replacer.Replace(value)
}

func splitTags(value string) []string {
	seen := map[string]bool{}
	parts := strings.FieldsFunc(value, func(r rune) bool {
		return r == ',' || r == '，' || r == ';' || r == '；'
	})
	tags := make([]string, 0, len(parts))
	for _, part := range parts {
		tag := strings.TrimSpace(part)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		tags = append(tags, tag)
	}
	return tags
}

func validateProblem(problem sourceProblem) error {
	switch {
	case strings.TrimSpace(problem.Title) == "":
		return errors.New("title is required")
	case strings.TrimSpace(problem.Slug) == "":
		return fmt.Errorf("problem %q slug is required", problem.Title)
	case strings.TrimSpace(problem.Description) == "":
		return fmt.Errorf("problem %q description is required", problem.Title)
	case len(problem.TestCases) == 0:
		return fmt.Errorf("problem %q has no test cases", problem.Title)
	}
	for index, tc := range problem.TestCases {
		if strings.TrimSpace(tc.Output) == "" {
			return fmt.Errorf("problem %q test case %d output is required", problem.Title, index+1)
		}
	}
	return nil
}

func importProblems(db *gorm.DB, sources []sourceProblem) (importStats, error) {
	stats := importStats{Problems: len(sources)}

	err := db.Transaction(func(tx *gorm.DB) error {
		for _, source := range sources {
			testCases := buildTestCases(source.TestCases)
			stats.TestCases += len(testCases)

			tags, err := ensureTags(tx, source.Tags)
			if err != nil {
				return err
			}

			var problem model.Problem
			result := tx.Where("slug = ?", source.Slug).Find(&problem)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				problem = model.Problem{
					Title:             source.Title,
					Slug:              source.Slug,
					Description:       source.Description,
					InputDescription:  source.InputDescription,
					OutputDescription: source.OutputDescription,
					Difficulty:        normalizedDifficulty(source.Difficulty),
					TimeLimitMS:       1000,
					MemoryLimitMB:     128,
					Hint:              source.Hint,
					IsPublished:       true,
					Tags:              tags,
					TestCases:         testCases,
				}
				if err := tx.Create(&problem).Error; err != nil {
					return fmt.Errorf("create problem %q: %w", source.Slug, err)
				}
				stats.Created++
				continue
			}

			updates := map[string]any{
				"title":              source.Title,
				"description":        source.Description,
				"input_description":  source.InputDescription,
				"output_description": source.OutputDescription,
				"difficulty":         normalizedDifficulty(source.Difficulty),
				"time_limit_ms":      1000,
				"memory_limit_mb":    128,
				"hint":               source.Hint,
				"is_published":       true,
			}
			if err := tx.Model(&problem).Updates(updates).Error; err != nil {
				return fmt.Errorf("update problem %q: %w", source.Slug, err)
			}
			if err := tx.Model(&problem).Association("Tags").Replace(tags); err != nil {
				return fmt.Errorf("replace tags for %q: %w", source.Slug, err)
			}
			if err := tx.Where("problem_id = ?", problem.ID).Delete(&model.TestCase{}).Error; err != nil {
				return fmt.Errorf("delete old test cases for %q: %w", source.Slug, err)
			}
			for index := range testCases {
				testCases[index].ProblemID = problem.ID
			}
			if err := tx.Create(&testCases).Error; err != nil {
				return fmt.Errorf("replace test cases for %q: %w", source.Slug, err)
			}
			stats.Updated++
		}
		return nil
	})

	return stats, err
}

func buildTestCases(sources []sourceTestCase) []model.TestCase {
	testCases := make([]model.TestCase, 0, len(sources))
	for index, source := range sources {
		testCases = append(testCases, model.TestCase{
			Input:          source.Input,
			ExpectedOutput: source.Output,
			IsSample:       index == 0,
			SortOrder:      index + 1,
		})
	}
	return testCases
}

func ensureTags(db *gorm.DB, names []string) ([]model.Tag, error) {
	tags := make([]model.Tag, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		var tag model.Tag
		if err := db.Where("name = ?", name).FirstOrCreate(&tag, model.Tag{Name: name}).Error; err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, nil
}

func normalizedDifficulty(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "medium":
		return "Medium"
	case "hard":
		return "Hard"
	default:
		return "Easy"
	}
}
