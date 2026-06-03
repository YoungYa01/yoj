package database

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
	"github.com/yoj/yoj/server/internal/config"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(ctx context.Context, cfg config.Config) (*gorm.DB, error) {
	rootDB, err := sql.Open("mysql", cfg.RootDSN())
	if err != nil {
		return nil, err
	}
	defer rootDB.Close()

	if err := rootDB.PingContext(ctx); err != nil {
		return nil, err
	}

	createDatabase := fmt.Sprintf(
		"CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
		cfg.DBName,
	)
	if _, err := rootDB.ExecContext(ctx, createDatabase); err != nil {
		return nil, err
	}

	return gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
}
