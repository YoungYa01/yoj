package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/api"
	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/database"
	"github.com/yoj/yoj/server/internal/model"
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
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("connect redis: %v", err)
	}

	router := api.NewRouter(api.Dependencies{
		DB:     db,
		Redis:  rdb,
		Config: cfg,
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("yoj api listening on %s", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	<-stop.Done()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown server: %v", err)
	}
}
