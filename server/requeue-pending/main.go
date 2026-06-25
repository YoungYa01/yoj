package main

import (
	"context"
	"errors"
	"log"

	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/database"
	"github.com/yoj/yoj/server/internal/model"
	"github.com/yoj/yoj/server/internal/queue"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	db, err := database.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	defer rdb.Close()

	dispatcher, err := queue.NewDispatcher(rdb, cfg)
	if err != nil {
		log.Fatalf("create judge dispatcher: %v", err)
	}
	defer dispatcher.Close()

	var submissions []model.Submission
	if err := db.
		Where("status = ?", model.StatusPending).
		Order("id ASC").
		Find(&submissions).Error; err != nil {
		log.Fatalf("query pending submissions: %v", err)
	}

	for _, submission := range submissions {
		admission, stats, err := dispatcher.Acquire(ctx)
		if errors.Is(err, queue.ErrCapacityExceeded) {
			log.Printf(
				"capacity full after requeueing part of the backlog: %d/%d",
				stats.InUse,
				stats.Max,
			)
			return
		}
		if err != nil {
			log.Fatalf("reserve capacity for submission #%d: %v", submission.ID, err)
		}

		publishCtx, cancel := context.WithTimeout(ctx, cfg.RabbitPublishTimeout())
		err = dispatcher.Publish(publishCtx, admission, submission.ID)
		cancel()

		if err != nil {
			_ = dispatcher.Release(ctx, admission)
			log.Fatalf("publish submission #%d: %v", submission.ID, err)
		}

		log.Printf("requeued submission #%d", submission.ID)
	}
}
