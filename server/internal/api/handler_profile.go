package api

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/auth"
	"github.com/yoj/yoj/server/internal/model"
)

const maxProfileImageBytes = 3 << 20 // 3 MiB

type updateProfileRequest struct {
	Nickname string `json:"nickname"`
}

type changePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

type profileStatsResponse struct {
	TotalSubmissions    int64 `json:"total_submissions"`
	AcceptedSubmissions int64 `json:"accepted_submissions"`
	SolvedProblems      int64 `json:"solved_problems"`
	ActiveDays          int64 `json:"active_days"`
}

type activityDayResponse struct {
	Date                string `json:"date"`
	Submissions         int64  `json:"submissions"`
	AcceptedSubmissions int64  `json:"accepted_submissions"`
	Solved              int64  `json:"solved"`
}

func (s *Server) getMyProfile(c *gin.Context) {
	user, _ := currentUser(c)

	stats, err := s.profileStats(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query profile stats failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user":  toUserResponse(*user),
		"stats": stats,
	})
}

func (s *Server) updateMyProfile(c *gin.Context) {
	user, _ := currentUser(c)

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	req.Nickname = strings.TrimSpace(req.Nickname)

	if len([]rune(req.Nickname)) > 32 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nickname length must be <= 32"})
		return
	}

	if err := s.db.Model(user).Update("nickname", req.Nickname).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update profile failed"})
		return
	}

	user.Nickname = req.Nickname

	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(*user)})
}

func (s *Server) uploadMyAvatar(c *gin.Context) {
	s.uploadMyProfileImage(c, "avatar")
}

func (s *Server) uploadMyCover(c *gin.Context) {
	s.uploadMyProfileImage(c, "cover")
}

func (s *Server) uploadMyProfileImage(c *gin.Context, kind string) {
	user, _ := currentUser(c)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}

	if fileHeader.Size <= 0 || fileHeader.Size > maxProfileImageBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image size must be <= 3MB"})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "open image failed"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxProfileImageBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "read image failed"})
		return
	}

	if len(data) > maxProfileImageBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image size must be <= 3MB"})
		return
	}

	contentType := http.DetectContentType(data)
	ext, ok := profileImageExt(contentType)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only jpg, png, webp or gif images are allowed"})
		return
	}

	userDir := filepath.Join("uploads", "profiles", strconv.FormatUint(uint64(user.ID), 10))
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create upload directory failed"})
		return
	}

	filename := kind + ext
	dstPath := filepath.Join(userDir, filename)

	if err := os.WriteFile(dstPath, data, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save image failed"})
		return
	}

	publicPath := "/" + filepath.ToSlash(dstPath)

	column := "avatar_url"
	if kind == "cover" {
		column = "cover_url"
	}

	if err := s.db.Model(user).Update(column, publicPath).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update image failed"})
		return
	}

	if kind == "cover" {
		user.CoverURL = publicPath
	} else {
		user.AvatarURL = publicPath
	}

	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(*user)})
}

func profileImageExt(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	case "image/gif":
		return ".gif", true
	default:
		return "", false
	}
}

func (s *Server) changeMyPassword(c *gin.Context) {
	user, _ := currentUser(c)

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if len(req.NewPassword) < 6 || len(req.NewPassword) > 72 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "new password length must be 6-72"})
		return
	}

	if !auth.CheckPassword(user.PasswordHash, req.OldPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old password is incorrect"})
		return
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password failed"})
		return
	}

	if err := s.db.Model(user).Update("password_hash", hash).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update password failed"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (s *Server) getMyActivity(c *gin.Context) {
	user, _ := currentUser(c)

	days := queryInt(c, "days", 365)
	if days < 1 {
		days = 365
	}
	if days > 366 {
		days = 366
	}

	now := time.Now().In(time.Local)
	start := now.AddDate(0, 0, -days+1)
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.Local)

	type activityRow struct {
		Date                string `gorm:"column:date"`
		Submissions         int64  `gorm:"column:submissions"`
		AcceptedSubmissions int64  `gorm:"column:accepted_submissions"`
		Solved              int64  `gorm:"column:solved"`
	}

	var rows []activityRow
	if err := s.db.Model(&model.Submission{}).
		Select(`
			DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
			COUNT(*) AS submissions,
			COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS accepted_submissions,
			COUNT(DISTINCT CASE WHEN status = ? THEN problem_id END) AS solved
		`, model.StatusAccepted, model.StatusAccepted).
		Where("user_id = ? AND created_at >= ?", user.ID, start).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query activity failed"})
		return
	}

	rowMap := make(map[string]activityRow, len(rows))
	for _, row := range rows {
		rowMap[row.Date] = row
	}

	items := make([]activityDayResponse, 0, days)
	activeDays := int64(0)

	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i).Format("2006-01-02")
		row := rowMap[day]

		if row.Submissions > 0 {
			activeDays++
		}

		items = append(items, activityDayResponse{
			Date:                day,
			Submissions:         row.Submissions,
			AcceptedSubmissions: row.AcceptedSubmissions,
			Solved:              row.Solved,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"items":       items,
		"active_days": activeDays,
	})
}

func (s *Server) profileStats(userID uint) (profileStatsResponse, error) {
	var stats profileStatsResponse

	if err := s.db.Model(&model.Submission{}).
		Where("user_id = ?", userID).
		Count(&stats.TotalSubmissions).Error; err != nil {
		return stats, err
	}

	if err := s.db.Model(&model.Submission{}).
		Where("user_id = ? AND status = ?", userID, model.StatusAccepted).
		Count(&stats.AcceptedSubmissions).Error; err != nil {
		return stats, err
	}

	if err := s.db.Model(&model.Submission{}).
		Select("COUNT(DISTINCT problem_id)").
		Where("user_id = ? AND status = ?", userID, model.StatusAccepted).
		Scan(&stats.SolvedProblems).Error; err != nil {
		return stats, err
	}

	if err := s.db.Model(&model.Submission{}).
		Select("COUNT(DISTINCT DATE(created_at))").
		Where("user_id = ?", userID).
		Scan(&stats.ActiveDays).Error; err != nil {
		return stats, err
	}

	return stats, nil
}
