package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/config"
)

type DispatcherStats struct {
	Capacity CapacityStats `json:"capacity"`
	Broker   BrokerStats   `json:"broker"`
}

type Dispatcher struct {
	gate             *CapacityGate
	publisher        *RabbitPublisher
	publishTimeout   time.Duration
	retryAfterSecond int
}

func NewDispatcher(rdb *redis.Client, cfg config.Config) (*Dispatcher, error) {
	publisher, err := NewRabbitPublisher(cfg)
	if err != nil {
		return nil, err
	}

	return &Dispatcher{
		gate: NewCapacityGate(
			rdb,
			cfg.JudgeCapacityKey,
			cfg.JudgeMaxInflight,
			cfg.JudgeAdmissionTTL(),
		),
		publisher:        publisher,
		publishTimeout:   cfg.RabbitPublishTimeout(),
		retryAfterSecond: cfg.JudgeRetryAfterSecond,
	}, nil
}

func (d *Dispatcher) Acquire(ctx context.Context) (*Admission, CapacityStats, error) {
	return d.gate.Acquire(ctx)
}

func (d *Dispatcher) Publish(ctx context.Context, admission *Admission, submissionID uint) error {
	if admission == nil {
		return fmt.Errorf("nil judge admission")
	}

	task := JudgeTask{
		SubmissionID:  submissionID,
		CapacityToken: admission.Token,
		Attempt:       0,
		EnqueuedAt:    time.Now(),
	}

	publishCtx := ctx
	if _, ok := ctx.Deadline(); !ok && d.publishTimeout > 0 {
		var cancel context.CancelFunc
		publishCtx, cancel = context.WithTimeout(ctx, d.publishTimeout)
		defer cancel()
	}

	return d.publisher.PublishTask(publishCtx, task)
}

func (d *Dispatcher) Release(ctx context.Context, admission *Admission) error {
	if admission == nil {
		return nil
	}

	return d.gate.Release(ctx, admission.Token)
}

func (d *Dispatcher) Stats(ctx context.Context) (DispatcherStats, error) {
	capacity, err := d.gate.Stats(ctx)
	if err != nil {
		return DispatcherStats{}, err
	}

	broker, err := d.publisher.Inspect(ctx)
	if err != nil {
		return DispatcherStats{}, err
	}

	return DispatcherStats{
		Capacity: capacity,
		Broker:   broker,
	}, nil
}

func (d *Dispatcher) RetryAfterSecond() int {
	return d.retryAfterSecond
}

func (d *Dispatcher) Close() error {
	return d.publisher.Close()
}
