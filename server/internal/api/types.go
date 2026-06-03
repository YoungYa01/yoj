package api

import (
	"math"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
)

type userResponse struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

type adminUserResponse struct {
	ID              uint   `json:"id"`
	Username        string `json:"username"`
	Role            string `json:"role"`
	SubmissionCount int64  `json:"submission_count"`
	AcceptedCount   int64  `json:"accepted_count"`
	CreatedAt       string `json:"created_at"`
}

type tagResponse struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type adminTagResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	ProblemCount int64  `json:"problem_count"`
	CreatedAt    string `json:"created_at"`
}

type problemResponse struct {
	ID                uint               `json:"id"`
	Title             string             `json:"title"`
	Slug              string             `json:"slug"`
	Description       string             `json:"description,omitempty"`
	InputDescription  string             `json:"input_description,omitempty"`
	OutputDescription string             `json:"output_description,omitempty"`
	Difficulty        string             `json:"difficulty"`
	TimeLimitMS       int                `json:"time_limit_ms"`
	MemoryLimitMB     int                `json:"memory_limit_mb"`
	Hint              string             `json:"hint,omitempty"`
	IsPublished       bool               `json:"is_published"`
	SubmitCount       int64              `json:"submit_count"`
	AcceptCount       int64              `json:"accept_count"`
	PassRate          float64            `json:"pass_rate"`
	Tags              []tagResponse      `json:"tags"`
	Samples           []testCaseResponse `json:"samples,omitempty"`
	Attempted         bool               `json:"attempted"`
	Accepted          bool               `json:"accepted"`
}

type testCaseResponse struct {
	ID             uint   `json:"id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsSample       bool   `json:"is_sample"`
	SortOrder      int    `json:"sort_order"`
}

type submissionResponse struct {
	ID           uint                       `json:"id"`
	User         userResponse               `json:"user"`
	Problem      problemBriefResponse       `json:"problem"`
	Contest      *contestBriefResponse      `json:"contest,omitempty"`
	Language     string                     `json:"language"`
	Code         string                     `json:"code,omitempty"`
	CanViewCode  bool                       `json:"can_view_code"`
	Status       string                     `json:"status"`
	TimeUsedMS   int                        `json:"time_used_ms"`
	MemoryUsedKB int                        `json:"memory_used_kb"`
	ErrorMessage string                     `json:"error_message,omitempty"`
	Results      []submissionResultResponse `json:"results,omitempty"`
	CreatedAt    string                     `json:"created_at"`
}

type problemBriefResponse struct {
	ID    uint   `json:"id"`
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

type contestBriefResponse struct {
	ID    uint   `json:"id"`
	Title string `json:"title"`
}

type submissionResultResponse struct {
	ID           uint   `json:"id"`
	TestCaseID   uint   `json:"test_case_id"`
	Status       string `json:"status"`
	TimeUsedMS   int    `json:"time_used_ms"`
	MemoryUsedKB int    `json:"memory_used_kb"`
	Output       string `json:"output,omitempty"`
	Expected     string `json:"expected,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
	IsSample     bool   `json:"is_sample"`
	SortOrder    int    `json:"sort_order"`
}

func toUserResponse(user model.User) userResponse {
	return userResponse{
		ID:       user.ID,
		Username: user.Username,
		Role:     user.Role,
	}
}

func toAdminUserResponse(user model.User, submissionCount int64, acceptedCount int64) adminUserResponse {
	return adminUserResponse{
		ID:              user.ID,
		Username:        user.Username,
		Role:            user.Role,
		SubmissionCount: submissionCount,
		AcceptedCount:   acceptedCount,
		CreatedAt:       user.CreatedAt.Format("2006-01-02 15:04:05"),
	}
}

func toAdminTagResponse(tag model.Tag, problemCount int64) adminTagResponse {
	return adminTagResponse{
		ID:           tag.ID,
		Name:         tag.Name,
		ProblemCount: problemCount,
		CreatedAt:    tag.CreatedAt.Format("2006-01-02 15:04:05"),
	}
}

func toProblemResponse(problem model.Problem, attempted bool, accepted bool, includeDetail bool) problemResponse {
	tags := make([]tagResponse, 0, len(problem.Tags))
	for _, tag := range problem.Tags {
		tags = append(tags, tagResponse{ID: tag.ID, Name: tag.Name})
	}
	samples := make([]testCaseResponse, 0)
	if includeDetail {
		for _, tc := range problem.TestCases {
			if tc.IsSample {
				samples = append(samples, testCaseResponse{
					ID:             tc.ID,
					Input:          tc.Input,
					ExpectedOutput: tc.ExpectedOutput,
					IsSample:       tc.IsSample,
					SortOrder:      tc.SortOrder,
				})
			}
		}
	}

	passRate := 0.0
	if problem.SubmitCount > 0 {
		passRate = math.Round(float64(problem.AcceptCount)/float64(problem.SubmitCount)*10000) / 100
	}

	resp := problemResponse{
		ID:            problem.ID,
		Title:         problem.Title,
		Slug:          problem.Slug,
		Difficulty:    problem.Difficulty,
		TimeLimitMS:   problem.TimeLimitMS,
		MemoryLimitMB: problem.MemoryLimitMB,
		IsPublished:   problem.IsPublished,
		SubmitCount:   problem.SubmitCount,
		AcceptCount:   problem.AcceptCount,
		PassRate:      passRate,
		Tags:          tags,
		Samples:       samples,
		Attempted:     attempted,
		Accepted:      accepted,
	}
	if includeDetail {
		resp.Description = problem.Description
		resp.InputDescription = problem.InputDescription
		resp.OutputDescription = problem.OutputDescription
		resp.Hint = problem.Hint
	}
	return resp
}

func toSubmissionResponse(submission model.Submission, includeCode bool, includeResults bool, viewerIsAdmin bool, canViewCode bool) submissionResponse {
	results := make([]submissionResultResponse, 0, len(submission.Results))
	if includeResults {
		for _, result := range submission.Results {
			isSample := result.TestCase.IsSample
			item := submissionResultResponse{
				ID:           result.ID,
				TestCaseID:   result.TestCaseID,
				Status:       result.Status,
				TimeUsedMS:   result.TimeUsedMS,
				MemoryUsedKB: result.MemoryUsedKB,
				ErrorMessage: result.ErrorMessage,
				IsSample:     isSample,
				SortOrder:    result.TestCase.SortOrder,
			}
			if viewerIsAdmin || isSample {
				item.Output = result.Output
				item.Expected = result.Expected
			}
			results = append(results, item)
		}
	}

	resp := submissionResponse{
		ID:           submission.ID,
		User:         toUserResponse(submission.User),
		Problem:      problemBriefResponse{ID: submission.Problem.ID, Title: submission.Problem.Title, Slug: submission.Problem.Slug},
		Language:     submission.Language,
		CanViewCode:  canViewCode,
		Status:       submission.Status,
		TimeUsedMS:   submission.TimeUsedMS,
		MemoryUsedKB: submission.MemoryUsedKB,
		ErrorMessage: submission.ErrorMessage,
		Results:      results,
		CreatedAt:    submission.CreatedAt.Format("2006-01-02 15:04:05"),
	}
	if submission.ContestID != nil {
		resp.Contest = &contestBriefResponse{ID: *submission.ContestID, Title: submission.Contest.Title}
	}
	if includeCode && canViewCode {
		resp.Code = submission.Code
	}
	return resp
}

func parseUintParam(c *gin.Context, name string) (uint, bool) {
	value := c.Param(name)
	id, err := strconv.ParseUint(value, 10, 64)
	if err != nil || id == 0 {
		c.JSON(400, gin.H{"error": "invalid " + name})
		return 0, false
	}
	return uint(id), true
}

func pagination(c *gin.Context) (int, int) {
	page := queryInt(c, "page", 1)
	pageSize := queryInt(c, "page_size", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func queryInt(c *gin.Context, name string, fallback int) int {
	value := strings.TrimSpace(c.Query(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func queryBool(c *gin.Context, name string) bool {
	value := strings.ToLower(strings.TrimSpace(c.Query(name)))
	return value == "1" || value == "true" || value == "yes"
}
