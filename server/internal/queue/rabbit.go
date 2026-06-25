package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/yoj/yoj/server/internal/config"
)

type JudgeTask struct {
	SubmissionID  uint      `json:"submission_id"`
	CapacityToken string    `json:"capacity_token"`
	Attempt       int       `json:"attempt"`
	EnqueuedAt    time.Time `json:"enqueued_at"`
}

type BrokerStats struct {
	Ready     int `json:"ready"`
	Consumers int `json:"consumers"`
}

type RabbitPublisher struct {
	connection *amqp.Connection
	channel    *amqp.Channel
	queueName  string
	mu         sync.Mutex
}

type RabbitConsumer struct {
	connection *amqp.Connection
	channel    *amqp.Channel
	queueName  string
	deliveries <-chan amqp.Delivery
}

func NewRabbitPublisher(cfg config.Config) (*RabbitPublisher, error) {
	connection, err := amqp.Dial(cfg.RabbitMQURL)
	if err != nil {
		return nil, fmt.Errorf("connect rabbitmq: %w", err)
	}

	channel, err := connection.Channel()
	if err != nil {
		_ = connection.Close()
		return nil, fmt.Errorf("open rabbitmq publisher channel: %w", err)
	}

	if err := declareTopology(channel, cfg); err != nil {
		_ = channel.Close()
		_ = connection.Close()
		return nil, err
	}

	if err := channel.Confirm(false); err != nil {
		_ = channel.Close()
		_ = connection.Close()
		return nil, fmt.Errorf("enable rabbitmq publisher confirms: %w", err)
	}

	return &RabbitPublisher{
		connection: connection,
		channel:    channel,
		queueName:  cfg.RabbitJudgeQueue,
	}, nil
}

func NewRabbitConsumer(ctx context.Context, cfg config.Config) (*RabbitConsumer, error) {
	connection, err := amqp.Dial(cfg.RabbitMQURL)
	if err != nil {
		return nil, fmt.Errorf("connect rabbitmq: %w", err)
	}

	channel, err := connection.Channel()
	if err != nil {
		_ = connection.Close()
		return nil, fmt.Errorf("open rabbitmq consumer channel: %w", err)
	}

	if err := declareTopology(channel, cfg); err != nil {
		_ = channel.Close()
		_ = connection.Close()
		return nil, err
	}

	prefetch := cfg.WorkerPrefetch
	if prefetch < cfg.WorkerConcurrency {
		prefetch = cfg.WorkerConcurrency
	}

	if err := channel.Qos(prefetch, 0, false); err != nil {
		_ = channel.Close()
		_ = connection.Close()
		return nil, fmt.Errorf("set rabbitmq prefetch: %w", err)
	}

	consumerName := strings.TrimSpace(cfg.WorkerName)
	if consumerName == "" {
		host, _ := os.Hostname()
		consumerName = "yoj-worker-" + host + "-" + strconv.Itoa(os.Getpid())
	}

	deliveries, err := channel.ConsumeWithContext(
		ctx,
		cfg.RabbitJudgeQueue,
		consumerName,
		false, // manual ack
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		_ = channel.Close()
		_ = connection.Close()
		return nil, fmt.Errorf("consume rabbitmq judge queue: %w", err)
	}

	return &RabbitConsumer{
		connection: connection,
		channel:    channel,
		queueName:  cfg.RabbitJudgeQueue,
		deliveries: deliveries,
	}, nil
}

func (p *RabbitPublisher) PublishTask(ctx context.Context, task JudgeTask) error {
	if task.SubmissionID == 0 {
		return errors.New("empty submission id")
	}
	if strings.TrimSpace(task.CapacityToken) == "" {
		return errors.New("empty capacity token")
	}

	body, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("marshal judge task: %w", err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	confirmation, err := p.channel.PublishWithDeferredConfirmWithContext(
		ctx,
		"",
		p.queueName,
		true,
		false,
		amqp.Publishing{
			Headers: amqp.Table{
				"x-yoj-attempt": task.Attempt,
			},
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			MessageId:    fmt.Sprintf("submission-%d-attempt-%d", task.SubmissionID, task.Attempt),
			Body:         body,
		},
	)
	if err != nil {
		return fmt.Errorf("publish rabbitmq judge task: %w", err)
	}
	if confirmation == nil {
		return errors.New("rabbitmq publisher confirm is unavailable")
	}

	confirmed, err := confirmation.WaitContext(ctx)
	if err != nil {
		return fmt.Errorf("wait rabbitmq publisher confirm: %w", err)
	}
	if !confirmed {
		return errors.New("rabbitmq rejected judge task")
	}

	return nil
}

func (p *RabbitPublisher) Inspect(ctx context.Context) (BrokerStats, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	queue, err := p.channel.QueueInspect(p.queueName)
	if err != nil {
		return BrokerStats{}, fmt.Errorf("inspect rabbitmq judge queue: %w", err)
	}

	return BrokerStats{
		Ready:     queue.Messages,
		Consumers: queue.Consumers,
	}, nil
}

func (p *RabbitPublisher) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var errs []error
	if p.channel != nil {
		if err := p.channel.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}
	if p.connection != nil {
		if err := p.connection.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

func (c *RabbitConsumer) Deliveries() <-chan amqp.Delivery {
	return c.deliveries
}

func (c *RabbitConsumer) Close() error {
	var errs []error
	if c.channel != nil {
		if err := c.channel.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}
	if c.connection != nil {
		if err := c.connection.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

func DecodeJudgeTask(body []byte) (JudgeTask, error) {
	var task JudgeTask
	if err := json.Unmarshal(body, &task); err != nil {
		return JudgeTask{}, fmt.Errorf("decode judge task: %w", err)
	}
	if task.SubmissionID == 0 {
		return JudgeTask{}, errors.New("judge task has empty submission id")
	}
	if strings.TrimSpace(task.CapacityToken) == "" {
		return JudgeTask{}, errors.New("judge task has empty capacity token")
	}

	return task, nil
}

func declareTopology(channel *amqp.Channel, cfg config.Config) error {
	deadArgs := amqp.Table{}
	mainArgs := amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": cfg.RabbitJudgeDeadQueue,
	}

	switch cfg.RabbitQueueType {
	case "", "classic":
		// Classic durable queue.
	case "quorum":
		mainArgs["x-queue-type"] = "quorum"
		deadArgs["x-queue-type"] = "quorum"
	default:
		return fmt.Errorf("unsupported rabbitmq queue type %q", cfg.RabbitQueueType)
	}

	if _, err := channel.QueueDeclare(
		cfg.RabbitJudgeDeadQueue,
		true,
		false,
		false,
		false,
		deadArgs,
	); err != nil {
		return fmt.Errorf("declare rabbitmq dead queue: %w", err)
	}

	if _, err := channel.QueueDeclare(
		cfg.RabbitJudgeQueue,
		true,
		false,
		false,
		false,
		mainArgs,
	); err != nil {
		return fmt.Errorf("declare rabbitmq judge queue: %w", err)
	}

	return nil
}
