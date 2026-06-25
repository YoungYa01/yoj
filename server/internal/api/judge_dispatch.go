package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/queue"
)

func (s *Server) acquireJudgeAdmission(c *gin.Context) (*queue.Admission, bool) {
	admission, stats, err := s.judgeQueue.Acquire(c.Request.Context())
	if err == nil {
		return admission, true
	}

	if errors.Is(err, queue.ErrCapacityExceeded) {
		retryAfter := s.judgeQueue.RetryAfterSecond()
		c.Header("Retry-After", strconv.Itoa(retryAfter))
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":       "judge service is busy, please retry later",
			"code":        "JUDGE_CAPACITY_EXCEEDED",
			"in_flight":   stats.InUse,
			"capacity":    stats.Max,
			"retry_after": retryAfter,
		})
		return nil, false
	}

	c.JSON(http.StatusServiceUnavailable, gin.H{
		"error": "judge admission service unavailable",
		"code":  "JUDGE_ADMISSION_UNAVAILABLE",
	})
	return nil, false
}

func (s *Server) publishJudgeSubmission(admission *queue.Admission, submissionID uint) error {
	// RabbitPublisher applies two independent timeouts:
	// 1. waiting for a free publish channel;
	// 2. publishing and waiting for the broker confirm.
	//
	// Do not start one shared timeout before the local channel wait, otherwise
	// concurrent requests at the back of the queue can expire without
	// publishing anything.
	return s.judgeQueue.Publish(context.Background(), admission, submissionID)
}

func (s *Server) releaseJudgeAdmission(admission *queue.Admission) {
	if admission == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_ = s.judgeQueue.Release(ctx, admission)
}
