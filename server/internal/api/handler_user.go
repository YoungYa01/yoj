package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type updateUserRoleRequest struct {
	Role string `json:"role"`
}

func (s *Server) adminListUsers(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.User{})

	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("username LIKE ?", "%"+keyword+"%")
	}
	if role := strings.TrimSpace(c.Query("role")); role != "" {
		query = query.Where("role = ?", role)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count users failed"})
		return
	}

	var users []model.User
	if err := query.Order("id ASC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query users failed"})
		return
	}

	ids := make([]uint, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.ID)
	}

	submissionCounts := map[uint]int64{}
	acceptedCounts := map[uint]int64{}
	if len(ids) > 0 {
		var submissionRows []struct {
			UserID uint
			Count  int64
		}
		if err := s.db.Model(&model.Submission{}).
			Select("user_id, COUNT(*) AS count").
			Where("user_id IN ?", ids).
			Group("user_id").
			Find(&submissionRows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "count submissions failed"})
			return
		}
		for _, row := range submissionRows {
			submissionCounts[row.UserID] = row.Count
		}

		var acceptedRows []struct {
			UserID uint
			Count  int64
		}
		if err := s.db.Model(&model.Submission{}).
			Select("user_id, COUNT(*) AS count").
			Where("user_id IN ? AND status = ?", ids, model.StatusAccepted).
			Group("user_id").
			Find(&acceptedRows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "count accepted submissions failed"})
			return
		}
		for _, row := range acceptedRows {
			acceptedCounts[row.UserID] = row.Count
		}
	}

	items := make([]adminUserResponse, 0, len(users))
	for _, user := range users {
		items = append(items, toAdminUserResponse(user, submissionCounts[user.ID], acceptedCounts[user.ID]))
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func (s *Server) adminUpdateUserRole(c *gin.Context) {
	current, _ := currentUser(c)
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req updateUserRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	req.Role = strings.TrimSpace(req.Role)
	if req.Role != model.RoleUser && req.Role != model.RoleAdmin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	if current.ID == id && req.Role != model.RoleAdmin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot remove your own admin role"})
		return
	}

	var user model.User
	err := s.db.First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query user failed"})
		return
	}

	if err := s.db.Model(&user).Update("role", req.Role).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update user role failed"})
		return
	}
	user.Role = req.Role

	c.JSON(http.StatusOK, gin.H{"user": toAdminUserResponse(user, 0, 0)})
}
