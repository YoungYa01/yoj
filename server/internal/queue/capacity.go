package queue

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var ErrCapacityExceeded = errors.New("judge capacity exceeded")

type Admission struct {
	Token string
}

type CapacityStats struct {
	InUse     int64 `json:"in_use"`
	Max       int64 `json:"max"`
	Available int64 `json:"available"`
}

type CapacityGate struct {
	redis *redis.Client
	key   string
	max   int64
	ttl   time.Duration
}

var acquireCapacityScript = redis.NewScript(`
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])

local current = redis.call("ZCARD", KEYS[1])
local maximum = tonumber(ARGV[3])

if current >= maximum then
	return {0, current}
end

redis.call("ZADD", KEYS[1], ARGV[2], ARGV[4])
return {1, current + 1}
`)

var renewCapacityScript = redis.NewScript(`
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])

if redis.call("ZSCORE", KEYS[1], ARGV[3]) == false then
	return 0
end

redis.call("ZADD", KEYS[1], "XX", ARGV[2], ARGV[3])
return 1
`)

var capacityStatsScript = redis.NewScript(`
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
return redis.call("ZCARD", KEYS[1])
`)

func NewCapacityGate(rdb *redis.Client, key string, maximum int, ttl time.Duration) *CapacityGate {
	if maximum <= 0 {
		maximum = 1
	}
	if ttl <= 0 {
		ttl = 6 * time.Hour
	}

	return &CapacityGate{
		redis: rdb,
		key:   key,
		max:   int64(maximum),
		ttl:   ttl,
	}
}

func (g *CapacityGate) Acquire(ctx context.Context) (*Admission, CapacityStats, error) {
	token, err := randomToken()
	if err != nil {
		return nil, CapacityStats{}, err
	}

	now := time.Now()
	result, err := acquireCapacityScript.Run(
		ctx,
		g.redis,
		[]string{g.key},
		now.UnixMilli(),
		now.Add(g.ttl).UnixMilli(),
		g.max,
		token,
	).Slice()
	if err != nil {
		return nil, CapacityStats{}, fmt.Errorf("reserve judge capacity: %w", err)
	}

	if len(result) != 2 {
		return nil, CapacityStats{}, fmt.Errorf("reserve judge capacity: invalid redis result")
	}

	acquired, err := redisResultInt64(result[0])
	if err != nil {
		return nil, CapacityStats{}, err
	}
	inUse, err := redisResultInt64(result[1])
	if err != nil {
		return nil, CapacityStats{}, err
	}

	stats := CapacityStats{
		InUse:     inUse,
		Max:       g.max,
		Available: maxInt64(0, g.max-inUse),
	}

	if acquired == 0 {
		return nil, stats, ErrCapacityExceeded
	}

	return &Admission{Token: token}, stats, nil
}

func (g *CapacityGate) Renew(ctx context.Context, token string) (bool, error) {
	if token == "" {
		return false, errors.New("empty capacity token")
	}

	now := time.Now()
	result, err := renewCapacityScript.Run(
		ctx,
		g.redis,
		[]string{g.key},
		now.UnixMilli(),
		now.Add(g.ttl).UnixMilli(),
		token,
	).Int64()
	if err != nil {
		return false, fmt.Errorf("renew judge capacity: %w", err)
	}

	return result == 1, nil
}

func (g *CapacityGate) Release(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}

	if err := g.redis.ZRem(ctx, g.key, token).Err(); err != nil {
		return fmt.Errorf("release judge capacity: %w", err)
	}

	return nil
}

func (g *CapacityGate) Stats(ctx context.Context) (CapacityStats, error) {
	inUse, err := capacityStatsScript.Run(
		ctx,
		g.redis,
		[]string{g.key},
		time.Now().UnixMilli(),
	).Int64()
	if err != nil {
		return CapacityStats{}, fmt.Errorf("query judge capacity: %w", err)
	}

	return CapacityStats{
		InUse:     inUse,
		Max:       g.max,
		Available: maxInt64(0, g.max-inUse),
	}, nil
}

func (g *CapacityGate) TTL() time.Duration {
	return g.ttl
}

func randomToken() (string, error) {
	data := make([]byte, 20)
	if _, err := rand.Read(data); err != nil {
		return "", fmt.Errorf("create capacity token: %w", err)
	}

	return hex.EncodeToString(data), nil
}

func redisResultInt64(value any) (int64, error) {
	switch typed := value.(type) {
	case int64:
		return typed, nil
	case int:
		return int64(typed), nil
	case string:
		var out int64
		if _, err := fmt.Sscan(typed, &out); err != nil {
			return 0, fmt.Errorf("parse redis integer %q: %w", typed, err)
		}
		return out, nil
	default:
		return 0, fmt.Errorf("unexpected redis integer type %T", value)
	}
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}

	return b
}
