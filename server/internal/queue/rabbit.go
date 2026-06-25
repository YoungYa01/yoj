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

type publisherLane struct {
	channel *amqp.Channel
}

type RabbitPublisher struct {
	connection     *amqp.Connection
	queueName      string
	publishTimeout time.Duration

	lanes chan *publisherLane

	inspectChannel *amqp.Channel
	inspectMu      sync.Mutex

	lifecycleMu sync.RWMutex
	closed      bool
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

	inspectChannel, err := connection.Channel()
	if err != nil {
		_ = connection.Close()
		return nil, fmt.Errorf("open rabbitmq inspect channel: %w", err)
	}

	if err := declareTopology(inspectChannel, cfg); err != nil {
		_ = inspectChannel.Close()
		_ = connection.Close()
		return nil, err
	}

	laneCount := cfg.RabbitPublishChannels
	if laneCount <= 0 {
		laneCount = 1
	}

	publisher := &RabbitPublisher{
		connection:     connection,
		queueName:      cfg.RabbitJudgeQueue,
		publishTimeout: cfg.RabbitPublishTimeout(),
		lanes:          make(chan *publisherLane, laneCount),
		inspectChannel: inspectChannel,
	}

	for index := 0; index < laneCount; index++ {
		lane, err := newPublisherLane(connection)
		if err != nil {
			for len(publisher.lanes) > 0 {
				createdLane := <-publisher.lanes
				_ = createdLane.channel.Close()
			}
			_ = inspectChannel.Close()
			_ = connection.Close()
			return nil, fmt.Errorf("create rabbitmq publisher channel %d: %w", index+1, err)
		}

		publisher.lanes <- lane
	}

	return publisher, nil
}

func newPublisherLane(connection *amqp.Connection) (*publisherLane, error) {
	channel, err := connection.Channel()
	if err != nil {
		return nil, fmt.Errorf("open channel: %w", err)
	}

	if err := channel.Confirm(false); err != nil {
		_ = channel.Close()
		return nil, fmt.Errorf("enable publisher confirms: %w", err)
	}

	return &publisherLane{channel: channel}, nil
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

	p.lifecycleMu.RLock()
	defer p.lifecycleMu.RUnlock()

	if p.closed {
		return errors.New("rabbitmq publisher is closed")
	}

	lane, err := p.acquireLane(ctx)
	if err != nil {
		return err
	}
	defer func() {
		p.lanes <- lane
	}()

	// Start a fresh timeout after a lane has been acquired. The old
	// single-channel implementation started the timeout before waiting for a
	// global mutex, so requests at the back of the line expired without ever
	// reaching RabbitMQ.
	publishCtx, cancel := p.operationContext(ctx)
	defer cancel()

	confirmation, err := lane.channel.PublishWithDeferredConfirmWithContext(
		publishCtx,
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

	confirmed, err := confirmation.WaitContext(publishCtx)
	if err != nil {
		return fmt.Errorf("wait rabbitmq publisher confirm: %w", err)
	}
	if !confirmed {
		return errors.New("rabbitmq rejected judge task")
	}

	return nil
}

func (p *RabbitPublisher) acquireLane(ctx context.Context) (*publisherLane, error) {
	acquireCtx, cancel := p.operationContext(ctx)
	defer cancel()

	select {
	case lane := <-p.lanes:
		return lane, nil
	case <-acquireCtx.Done():
		return nil, fmt.Errorf("wait for rabbitmq publish channel: %w", acquireCtx.Err())
	}
}

func (p *RabbitPublisher) operationContext(parent context.Context) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}

	if p.publishTimeout <= 0 {
		return context.WithCancel(parent)
	}

	return context.WithTimeout(parent, p.publishTimeout)
}

func (p *RabbitPublisher) Inspect(ctx context.Context) (BrokerStats, error) {
	p.lifecycleMu.RLock()
	defer p.lifecycleMu.RUnlock()

	if p.closed {
		return BrokerStats{}, errors.New("rabbitmq publisher is closed")
	}

	p.inspectMu.Lock()
	defer p.inspectMu.Unlock()

	queue, err := p.inspectChannel.QueueInspect(p.queueName)
	if err != nil {
		return BrokerStats{}, fmt.Errorf("inspect rabbitmq judge queue: %w", err)
	}

	return BrokerStats{
		Ready:     queue.Messages,
		Consumers: queue.Consumers,
	}, nil
}

func (p *RabbitPublisher) Close() error {
	p.lifecycleMu.Lock()
	defer p.lifecycleMu.Unlock()

	if p.closed {
		return nil
	}
	p.closed = true

	var errs []error

	// The write lock guarantees that no PublishTask call is still borrowing a
	// lane, so every channel can be drained and closed deterministically.
	for index := 0; index < cap(p.lanes); index++ {
		lane := <-p.lanes
		if lane != nil && lane.channel != nil {
			if err := lane.channel.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
				errs = append(errs, err)
			}
		}
	}

	if p.inspectChannel != nil {
		if err := p.inspectChannel.Close(); err != nil && !errors.Is(err, amqp.ErrClosed) {
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
