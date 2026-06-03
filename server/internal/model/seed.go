package model

import (
	"errors"
	"strings"

	"github.com/yoj/yoj/server/internal/auth"
	"github.com/yoj/yoj/server/internal/config"
	"gorm.io/gorm"
)

func SeedDefaults(db *gorm.DB, cfg config.Config) error {
	if err := seedAdmin(db, cfg); err != nil {
		return err
	}
	return seedSampleProblem(db)
}

func seedAdmin(db *gorm.DB, cfg config.Config) error {
	var user User
	err := db.Where("username = ?", cfg.AdminUsername).First(&user).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := auth.HashPassword(cfg.AdminPassword)
	if err != nil {
		return err
	}
	return db.Create(&User{
		Username:     cfg.AdminUsername,
		PasswordHash: hash,
		Role:         RoleAdmin,
	}).Error
}

func seedSampleProblem(db *gorm.DB) error {
	var count int64
	if err := db.Model(&Problem{}).Where("slug = ?", "a-plus-b").Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	tags, err := ensureTags(db, []string{"入门", "模拟"})
	if err != nil {
		return err
	}

	problem := Problem{
		Title:             "A + B Problem",
		Slug:              "a-plus-b",
		Description:       "给定两个整数 a 和 b，输出它们的和。",
		InputDescription:  "输入包含两个整数 a 和 b。",
		OutputDescription: "输出一个整数，表示 a + b 的结果。",
		Difficulty:        "Easy",
		TimeLimitMS:       1000,
		MemoryLimitMB:     128,
		Hint:              "注意读取标准输入并输出到标准输出。",
		IsPublished:       true,
		Tags:              tags,
		TestCases: []TestCase{
			{Input: "1 2\n", ExpectedOutput: "3\n", IsSample: true, SortOrder: 1},
			{Input: "10 25\n", ExpectedOutput: "35\n", IsSample: false, SortOrder: 2},
		},
	}
	return db.Create(&problem).Error
}

func ensureTags(db *gorm.DB, names []string) ([]Tag, error) {
	tags := make([]Tag, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		var tag Tag
		if err := db.Where("name = ?", name).FirstOrCreate(&tag, Tag{Name: name}).Error; err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, nil
}
