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

	rootDB.SetMaxOpenConns(1)
	rootDB.SetMaxIdleConns(1)

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

	db, err := gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.DBConnMaxLifetime())
	sqlDB.SetConnMaxIdleTime(cfg.DBConnMaxIdleTime())

	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, err
	}

	return db, nil
}
