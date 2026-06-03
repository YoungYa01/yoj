package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yoj/yoj/server/internal/model"
	"gorm.io/gorm"
)

type tagRequest struct {
	Name string `json:"name"`
}

type publicTagResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	ProblemCount int64  `json:"problem_count"`
}

func (s *Server) listTags(c *gin.Context) {
	var tags []model.Tag
	if err := s.db.Order("name ASC").Find(&tags).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query tags failed"})
		return
	}

	counts, err := s.publishedTagProblemCounts(tags)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count tag problems failed"})
		return
	}

	items := make([]publicTagResponse, 0, len(tags))
	for _, tag := range tags {
		if counts[tag.ID] == 0 {
			continue
		}
		items = append(items, publicTagResponse{
			ID:           tag.ID,
			Name:         tag.Name,
			ProblemCount: counts[tag.ID],
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *Server) adminListTags(c *gin.Context) {
	page, pageSize := pagination(c)
	query := s.db.Model(&model.Tag{})

	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("name LIKE ?", "%"+keyword+"%")
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count tags failed"})
		return
	}

	var tags []model.Tag
	if err := query.Order("id ASC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&tags).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query tags failed"})
		return
	}

	counts, err := s.tagProblemCounts(tags)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count tag problems failed"})
		return
	}

	items := make([]adminTagResponse, 0, len(tags))
	for _, tag := range tags {
		items = append(items, toAdminTagResponse(tag, counts[tag.ID]))
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

func (s *Server) adminCreateTag(c *gin.Context) {
	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if len(name) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is too long"})
		return
	}

	tag := model.Tag{Name: name}
	if err := s.db.Create(&tag).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "tag already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"tag": toAdminTagResponse(tag, 0)})
}

func (s *Server) adminUpdateTag(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	if len(name) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is too long"})
		return
	}

	var tag model.Tag
	err := s.db.First(&tag, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tag not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query tag failed"})
		return
	}

	if err := s.db.Model(&tag).Update("name", name).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "tag name already exists"})
		return
	}
	tag.Name = name

	counts, err := s.tagProblemCounts([]model.Tag{tag})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "count tag problems failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tag": toAdminTagResponse(tag, counts[tag.ID])})
}

func (s *Server) adminDeleteTag(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var tag model.Tag
	err := s.db.First(&tag, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tag not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "query tag failed"})
		return
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("DELETE FROM problem_tags WHERE tag_id = ?", tag.ID).Error; err != nil {
			return err
		}
		return tx.Unscoped().Delete(&tag).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete tag failed"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (s *Server) tagProblemCounts(tags []model.Tag) (map[uint]int64, error) {
	counts := map[uint]int64{}
	if len(tags) == 0 {
		return counts, nil
	}

	ids := make([]uint, 0, len(tags))
	for _, tag := range tags {
		ids = append(ids, tag.ID)
	}

	var rows []struct {
		TagID uint
		Count int64
	}
	err := s.db.Table("problem_tags").
		Select("tag_id, COUNT(*) AS count").
		Where("tag_id IN ?", ids).
		Group("tag_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		counts[row.TagID] = row.Count
	}
	return counts, nil
}

func (s *Server) publishedTagProblemCounts(tags []model.Tag) (map[uint]int64, error) {
	counts := map[uint]int64{}
	if len(tags) == 0 {
		return counts, nil
	}

	ids := make([]uint, 0, len(tags))
	for _, tag := range tags {
		ids = append(ids, tag.ID)
	}

	var rows []struct {
		TagID uint
		Count int64
	}
	err := s.db.Table("problem_tags").
		Select("problem_tags.tag_id, COUNT(DISTINCT problems.id) AS count").
		Joins("JOIN problems ON problems.id = problem_tags.problem_id").
		Where("problem_tags.tag_id IN ? AND problems.deleted_at IS NULL AND problems.is_published = ?", ids, true).
		Group("problem_tags.tag_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		counts[row.TagID] = row.Count
	}
	return counts, nil
}
