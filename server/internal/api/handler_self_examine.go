package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/judge"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type selfTestRequest struct {
	Language       string `json:"language"`
	Code           string `json:"code"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
}

func (s *Server) runProblemSelfTest(c *gin.Context) {
	problemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var problem model.Problem
	err := s.db.
		Where("id = ? AND is_published = ?", problemID, true).
		First(&problem).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}

	req, ok := bindSelfTestRequest(c)
	if !ok {
		return
	}

	runner := judge.NewRunner(s.db, s.config)

	result := runner.RunSelfTest(c.Request.Context(), judge.SelfTestRequest{
		Language:       req.Language,
		Code:           req.Code,
		Input:          req.Input,
		ExpectedOutput: req.ExpectedOutput,
		TimeLimitMS:    problem.TimeLimitMS,
		MemoryLimitMB:  problem.MemoryLimitMB,
	})

	c.JSON(http.StatusOK, gin.H{"result": result})
}

func (s *Server) runContestProblemSelfTest(c *gin.Context) {
	user, _ := currentUser(c)

	contestID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	problemID, ok := parseUintParam(c, "problem_id")
	if !ok {
		return
	}

	var contest model.Contest
	err := s.db.First(&contest, contestID).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}

	if user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "join contest before self testing"})
		return
	}

	var contestProblem model.ContestProblem
	err = s.db.
		Preload("Problem").
		Where("contest_id = ? AND problem_id = ?", contest.ID, problemID).
		First(&contestProblem).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found in contest"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest problem failed"})
		return
	}

	if !contestProblem.Problem.IsPublished && user.Role != model.RoleAdmin {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	req, ok := bindSelfTestRequest(c)
	if !ok {
		return
	}

	runner := judge.NewRunner(s.db, s.config)

	result := runner.RunSelfTest(c.Request.Context(), judge.SelfTestRequest{
		Language:       req.Language,
		Code:           req.Code,
		Input:          req.Input,
		ExpectedOutput: req.ExpectedOutput,
		TimeLimitMS:    contestProblem.Problem.TimeLimitMS,
		MemoryLimitMB:  contestProblem.Problem.MemoryLimitMB,
	})

	c.JSON(http.StatusOK, gin.H{"result": result})
}

func bindSelfTestRequest(c *gin.Context) (selfTestRequest, bool) {
	var req selfTestRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return req, false
	}

	req.Language = strings.ToLower(strings.TrimSpace(req.Language))

	if !validLanguage(req.Language) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported language"})
		return req, false
	}

	if strings.TrimSpace(req.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
		return req, false
	}

	if len(req.Code) > 128*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code is too large"})
		return req, false
	}

	if len(req.Input) > 64*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "input is too large"})
		return req, false
	}

	if len(req.ExpectedOutput) > 64*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expected_output is too large"})
		return req, false
	}

	return req, true
}
