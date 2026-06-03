package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"os/signal"
	"strconv"

	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/database"
	"github.com/yoj/yoj/server/internal/judge"
	"github.com/yoj/yoj/server/internal/model"
	"github.com/yoj/yoj/server/internal/queue"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	db, err := database.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("connect redis: %v", err)
	}

	runner := judge.NewRunner(db, cfg)
	log.Printf("yoj judge worker listening on redis queue %q", cfg.JudgeQueue)

	for {
		task, err := queue.DequeueJudge(ctx, rdb, cfg.JudgeQueue)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return
			}
			log.Printf("dequeue task: %v", err)
			continue
		}

		var payload queue.JudgeTask
		if err := json.Unmarshal([]byte(task), &payload); err != nil {
			if id, parseErr := strconv.ParseUint(task, 10, 64); parseErr == nil {
				payload.SubmissionID = uint(id)
			} else {
				log.Printf("invalid task payload %q: %v", task, err)
				continue
			}
		}

		if payload.SubmissionID == 0 {
			log.Printf("invalid empty submission id payload: %q", task)
			continue
		}

		log.Printf("judging submission #%d", payload.SubmissionID)
		if err := runner.JudgeSubmission(ctx, payload.SubmissionID); err != nil {
			log.Printf("judge submission #%d: %v", payload.SubmissionID, err)
		}
	}
}
