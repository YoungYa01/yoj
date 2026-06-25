package api

import (
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type contestProblemRequest struct {
	ProblemID uint `json:"problem_id"`
	SortOrder int  `json:"sort_order"`
	Score     int  `json:"score"`
}

type contestRequest struct {
	Title       string                  `json:"title"`
	Description string                  `json:"description"`
	StartTime   string                  `json:"start_time"`
	EndTime     string                  `json:"end_time"`
	IsPublic    bool                    `json:"is_public"`
	Problems    []contestProblemRequest `json:"problems"`
}

type contestResponse struct {
	ID               uint                     `json:"id"`
	Title            string                   `json:"title"`
	Description      string                   `json:"description,omitempty"`
	StartTime        string                   `json:"start_time"`
	EndTime          string                   `json:"end_time"`
	Status           string                   `json:"status"`
	IsPublic         bool                     `json:"is_public"`
	ProblemCount     int                      `json:"problem_count"`
	ParticipantCount int                      `json:"participant_count"`
	Joined           bool                     `json:"joined"`
	Problems         []contestProblemResponse `json:"problems,omitempty"`
	CreatedAt        string                   `json:"created_at"`
}

type contestProblemResponse struct {
	ID        uint                 `json:"id"`
	ProblemID uint                 `json:"problem_id"`
	SortOrder int                  `json:"sort_order"`
	Score     int                  `json:"score"`
	Problem   problemBriefResponse `json:"problem"`
}

type contestStandingRow struct {
	Rank                int                              `json:"rank"`
	User                userResponse                     `json:"user"`
	Solved              int                              `json:"solved"`
	TotalPenaltySeconds int64                            `json:"total_penalty_seconds"`
	Problems            []contestStandingProblemResponse `json:"problems"`
}

type contestStandingProblemResponse struct {
	ProblemID            uint   `json:"problem_id"`
	Attempts             int    `json:"attempts"`
	Accepted             bool   `json:"accepted"`
	AcceptedAt           string `json:"accepted_at,omitempty"`
	PenaltySeconds       int64  `json:"penalty_seconds"`
	BestSubmissionID     uint   `json:"best_submission_id,omitempty"`
	LastSubmissionID     uint   `json:"last_submission_id,omitempty"`
	LastSubmissionStatus string `json:"last_submission_status,omitempty"`
}

func (s *Server) listContests(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.Contest{})
	if user, ok := currentUser(c); ok {
		joinedIDs := s.joinedContestIDs(user.ID)
		if len(joinedIDs) > 0 {
			query = query.Where("is_public = ? OR id IN ?", true, joinedIDs)
		} else {
			query = query.Where("is_public = ?", true)
		}
	} else {
		query = query.Where("is_public = ?", true)
	}

	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("title LIKE ?", "%"+keyword+"%")
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		now := time.Now()
		switch status {
		case "upcoming":
			query = query.Where("start_time > ?", now)
		case "running":
			query = query.Where("start_time <= ? AND end_time > ?", now, now)
		case "ended":
			query = query.Where("end_time <= ?", now)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count contests failed"})
		return
	}

	var contests []model.Contest
	if err := query.Order("start_time DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&contests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contests failed"})
		return
	}

	joined := s.joinedContestMap(c, contests)
	counts := s.contestCountMaps(contests)
	items := make([]contestResponse, 0, len(contests))
	for _, contest := range contests {
		items = append(items, toContestResponse(contest, false, joined[contest.ID], counts.problemCounts[contest.ID], counts.participantCounts[contest.ID]))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (s *Server) getContest(c *gin.Context) {
	contest, ok := s.findVisibleContest(c)
	if !ok {
		return
	}
	joined := s.isContestJoined(c, contest.ID)
	counts := s.contestCountMaps([]model.Contest{contest})
	c.JSON(http.StatusOK, gin.H{
		"contest": toContestResponse(contest, true, joined, counts.problemCounts[contest.ID], counts.participantCounts[contest.ID]),
	})
}

func (s *Server) joinContest(c *gin.Context) {
	user, _ := currentUser(c)
	contest, ok := s.findVisibleContest(c)
	if !ok {
		return
	}
	if !contest.IsPublic && user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "private contest requires invitation"})
		return
	}
	if !contest.EndTime.After(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "contest already ended"})
		return
	}

	participant := model.ContestParticipant{ContestID: contest.ID, UserID: user.ID}
	if err := s.db.FirstOrCreate(&participant, model.ContestParticipant{ContestID: contest.ID, UserID: user.ID}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "join contest failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"joined": true})
}

func (s *Server) getContestProblem(c *gin.Context) {
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
	if err := s.db.First(&contest, contestID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}
	if user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "join contest before viewing problems"})
		return
	}

	var contestProblem model.ContestProblem
	err := s.db.Preload("Problem.Tags").
		Preload("Problem.TestCases", "is_sample = ?", true).
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

	c.JSON(http.StatusOK, gin.H{
		"contest":         toContestResponse(contest, false, true, 0, 0),
		"contest_problem": toContestProblemResponse(contestProblem),
		"problem":         toProblemResponse(contestProblem.Problem, false, false, true),
	})
}

func (s *Server) submitContestProblem(c *gin.Context) {
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
	if err := s.db.First(&contest, contestID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}
	if !contest.IsPublic && user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied"})
		return
	}
	now := time.Now()
	if now.Before(contest.StartTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "contest has not started"})
		return
	}
	if !now.Before(contest.EndTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "contest already ended"})
		return
	}
	if user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "join contest before submitting"})
		return
	}

	var contestProblem model.ContestProblem
	if err := s.db.Preload("Problem").
		Where("contest_id = ? AND problem_id = ?", contest.ID, problemID).
		First(&contestProblem).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "problem not found in contest"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest problem failed"})
		return
	}
	if !contestProblem.Problem.IsPublished && user.Role != model.RoleAdmin {
		c.JSON(http.StatusNotFound, gin.H{"error": "problem not found"})
		return
	}

	admission, ok := s.acquireJudgeAdmission(c)
	if !ok {
		return
	}

	published := false
	defer func() {
		if !published {
			s.releaseJudgeAdmission(admission)
		}
	}()

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
		ProblemID: problemID,
		ContestID: &contest.ID,
		Language:  req.Language,
		Code:      req.Code,
		Status:    model.StatusPending,
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&submission).Error; err != nil {
			return err
		}
		return tx.Model(&model.Problem{}).Where("id = ?", problemID).
			UpdateColumn("submit_count", gorm.Expr("submit_count + ?", 1)).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create submission failed"})
		return
	}

	if err := s.publishJudgeSubmission(admission, submission.ID); err != nil {
		_ = s.db.Model(&submission).Updates(map[string]any{
			"status":        model.StatusSystemError,
			"error_message": "publish judge task failed: " + err.Error(),
		}).Error

		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "judge queue unavailable",
			"code":  "JUDGE_QUEUE_UNAVAILABLE",
		})
		return
	}

	published = true

	submission.User = *user
	submission.Problem = contestProblem.Problem
	submission.Contest = contest
	c.JSON(http.StatusCreated, gin.H{"submission": toSubmissionResponse(submission, false, false, user.Role == model.RoleAdmin, true)})
}

func (s *Server) getContestStandings(c *gin.Context) {
	contest, ok := s.findVisibleContest(c)
	if !ok {
		return
	}

	var contestProblems []model.ContestProblem
	if err := s.db.Preload("Problem").
		Where("contest_id = ?", contest.ID).
		Order("sort_order ASC, id ASC").
		Find(&contestProblems).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest problems failed"})
		return
	}

	var participants []model.ContestParticipant
	if err := s.db.Preload("User").
		Where("contest_id = ?", contest.ID).
		Order("created_at ASC").
		Find(&participants).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query participants failed"})
		return
	}
	joinedAtByUser := map[uint]time.Time{}
	for _, participant := range participants {
		joinedAtByUser[participant.UserID] = participant.CreatedAt
	}

	problemIDs := make([]uint, 0, len(contestProblems))
	for _, item := range contestProblems {
		problemIDs = append(problemIDs, item.ProblemID)
	}

	rows := make([]contestStandingRow, 0, len(participants))
	rowByUser := map[uint]*contestStandingRow{}
	for _, participant := range participants {
		row := contestStandingRow{
			User:     toUserResponse(participant.User),
			Problems: make([]contestStandingProblemResponse, 0, len(contestProblems)),
		}
		for _, item := range contestProblems {
			row.Problems = append(row.Problems, contestStandingProblemResponse{ProblemID: item.ProblemID})
		}
		rows = append(rows, row)
		rowByUser[participant.UserID] = &rows[len(rows)-1]
	}

	var submissions []model.Submission
	if len(problemIDs) > 0 {
		if err := s.db.Where("contest_id = ? AND problem_id IN ? AND created_at >= ? AND created_at < ?", contest.ID, problemIDs, contest.StartTime, contest.EndTime).
			Order("created_at ASC, id ASC").
			Find(&submissions).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest submissions failed"})
			return
		}
	}

	problemIndex := map[uint]int{}
	for index, item := range contestProblems {
		problemIndex[item.ProblemID] = index
	}
	for _, submission := range submissions {
		row, exists := rowByUser[submission.UserID]
		if !exists {
			continue
		}
		if joinedAt, exists := joinedAtByUser[submission.UserID]; exists && submission.CreatedAt.Before(joinedAt) {
			continue
		}
		index, exists := problemIndex[submission.ProblemID]
		if !exists {
			continue
		}
		cell := &row.Problems[index]
		if cell.Accepted {
			continue
		}
		cell.Attempts++
		cell.LastSubmissionID = submission.ID
		cell.LastSubmissionStatus = submission.Status
		if submission.Status == model.StatusAccepted {
			cell.Accepted = true
			cell.AcceptedAt = submission.CreatedAt.Format("2006-01-02 15:04:05")
			cell.PenaltySeconds = maxInt64(0, int64(submission.CreatedAt.Sub(contest.StartTime).Seconds()))
			cell.BestSubmissionID = submission.ID
			row.Solved++
			row.TotalPenaltySeconds += cell.PenaltySeconds
		}
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Solved != rows[j].Solved {
			return rows[i].Solved > rows[j].Solved
		}
		if rows[i].TotalPenaltySeconds != rows[j].TotalPenaltySeconds {
			return rows[i].TotalPenaltySeconds < rows[j].TotalPenaltySeconds
		}
		return rows[i].User.Username < rows[j].User.Username
	})
	for i := range rows {
		rows[i].Rank = i + 1
	}

	problems := make([]contestProblemResponse, 0, len(contestProblems))
	for _, item := range contestProblems {
		problems = append(problems, toContestProblemResponse(item))
	}

	c.JSON(http.StatusOK, gin.H{
		"contest":   toContestResponse(contest, false, s.isContestJoined(c, contest.ID), len(contestProblems), len(participants)),
		"problems":  problems,
		"standings": rows,
	})
}

func (s *Server) adminListContests(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.Contest{})
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("title LIKE ?", "%"+keyword+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count contests failed"})
		return
	}

	var contests []model.Contest
	if err := query.Order("start_time DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&contests).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contests failed"})
		return
	}
	counts := s.contestCountMaps(contests)
	items := make([]contestResponse, 0, len(contests))
	for _, contest := range contests {
		items = append(items, toContestResponse(contest, false, false, counts.problemCounts[contest.ID], counts.participantCounts[contest.ID]))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (s *Server) adminGetContest(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var contest model.Contest
	err := s.db.Preload("Problems.Problem").Preload("Participants").First(&contest, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"contest": toContestResponse(contest, true, false, len(contest.Problems), len(contest.Participants))})
}

func (s *Server) adminCreateContest(c *gin.Context) {
	user, _ := currentUser(c)
	req, contest, ok := s.bindContestRequest(c)
	if !ok {
		return
	}
	contest.CreatedByID = user.ID

	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&contest).Error; err != nil {
			return err
		}
		return replaceContestProblems(tx, contest.ID, req.Problems)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create contest failed"})
		return
	}

	if err := s.db.Preload("Problems.Problem").First(&contest, contest.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"contest": toContestResponse(contest, true, false, len(contest.Problems), 0)})
}

func (s *Server) adminUpdateContest(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	req, next, ok := s.bindContestRequest(c)
	if !ok {
		return
	}

	var contest model.Contest
	err := s.db.First(&contest, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&contest).Updates(map[string]any{
			"title":       next.Title,
			"description": next.Description,
			"start_time":  next.StartTime,
			"end_time":    next.EndTime,
			"is_public":   next.IsPublic,
		}).Error; err != nil {
			return err
		}
		return replaceContestProblems(tx, contest.ID, req.Problems)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update contest failed"})
		return
	}

	if err := s.db.Preload("Problems.Problem").Preload("Participants").First(&contest, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"contest": toContestResponse(contest, true, false, len(contest.Problems), len(contest.Participants))})
}

func (s *Server) adminDeleteContest(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := s.db.Delete(&model.Contest{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete contest failed"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) bindContestRequest(c *gin.Context) (contestRequest, model.Contest, bool) {
	var req contestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return req, model.Contest{}, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return req, model.Contest{}, false
	}
	startTime, err := parseLocalTime(req.StartTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid start_time"})
		return req, model.Contest{}, false
	}
	endTime, err := parseLocalTime(req.EndTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid end_time"})
		return req, model.Contest{}, false
	}
	if !endTime.After(startTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "end_time must be after start_time"})
		return req, model.Contest{}, false
	}

	seen := map[uint]bool{}
	for i := range req.Problems {
		if req.Problems[i].ProblemID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "problem_id is required"})
			return req, model.Contest{}, false
		}
		if seen[req.Problems[i].ProblemID] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate problem_id"})
			return req, model.Contest{}, false
		}
		seen[req.Problems[i].ProblemID] = true
		if req.Problems[i].SortOrder <= 0 {
			req.Problems[i].SortOrder = i + 1
		}
		if req.Problems[i].Score <= 0 {
			req.Problems[i].Score = 100
		}
	}
	if len(req.Problems) > 0 {
		ids := make([]uint, 0, len(req.Problems))
		for _, item := range req.Problems {
			ids = append(ids, item.ProblemID)
		}
		var count int64
		if err := s.db.Model(&model.Problem{}).Where("id IN ?", ids).Count(&count).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "query problems failed"})
			return req, model.Contest{}, false
		}
		if int(count) != len(ids) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "some problems do not exist"})
			return req, model.Contest{}, false
		}
	}

	return req, model.Contest{
		Title:       req.Title,
		Description: req.Description,
		StartTime:   startTime,
		EndTime:     endTime,
		IsPublic:    req.IsPublic,
	}, true
}

func replaceContestProblems(tx *gorm.DB, contestID uint, items []contestProblemRequest) error {
	if err := tx.Unscoped().Where("contest_id = ?", contestID).Delete(&model.ContestProblem{}).Error; err != nil {
		return err
	}
	for _, item := range items {
		contestProblem := model.ContestProblem{
			ContestID: contestID,
			ProblemID: item.ProblemID,
			SortOrder: item.SortOrder,
			Score:     item.Score,
		}
		if err := tx.Create(&contestProblem).Error; err != nil {
			return err
		}
	}
	return nil
}

type contestCounts struct {
	problemCounts     map[uint]int
	participantCounts map[uint]int
}

func (s *Server) contestCountMaps(contests []model.Contest) contestCounts {
	counts := contestCounts{problemCounts: map[uint]int{}, participantCounts: map[uint]int{}}
	if len(contests) == 0 {
		return counts
	}
	ids := make([]uint, 0, len(contests))
	for _, contest := range contests {
		ids = append(ids, contest.ID)
	}
	var problemRows []struct {
		ContestID uint
		Count     int
	}
	_ = s.db.Model(&model.ContestProblem{}).
		Select("contest_id, COUNT(*) AS count").
		Where("contest_id IN ?", ids).
		Group("contest_id").
		Find(&problemRows).Error
	for _, row := range problemRows {
		counts.problemCounts[row.ContestID] = row.Count
	}

	var participantRows []struct {
		ContestID uint
		Count     int
	}
	_ = s.db.Model(&model.ContestParticipant{}).
		Select("contest_id, COUNT(*) AS count").
		Where("contest_id IN ?", ids).
		Group("contest_id").
		Find(&participantRows).Error
	for _, row := range participantRows {
		counts.participantCounts[row.ContestID] = row.Count
	}
	return counts
}

func (s *Server) joinedContestMap(c *gin.Context, contests []model.Contest) map[uint]bool {
	joined := map[uint]bool{}
	user, ok := currentUser(c)
	if !ok || len(contests) == 0 {
		return joined
	}
	ids := make([]uint, 0, len(contests))
	for _, contest := range contests {
		ids = append(ids, contest.ID)
	}
	var rows []model.ContestParticipant
	if err := s.db.Where("user_id = ? AND contest_id IN ?", user.ID, ids).Find(&rows).Error; err != nil {
		return joined
	}
	for _, row := range rows {
		joined[row.ContestID] = true
	}
	return joined
}

func (s *Server) joinedContestIDs(userID uint) []uint {
	var rows []model.ContestParticipant
	if err := s.db.Where("user_id = ?", userID).Find(&rows).Error; err != nil {
		return nil
	}
	ids := make([]uint, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ContestID)
	}
	return ids
}

func (s *Server) isContestJoined(c *gin.Context, contestID uint) bool {
	user, ok := currentUser(c)
	if !ok {
		return false
	}
	return s.isContestJoinedByUser(contestID, user.ID)
}

func (s *Server) isContestJoinedByUser(contestID uint, userID uint) bool {
	var count int64
	if err := s.db.Model(&model.ContestParticipant{}).
		Where("contest_id = ? AND user_id = ?", contestID, userID).
		Count(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func (s *Server) findVisibleContest(c *gin.Context) (model.Contest, bool) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return model.Contest{}, false
	}
	var contest model.Contest
	err := s.db.Preload("Problems.Problem").First(&contest, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "contest not found"})
		return model.Contest{}, false
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query contest failed"})
		return model.Contest{}, false
	}
	user, hasUser := currentUser(c)
	if !contest.IsPublic && (!hasUser || (user.Role != model.RoleAdmin && !s.isContestJoinedByUser(contest.ID, user.ID))) {
		c.JSON(http.StatusForbidden, gin.H{"error": "permission denied"})
		return model.Contest{}, false
	}
	return contest, true
}

func toContestResponse(contest model.Contest, includeProblems bool, joined bool, problemCount int, participantCount int) contestResponse {
	problems := make([]contestProblemResponse, 0, len(contest.Problems))
	if includeProblems {
		sort.Slice(contest.Problems, func(i, j int) bool {
			if contest.Problems[i].SortOrder != contest.Problems[j].SortOrder {
				return contest.Problems[i].SortOrder < contest.Problems[j].SortOrder
			}
			return contest.Problems[i].ID < contest.Problems[j].ID
		})
		for _, item := range contest.Problems {
			problems = append(problems, toContestProblemResponse(item))
		}
	}
	return contestResponse{
		ID:               contest.ID,
		Title:            contest.Title,
		Description:      contest.Description,
		StartTime:        contest.StartTime.Format("2006-01-02 15:04:05"),
		EndTime:          contest.EndTime.Format("2006-01-02 15:04:05"),
		Status:           contestStatus(contest),
		IsPublic:         contest.IsPublic,
		ProblemCount:     problemCount,
		ParticipantCount: participantCount,
		Joined:           joined,
		Problems:         problems,
		CreatedAt:        contest.CreatedAt.Format("2006-01-02 15:04:05"),
	}
}

func toContestProblemResponse(item model.ContestProblem) contestProblemResponse {
	return contestProblemResponse{
		ID:        item.ID,
		ProblemID: item.ProblemID,
		SortOrder: item.SortOrder,
		Score:     item.Score,
		Problem: problemBriefResponse{
			ID:    item.Problem.ID,
			Title: item.Problem.Title,
			Slug:  item.Problem.Slug,
		},
	}
}

func contestStatus(contest model.Contest) string {
	now := time.Now()
	if now.Before(contest.StartTime) {
		return "upcoming"
	}
	if now.Before(contest.EndTime) {
		return "running"
	}
	return "ended"
}

func parseLocalTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	var lastErr error
	for _, layout := range layouts {
		parsed, err := time.ParseInLocation(layout, value, time.Local)
		if err == nil {
			return parsed, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
