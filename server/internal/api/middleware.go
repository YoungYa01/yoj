package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/auth"
	"github.com/yoj/yoj/server/internal/model"
)

const currentUserKey = "current_user"

func (s *Server) authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := s.userFromAuthorization(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Set(currentUserKey, user)
		c.Next()
	}
}

func (s *Server) optionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if user, ok := s.userFromAuthorization(c); ok {
			c.Set(currentUserKey, user)
		}
		c.Next()
	}
}

func (s *Server) adminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := currentUser(c)
		if !ok || user.Role != model.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin permission required"})
			return
		}
		c.Next()
	}
}

func (s *Server) userFromAuthorization(c *gin.Context) (*model.User, bool) {
	header := strings.TrimSpace(c.GetHeader("Authorization"))
	if header == "" {
		return nil, false
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return nil, false
	}
	claims, err := auth.ParseToken(parts[1], s.config.JWTSecret)
	if err != nil {
		return nil, false
	}
	var user model.User
	if err := s.db.First(&user, claims.UserID).Error; err != nil {
		return nil, false
	}
	return &user, true
}

func currentUser(c *gin.Context) (*model.User, bool) {
	value, exists := c.Get(currentUserKey)
	if !exists {
		return nil, false
	}
	user, ok := value.(*model.User)
	return user, ok
}
