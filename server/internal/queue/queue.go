package queue

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

type JudgeTask struct {
	SubmissionID uint `json:"submission_id"`
}

func EnqueueJudge(ctx context.Context, rdb *redis.Client, queueName string, submissionID uint) error {
	payload, err := json.Marshal(JudgeTask{SubmissionID: submissionID})
	if err != nil {
		return err
	}
	return rdb.LPush(ctx, queueName, payload).Err()
}

func DequeueJudge(ctx context.Context, rdb *redis.Client, queueName string) (string, error) {
	values, err := rdb.BRPop(ctx, 0, queueName).Result()
	if err != nil {
		return "", err
	}
	if len(values) < 2 {
		return "", nil
	}
	return values[1], nil
}
