package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/api"
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
	if err := model.AutoMigrate(db); err != nil {
		log.Fatalf("migrate database: %v", err)
	}
	if err := model.SeedDefaults(db, cfg); err != nil {
		log.Fatalf("seed defaults: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("connect redis: %v", err)
	}

	judgeQueue, err := queue.NewDispatcher(rdb, cfg)
	if err != nil {
		log.Fatalf("connect rabbitmq judge queue: %v", err)
	}
	defer func() {
		if err := judgeQueue.Close(); err != nil {
			log.Printf("close judge queue: %v", err)
		}
	}()

	router := api.NewRouter(api.Dependencies{
		DB:         db,
		Redis:      rdb,
		Config:     cfg,
		JudgeQueue: judgeQueue,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf(
			"yoj api listening on %s, rabbit queue=%q, max inflight=%d",
			cfg.HTTPAddr,
			cfg.RabbitJudgeQueue,
			cfg.JudgeMaxInflight,
		)

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop, cancel := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer cancel()

	<-stop.Done()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown server: %v", err)
	}
}
