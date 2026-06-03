package api

import (
	"errors"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

func (s *Server) listProblems(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.Problem{}).Preload("Tags").Where("is_published = ?", true)

	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("title LIKE ? OR slug LIKE ?", like, like)
	}
	if difficulty := strings.TrimSpace(c.Query("difficulty")); difficulty != "" {
		query = query.Where("difficulty = ?", difficulty)
	}
	if tag := strings.TrimSpace(c.Query("tag")); tag != "" {
		query = query.Joins("JOIN problem_tags ON problem_tags.problem_id = problems.id").
			Joins("JOIN tags ON tags.id = problem_tags.tag_id").
			Where("tags.name = ?", tag)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		if user, ok := currentUser(c); ok {
			userSubmissions := s.db.Model(&model.Submission{}).
				Select("1").
				Where("submissions.problem_id = problems.id AND submissions.user_id = ?", user.ID)
			acceptedSubmissions := s.db.Model(&model.Submission{}).
				Select("1").
				Where("submissions.problem_id = problems.id AND submissions.user_id = ? AND submissions.status = ?", user.ID, model.StatusAccepted)

			switch status {
			case "accepted":
				query = query.Where("EXISTS (?)", acceptedSubmissions)
			case "attempted":
				query = query.Where("EXISTS (?) AND NOT EXISTS (?)", userSubmissions, acceptedSubmissions)
			case "todo":
				query = query.Where("NOT EXISTS (?)", userSubmissions)
			}
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count problems failed"})
		return
	}

	var problems []model.Problem
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&problems).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problems failed"})
		return
	}

	attempted, accepted := s.problemStatusMaps(c, problems)
	statusStats := s.problemStatusStatsMap(problems)

	items := make([]problemResponse, 0, len(problems))
	for _, problem := range problems {
		item := toProblemResponse(problem, attempted[problem.ID], accepted[problem.ID], false)
		item.StatusStats = statusStats[problem.ID]
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (s *Server) getProblem(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var problem model.Problem
	err := s.db.
		Preload("Tags").
		Preload("TestCases", func(db *gorm.DB) *gorm.DB {
			return db.Where("is_sample = ?", true).Order("sort_order ASC, id ASC")
		}).
		Where("id = ? AND is_published = ?", id, true).
		First(&problem).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}

	attempted, accepted := s.problemStatusMaps(c, []model.Problem{problem})
	statusStats := s.problemStatusStatsMap([]model.Problem{problem})

	item := toProblemResponse(problem, attempted[problem.ID], accepted[problem.ID], true)
	item.StatusStats = statusStats[problem.ID]

	c.JSON(http.StatusOK, gin.H{"problem": item})
}

func (s *Server) problemStatusMaps(c *gin.Context, problems []model.Problem) (map[uint]bool, map[uint]bool) {
	attempted := map[uint]bool{}
	accepted := map[uint]bool{}
	user, ok := currentUser(c)
	if !ok || len(problems) == 0 {
		return attempted, accepted
	}

	ids := make([]uint, 0, len(problems))
	for _, problem := range problems {
		ids = append(ids, problem.ID)
	}

	var rows []struct {
		ProblemID uint
		Status    string
	}
	if err := s.db.Model(&model.Submission{}).
		Select("problem_id, status").
		Where("user_id = ? AND problem_id IN ?", user.ID, ids).
		Find(&rows).Error; err != nil {
		return attempted, accepted
	}
	for _, row := range rows {
		attempted[row.ProblemID] = true
		if row.Status == model.StatusAccepted {
			accepted[row.ProblemID] = true
		}
	}
	return attempted, accepted
}

func (s *Server) problemStatusStatsMap(problems []model.Problem) map[uint][]problemStatusStatResponse {
	result := map[uint][]problemStatusStatResponse{}

	if len(problems) == 0 {
		return result
	}

	ids := make([]uint, 0, len(problems))
	for _, problem := range problems {
		ids = append(ids, problem.ID)
	}

	var rows []struct {
		ProblemID uint   `gorm:"column:problem_id"`
		Status    string `gorm:"column:status"`
		Count     int64  `gorm:"column:count"`
	}

	if err := s.db.
		Model(&model.Submission{}).
		Select("problem_id, status, COUNT(*) AS count").
		Where("problem_id IN ?", ids).
		Group("problem_id, status").
		Scan(&rows).Error; err != nil {
		return result
	}

	totalByProblem := map[uint]int64{}

	for _, row := range rows {
		totalByProblem[row.ProblemID] += row.Count
		result[row.ProblemID] = append(result[row.ProblemID], problemStatusStatResponse{
			Status: row.Status,
			Count:  row.Count,
		})
	}

	statusOrder := map[string]int{
		model.StatusAccepted:            1,
		model.StatusWrongAnswer:         2,
		model.StatusTimeLimitExceeded:   3,
		model.StatusMemoryLimitExceeded: 4,
		model.StatusRuntimeError:        5,
		model.StatusCompileError:        6,
		model.StatusSystemError:         7,
		model.StatusPending:             8,
		model.StatusJudging:             9,
	}

	for problemID, stats := range result {
		total := totalByProblem[problemID]

		for index := range stats {
			if total > 0 {
				stats[index].Rate = math.Round(float64(stats[index].Count)/float64(total)*10000) / 100
			}
		}

		sort.Slice(stats, func(i, j int) bool {
			left := statusOrder[stats[i].Status]
			right := statusOrder[stats[j].Status]

			if left == 0 {
				left = 999
			}

			if right == 0 {
				right = 999
			}

			if left == right {
				return stats[i].Status < stats[j].Status
			}

			return left < right
		})

		result[problemID] = stats
	}

	return result
}
