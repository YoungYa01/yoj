package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"github.com/yoj/yoj/server/internal/queue"
	"gorm.io/gorm"
)

type submitRequest struct {
	Language string `json:"language"`
	Code     string `json:"code"`
}

func (s *Server) submitProblem(c *gin.Context) {
	user, _ := currentUser(c)
	problemID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var problem model.Problem
	if err := s.db.Where("is_published = ?", true).First(&problem, problemID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query problem failed"})
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	req.Language = strings.ToLower(strings.TrimSpace(req.Language))
	if !validLanguage(req.Language) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported language"})
		return
	}
	if strings.TrimSpace(req.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
		return
	}
	if len(req.Code) > 128*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code is too large"})
		return
	}

	submission := model.Submission{
		UserID:    user.ID,
		ProblemID: problem.ID,
		Language:  req.Language,
		Code:      req.Code,
		Status:    model.StatusPending,
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&submission).Error; err != nil {
			return err
		}
		return tx.Model(&model.Problem{}).Where("id = ?", problem.ID).
			UpdateColumn("submit_count", gorm.Expr("submit_count + ?", 1)).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create submission failed"})
		return
	}

	if err := queue.EnqueueJudge(c.Request.Context(), s.redis, s.config.JudgeQueue, submission.ID); err != nil {
		_ = s.db.Model(&submission).Update("status", model.StatusSystemError).Error
		c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue judge task failed"})
		return
	}

	submission.User = *user
	submission.Problem = problem
	c.JSON(http.StatusCreated, gin.H{"submission": toSubmissionResponse(submission, false, false, user.Role == model.RoleAdmin, true)})
}

func (s *Server) listSubmissions(c *gin.Context) {
	user, _ := currentUser(c)
	userID := uint(0)
	if queryBool(c, "mine") {
		userID = user.ID
	}
	s.listSubmissionsWithScope(c, userID)
}

func (s *Server) listProblemSubmissions(c *gin.Context) {
	user, _ := currentUser(c)

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

	query := s.db.
		Model(&model.Submission{}).
		Preload("User").
		Preload("Problem").
		Preload("Contest").
		Where("submissions.user_id = ?", user.ID).
		Where("submissions.problem_id = ?", problemID).
		Where("submissions.contest_id IS NULL")

	s.respondSubmissionList(c, query, user.Role == model.RoleAdmin, true)
}

func (s *Server) listContestProblemSubmissions(c *gin.Context) {
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
		c.JSON(http.StatusForbidden, gin.H{"error": "join contest before viewing submissions"})
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

	query := s.db.
		Model(&model.Submission{}).
		Preload("User").
		Preload("Problem").
		Preload("Contest").
		Where("submissions.user_id = ?", user.ID).
		Where("submissions.problem_id = ?", problemID).
		Where("submissions.contest_id = ?", contestID)

	s.respondSubmissionList(c, query, user.Role == model.RoleAdmin, true)
}

func (s *Server) adminListSubmissions(c *gin.Context) {
	userID := queryInt(c, "user_id", 0)
	if userID < 0 {
		userID = 0
	}
	s.listSubmissionsWithScope(c, uint(userID))
}

func (s *Server) adminRejudgeSubmission(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var submission model.Submission
	err := s.db.Preload("User").Preload("Problem").First(&submission, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query submission failed"})
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if submission.Status == model.StatusAccepted {
			if err := tx.Model(&model.Problem{}).
				Where("id = ? AND accept_count > 0", submission.ProblemID).
				UpdateColumn("accept_count", gorm.Expr("accept_count - ?", 1)).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("submission_id = ?", submission.ID).Delete(&model.SubmissionResult{}).Error; err != nil {
			return err
		}
		return tx.Model(&submission).Updates(map[string]any{
			"status":         model.StatusPending,
			"time_used_ms":   0,
			"memory_used_kb": 0,
			"error_message":  "",
		}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reset submission failed"})
		return
	}

	submission.Status = model.StatusPending
	submission.TimeUsedMS = 0
	submission.MemoryUsedKB = 0
	submission.ErrorMessage = ""
	if err := queue.EnqueueJudge(c.Request.Context(), s.redis, s.config.JudgeQueue, submission.ID); err != nil {
		_ = s.db.Model(&submission).Updates(map[string]any{
			"status":        model.StatusSystemError,
			"error_message": "enqueue judge task failed: " + err.Error(),
		}).Error
		c.JSON(http.StatusInternalServerError, gin.H{"error": "enqueue judge task failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"submission": toSubmissionResponse(submission, false, false, true, false)})
}

func (s *Server) listSubmissionsWithScope(c *gin.Context, userID uint) {
	query := s.db.
		Model(&model.Submission{}).
		Preload("User").
		Preload("Problem").
		Preload("Contest")

	// 保留 user_id 精确查询，兼容旧链接或从用户管理页跳转过来的场景
	if userID > 0 {
		query = query.Where("submissions.user_id = ?", userID)
	}

	// 保留 problem_id 精确查询，兼容旧链接
	if problemID := queryInt(c, "problem_id", 0); problemID > 0 {
		query = query.Where("submissions.problem_id = ?", problemID)
	}

	// 新增：按用户名模糊查询
	if userKeyword := strings.ToLower(strings.TrimSpace(c.Query("user_keyword"))); userKeyword != "" {
		like := "%" + userKeyword + "%"
		query = query.
			Joins("JOIN users ON users.id = submissions.user_id").
			Where("LOWER(users.username) LIKE ?", like)
	}

	// 新增：按题目标题或 slug 模糊查询
	if problemKeyword := strings.ToLower(strings.TrimSpace(c.Query("problem_keyword"))); problemKeyword != "" {
		like := "%" + problemKeyword + "%"
		query = query.
			Joins("JOIN problems ON problems.id = submissions.problem_id").
			Where("LOWER(problems.title) LIKE ? OR LOWER(problems.slug) LIKE ?", like, like)
	}

	if status := strings.TrimSpace(c.Query("status")); status != "" {
		query = query.Where("submissions.status = ?", status)
	}

	if language := strings.TrimSpace(c.Query("language")); language != "" {
		query = query.Where("submissions.language = ?", strings.ToLower(language))
	}

	s.respondSubmissionList(c, query, false, false)
}

func (s *Server) getSubmission(c *gin.Context) {
	user, _ := currentUser(c)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var submission model.Submission
	err := s.db.Preload("User").
		Preload("Problem").
		Preload("Contest").
		Preload("Results.TestCase").
		First(&submission, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "submission not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query submission failed"})
		return
	}

	isAdmin := user.Role == model.RoleAdmin
	canViewCode := submission.UserID == user.ID
	c.JSON(http.StatusOK, gin.H{"submission": toSubmissionResponse(submission, true, true, isAdmin, canViewCode)})
}

func validLanguage(language string) bool {
	switch language {
	case model.LanguageGo, model.LanguageC, model.LanguageCPP, model.LanguagePython:
		return true
	default:
		return false
	}
}

func (s *Server) respondSubmissionList(c *gin.Context, query *gorm.DB, viewerIsAdmin bool, canViewCode bool) {
	page, pageSize := pagination(c)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count submissions failed"})
		return
	}

	var submissions []model.Submission
	if err := query.
		Order("submissions.id DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&submissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query submissions failed"})
		return
	}

	items := make([]submissionResponse, 0, len(submissions))
	for _, submission := range submissions {
		items = append(items, toSubmissionResponse(submission, false, false, viewerIsAdmin, canViewCode))
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
