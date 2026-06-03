package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/auth"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type authRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) register(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if len(req.Username) < 3 || len(req.Username) > 32 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username length must be 3-32"})
		return
	}
	if len(req.Password) < 6 || len(req.Password) > 72 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password length must be 6-72"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash password failed"})
		return
	}

	user := model.User{
		Username:     req.Username,
		PasswordHash: hash,
		Role:         model.RoleUser,
	}
	if err := s.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Role, s.config.JWTSecret, s.config.JWTExpireHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate token failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token": token,
		"user":  toUserResponse(user),
	})
}

func (s *Server) login(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	var user model.User
	err := s.db.Where("username = ?", req.Username).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query user failed"})
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Role, s.config.JWTSecret, s.config.JWTExpireHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate token failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  toUserResponse(user),
	})
}

func (s *Server) me(c *gin.Context) {
	user, _ := currentUser(c)
	c.JSON(http.StatusOK, gin.H{"user": toUserResponse(*user)})
}
