package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
)

func (s *Server) adminDashboard(c *gin.Context) {
	var userCount int64
	var problemCount int64
	var publishedProblemCount int64
	var submissionCount int64
	var acceptedSubmissionCount int64
	var pendingSubmissionCount int64
	var judgingSubmissionCount int64

	if err := s.db.Model(&model.User{}).Count(&userCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count users failed"})
		return
	}
	if err := s.db.Model(&model.Problem{}).Count(&problemCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count problems failed"})
		return
	}
	if err := s.db.Model(&model.Problem{}).Where("is_published = ?", true).Count(&publishedProblemCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count published problems failed"})
		return
	}
	if err := s.db.Model(&model.Submission{}).Count(&submissionCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count submissions failed"})
		return
	}
	if err := s.db.Model(&model.Submission{}).Where("status = ?", model.StatusAccepted).Count(&acceptedSubmissionCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count accepted submissions failed"})
		return
	}
	if err := s.db.Model(&model.Submission{}).Where("status = ?", model.StatusPending).Count(&pendingSubmissionCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count pending submissions failed"})
		return
	}
	if err := s.db.Model(&model.Submission{}).Where("status = ?", model.StatusJudging).Count(&judgingSubmissionCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count judging submissions failed"})
		return
	}

	var recentSubmissions []model.Submission
	if err := s.db.Preload("User").Preload("Problem").Preload("Contest").
		Order("id DESC").
		Limit(8).
		Find(&recentSubmissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query recent submissions failed"})
		return
	}

	recentItems := make([]submissionResponse, 0, len(recentSubmissions))
	for _, submission := range recentSubmissions {
		recentItems = append(recentItems, toSubmissionResponse(submission, false, false, true, false))
	}

	judgeQueueStats, _ := s.judgeQueue.Stats(c.Request.Context())
	passRate := 0.0
	if submissionCount > 0 {
		passRate = float64(acceptedSubmissionCount) / float64(submissionCount) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"stats": gin.H{
			"user_count":                userCount,
			"problem_count":             problemCount,
			"published_problem_count":   publishedProblemCount,
			"submission_count":          submissionCount,
			"accepted_submission_count": acceptedSubmissionCount,
			"pending_submission_count":  pendingSubmissionCount,
			"judging_submission_count":  judgingSubmissionCount,
			"judge_queue_length":        judgeQueueStats.Broker.Ready,
			"judge_queue_consumers":     judgeQueueStats.Broker.Consumers,
			"judge_capacity_in_use":     judgeQueueStats.Capacity.InUse,
			"judge_capacity_max":        judgeQueueStats.Capacity.Max,
			"judge_capacity_left":       judgeQueueStats.Capacity.Available,
			"judge_circuit_open":        judgeQueueStats.Capacity.InUse >= judgeQueueStats.Capacity.Max,
			"pass_rate":                 passRate,
			"generated_at":              time.Now().Format("2006-01-02 15:04:05"),
		},
		"recent_submissions": recentItems,
	})
}
