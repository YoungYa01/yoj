package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type problemRequest struct {
	Title             string   `json:"title"`
	Slug              string   `json:"slug"`
	Description       string   `json:"description"`
	InputDescription  string   `json:"input_description"`
	OutputDescription string   `json:"output_description"`
	Difficulty        string   `json:"difficulty"`
	TimeLimitMS       int      `json:"time_limit_ms"`
	MemoryLimitMB     int      `json:"memory_limit_mb"`
	Hint              string   `json:"hint"`
	IsPublished       bool     `json:"is_published"`
	Tags              []string `json:"tags"`
}

type testCaseRequest struct {
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsSample       bool   `json:"is_sample"`
	SortOrder      int    `json:"sort_order"`
}

func (s *Server) adminListProblems(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.Problem{}).Preload("Tags")

	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		like := "%" + keyword + "%"
		if id, err := strconv.ParseUint(keyword, 10, 64); err == nil && id > 0 {
			query = query.Where("id = ? OR title LIKE ? OR slug LIKE ?", id, like, like)
		} else {
			query = query.Where("title LIKE ? OR slug LIKE ?", like, like)
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

	items := make([]problemResponse, 0, len(problems))
	for _, problem := range problems {
		items = append(items, toProblemResponse(problem, false, false, false))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (s *Server) adminGetProblem(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var problem model.Problem
	err := s.db.Preload("Tags").
		Preload("TestCases", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		First(&problem, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}

	resp := toProblemResponse(problem, false, false, true)
	resp.Samples = make([]testCaseResponse, 0, len(problem.TestCases))
	for _, tc := range problem.TestCases {
		resp.Samples = append(resp.Samples, testCaseResponse{
			ID:             tc.ID,
			Input:          tc.Input,
			ExpectedOutput: tc.ExpectedOutput,
			IsSample:       tc.IsSample,
			SortOrder:      tc.SortOrder,
		})
	}
	c.JSON(http.StatusOK, gin.H{"problem": resp})
}

func (s *Server) adminCreateProblem(c *gin.Context) {
	var req problemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	problem, err := buildProblemFromRequest(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		tags, err := ensureTags(tx, req.Tags)
		if err != nil {
			return err
		}
		problem.Tags = tags
		return tx.Create(&problem).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create problem failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"problem": toProblemResponse(problem, false, false, true)})
}

func (s *Server) adminUpdateProblem(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req problemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	next, err := buildProblemFromRequest(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var problem model.Problem
	if err := s.db.Preload("Tags").First(&problem, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		tags, err := ensureTags(tx, req.Tags)
		if err != nil {
			return err
		}
		if err := tx.Model(&problem).Updates(map[string]any{
			"title":              next.Title,
			"slug":               next.Slug,
			"description":        next.Description,
			"input_description":  next.InputDescription,
			"output_description": next.OutputDescription,
			"difficulty":         next.Difficulty,
			"time_limit_ms":      next.TimeLimitMS,
			"memory_limit_mb":    next.MemoryLimitMB,
			"hint":               next.Hint,
			"is_published":       next.IsPublished,
		}).Error; err != nil {
			return err
		}
		return tx.Model(&problem).Association("Tags").Replace(tags)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update problem failed"})
		return
	}

	if err := s.db.Preload("Tags").First(&problem, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"problem": toProblemResponse(problem, false, false, true)})
}

func (s *Server) adminDeleteProblem(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := s.db.Delete(&model.Problem{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete problem failed"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) adminListTestCases(c *gin.Context) {
	problemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var cases []model.TestCase
	if err := s.db.Where("problem_id = ?", problemID).Order("sort_order ASC, id ASC").Find(&cases).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query test cases failed"})
		return
	}
	items := make([]testCaseResponse, 0, len(cases))
	for _, tc := range cases {
		items = append(items, testCaseResponse{
			ID:             tc.ID,
			Input:          tc.Input,
			ExpectedOutput: tc.ExpectedOutput,
			IsSample:       tc.IsSample,
			SortOrder:      tc.SortOrder,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) adminCreateTestCase(c *gin.Context) {
	problemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req testCaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if strings.TrimSpace(req.ExpectedOutput) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expected_output is required"})
		return
	}
	tc := model.TestCase{
		ProblemID:      problemID,
		Input:          req.Input,
		ExpectedOutput: req.ExpectedOutput,
		IsSample:       req.IsSample,
		SortOrder:      req.SortOrder,
	}
	if err := s.db.Create(&tc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create test case failed"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"test_case": testCaseResponse{
		ID:             tc.ID,
		Input:          tc.Input,
		ExpectedOutput: tc.ExpectedOutput,
		IsSample:       tc.IsSample,
		SortOrder:      tc.SortOrder,
	}})
}

func (s *Server) adminUpdateTestCase(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req testCaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if strings.TrimSpace(req.ExpectedOutput) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expected_output is required"})
		return
	}
	var tc model.TestCase
	if err := s.db.First(&tc, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "test case not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query test case failed"})
		return
	}
	if err := s.db.Model(&tc).Updates(map[string]any{
		"input":           req.Input,
		"expected_output": req.ExpectedOutput,
		"is_sample":       req.IsSample,
		"sort_order":      req.SortOrder,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update test case failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"test_case": testCaseResponse{
		ID:             tc.ID,
		Input:          req.Input,
		ExpectedOutput: req.ExpectedOutput,
		IsSample:       req.IsSample,
		SortOrder:      req.SortOrder,
	}})
}

func (s *Server) adminDeleteTestCase(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := s.db.Delete(&model.TestCase{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete test case failed"})
		return
	}
	c.Status(http.StatusNoContent)
}

func buildProblemFromRequest(req problemRequest) (model.Problem, error) {
	req.Title = strings.TrimSpace(req.Title)
	req.Slug = strings.TrimSpace(req.Slug)
	req.Difficulty = strings.TrimSpace(req.Difficulty)
	if req.Title == "" {
		return model.Problem{}, errors.New("title is required")
	}
	if req.Slug == "" {
		return model.Problem{}, errors.New("slug is required")
	}
	if strings.TrimSpace(req.Description) == "" {
		return model.Problem{}, errors.New("description is required")
	}
	if req.Difficulty == "" {
		req.Difficulty = "Easy"
	}
	if req.TimeLimitMS <= 0 {
		req.TimeLimitMS = 1000
	}
	if req.MemoryLimitMB <= 0 {
		req.MemoryLimitMB = 128
	}
	return model.Problem{
		Title:             req.Title,
		Slug:              req.Slug,
		Description:       req.Description,
		InputDescription:  req.InputDescription,
		OutputDescription: req.OutputDescription,
		Difficulty:        req.Difficulty,
		TimeLimitMS:       req.TimeLimitMS,
		MemoryLimitMB:     req.MemoryLimitMB,
		Hint:              req.Hint,
		IsPublished:       req.IsPublished,
	}, nil
}

func ensureTags(db *gorm.DB, names []string) ([]model.Tag, error) {
	seen := map[string]bool{}
	tags := make([]model.Tag, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		var tag model.Tag
		if err := db.Where("name = ?", name).FirstOrCreate(&tag, model.Tag{Name: name}).Error; err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, nil
}
