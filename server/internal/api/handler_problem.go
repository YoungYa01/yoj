package api

import (
	"errors"
	"net/http"
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
	items := make([]problemResponse, 0, len(problems))
	for _, problem := range problems {
		items = append(items, toProblemResponse(problem, attempted[problem.ID], accepted[problem.ID], false))
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
		Where("id = ? AND is_public = ?", id, true).
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
	c.JSON(http.StatusOK, gin.H{"problem": toProblemResponse(problem, attempted[problem.ID], accepted[problem.ID], true)})
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
