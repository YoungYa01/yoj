package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/database"
	"github.com/yoj/yoj/server/internal/judge"
	"github.com/yoj/yoj/server/internal/model"
	"github.com/yoj/yoj/server/internal/queue"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
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
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("connect redis: %v", err)
	}

	consumer, err := queue.NewRabbitConsumer(ctx, cfg)
	if err != nil {
		log.Fatalf("create rabbitmq consumer: %v", err)
	}
	defer consumer.Close()

	retryPublisher, err := queue.NewRabbitPublisher(cfg)
	if err != nil {
		log.Fatalf("create rabbitmq retry publisher: %v", err)
	}
	defer retryPublisher.Close()

	capacityGate := queue.NewCapacityGate(
		rdb,
		cfg.JudgeCapacityKey,
		cfg.JudgeMaxInflight,
		cfg.JudgeAdmissionTTL(),
	)
	runner := judge.NewRunner(db, cfg)

	concurrency := cfg.WorkerConcurrency
	if concurrency <= 0 {
		concurrency = 1
	}

	log.Printf(
		"yoj judge worker started: name=%q queue=%q concurrency=%d prefetch=%d mode=%s",
		cfg.WorkerName,
		cfg.RabbitJudgeQueue,
		concurrency,
		maxInt(cfg.WorkerPrefetch, concurrency),
		cfg.JudgeMode,
	)

	var waitGroup sync.WaitGroup
	for index := 0; index < concurrency; index++ {
		waitGroup.Add(1)

		go func(slot int) {
			defer waitGroup.Done()
			workerLoop(
				ctx,
				slot,
				consumer.Deliveries(),
				retryPublisher,
				capacityGate,
				runner,
				db,
				cfg,
			)
		}(index + 1)
	}

	<-ctx.Done()
	_ = consumer.Close()
	waitGroup.Wait()
}

func workerLoop(
	ctx context.Context,
	slot int,
	deliveries <-chan amqp.Delivery,
	retryPublisher *queue.RabbitPublisher,
	capacityGate *queue.CapacityGate,
	runner *judge.Runner,
	db *gorm.DB,
	cfg config.Config,
) {
	for {
		select {
		case <-ctx.Done():
			return

		case delivery, ok := <-deliveries:
			if !ok {
				return
			}

			processDelivery(
				ctx,
				slot,
				delivery,
				retryPublisher,
				capacityGate,
				runner,
				db,
				cfg,
			)
		}
	}
}

func processDelivery(
	ctx context.Context,
	slot int,
	delivery amqp.Delivery,
	retryPublisher *queue.RabbitPublisher,
	capacityGate *queue.CapacityGate,
	runner *judge.Runner,
	db *gorm.DB,
	cfg config.Config,
) {
	task, err := queue.DecodeJudgeTask(delivery.Body)
	if err != nil {
		log.Printf("worker slot %d: invalid judge task: %v", slot, err)
		_ = delivery.Nack(false, false)
		return
	}

	terminal, err := submissionAlreadyFinished(db, task.SubmissionID)
	if err != nil {
		log.Printf("worker slot %d: query submission #%d: %v", slot, task.SubmissionID, err)
		_ = delivery.Nack(false, true)
		return
	}
	if terminal {
		if err := delivery.Ack(false); err == nil {
			releaseCapacity(capacityGate, task.CapacityToken)
		}
		return
	}

	log.Printf(
		"worker slot %d judging submission #%d, attempt=%d",
		slot,
		task.SubmissionID,
		task.Attempt,
	)

	heartbeatCtx, stopHeartbeat := context.WithCancel(ctx)
	var heartbeatWait sync.WaitGroup
	heartbeatWait.Add(1)
	go func() {
		defer heartbeatWait.Done()
		keepCapacityAlive(heartbeatCtx, capacityGate, task.CapacityToken)
	}()

	judgeErr := runner.JudgeSubmission(ctx, task.SubmissionID)

	stopHeartbeat()
	heartbeatWait.Wait()

	if judgeErr == nil {
		if err := delivery.Ack(false); err != nil {
			log.Printf("ack submission #%d: %v", task.SubmissionID, err)
			return
		}

		releaseCapacity(capacityGate, task.CapacityToken)
		return
	}

	log.Printf("judge submission #%d: %v", task.SubmissionID, judgeErr)

	if task.Attempt < cfg.JudgeMaxRetries {
		task.Attempt++
		task.EnqueuedAt = time.Now()

		_ = db.Model(&model.Submission{}).
			Where("id = ?", task.SubmissionID).
			Updates(map[string]any{
				"status":        model.StatusPending,
				"error_message": fmt.Sprintf("judge retry %d/%d: %s", task.Attempt, cfg.JudgeMaxRetries, truncateError(judgeErr)),
			}).Error

		publishCtx, cancel := context.WithTimeout(context.Background(), cfg.RabbitPublishTimeout())
		publishErr := retryPublisher.PublishTask(publishCtx, task)
		cancel()

		if publishErr != nil {
			log.Printf("republish submission #%d: %v", task.SubmissionID, publishErr)
			_ = delivery.Nack(false, true)
			return
		}

		if err := delivery.Ack(false); err != nil {
			log.Printf("ack retried submission #%d: %v", task.SubmissionID, err)
		}
		return
	}

	_ = db.Model(&model.Submission{}).
		Where("id = ?", task.SubmissionID).
		Updates(map[string]any{
			"status":        model.StatusSystemError,
			"error_message": "judge failed after retries: " + truncateError(judgeErr),
		}).Error

	// The queue has a dead-letter queue configured. Rejecting without requeue
	// moves the poison task there for inspection.
	if err := delivery.Nack(false, false); err != nil {
		log.Printf("dead-letter submission #%d: %v", task.SubmissionID, err)
		return
	}

	releaseCapacity(capacityGate, task.CapacityToken)
}

func submissionAlreadyFinished(db *gorm.DB, submissionID uint) (bool, error) {
	var submission model.Submission
	err := db.Select("id", "status").First(&submission, submissionID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	switch submission.Status {
	case model.StatusPending, model.StatusJudging:
		return false, nil
	default:
		return true, nil
	}
}

func keepCapacityAlive(ctx context.Context, gate *queue.CapacityGate, token string) {
	interval := gate.TTL() / 3
	if interval < 10*time.Second {
		interval = 10 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			renewCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			renewed, err := gate.Renew(renewCtx, token)
			cancel()

			if err != nil {
				log.Printf("renew judge capacity token: %v", err)
				continue
			}
			if !renewed {
				log.Printf("judge capacity token expired before task completed")
			}
		}
	}
}

func releaseCapacity(gate *queue.CapacityGate, token string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := gate.Release(ctx, token); err != nil {
		log.Printf("release judge capacity: %v", err)
	}
}

func truncateError(err error) string {
	if err == nil {
		return ""
	}

	text := strings.TrimSpace(err.Error())
	const maximum = 1800
	if len(text) <= maximum {
		return text
	}

	return text[:maximum] + "..."
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}

	return b
}
