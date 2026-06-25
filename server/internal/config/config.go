package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr      string
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	RedisAddr     string
	RedisPassword string
	RedisDB       int

	JWTSecret      string
	JWTExpireHours int

	// Legacy Redis queue name. Kept only so older .env files still load.
	// New judge tasks are published to RabbitMQ.
	JudgeQueue string
	JudgeMode  string

	GoBin          string
	CCompilerBin   string
	CPPCompilerBin string
	PythonBin      string

	RabbitMQURL            string
	RabbitJudgeQueue       string
	RabbitJudgeDeadQueue   string
	RabbitQueueType        string
	RabbitPublishTimeoutMS int

	JudgeCapacityKey        string
	JudgeMaxInflight        int
	JudgeAdmissionTTLSecond int
	JudgeRetryAfterSecond   int
	JudgeMaxRetries         int

	WorkerName        string
	WorkerConcurrency int
	WorkerPrefetch    int

	CORSAllowOrigins []string
	AdminUsername    string
	AdminPassword    string
}

func Load() Config {
	loadDotEnv(".env")
	loadDotEnv("../.env")
	loadDotEnv("server/.env")

	return Config{
		HTTPAddr:      getenv("YOJ_HTTP_ADDR", ":8080"),
		DBHost:        getenv("YOJ_DB_HOST", "127.0.0.1"),
		DBPort:        getenv("YOJ_DB_PORT", "3306"),
		DBUser:        getenv("YOJ_DB_USER", "root"),
		DBPassword:    getenv("YOJ_DB_PASSWORD", "root"),
		DBName:        getenv("YOJ_DB_NAME", "yoj"),
		RedisAddr:     getenv("YOJ_REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword: getenv("YOJ_REDIS_PASSWORD", ""),
		RedisDB:       getenvInt("YOJ_REDIS_DB", 0),

		JWTSecret:      getenv("YOJ_JWT_SECRET", "yoj-local-dev-secret"),
		JWTExpireHours: getenvInt("YOJ_JWT_EXPIRE_HOURS", 168),

		JudgeQueue: getenv("YOJ_JUDGE_QUEUE", "yoj:judge:queue"),
		JudgeMode:  strings.ToLower(getenv("YOJ_JUDGE_MODE", "host")),

		GoBin:          getenv("YOJ_GO_BIN", "go"),
		CCompilerBin:   getenvChain([]string{"YOJ_C_COMPILER_BIN", "YOJ_GCC_BIN"}, "gcc"),
		CPPCompilerBin: getenvChain([]string{"YOJ_CPP_COMPILER_BIN", "YOJ_GXX_BIN"}, "g++"),
		PythonBin:      getenv("YOJ_PYTHON_BIN", ""),

		RabbitMQURL:            getenv("YOJ_RABBITMQ_URL", "amqp://yoj:yoj-dev-password@127.0.0.1:5672/"),
		RabbitJudgeQueue:       getenv("YOJ_RABBITMQ_JUDGE_QUEUE", "yoj.judge.tasks"),
		RabbitJudgeDeadQueue:   getenv("YOJ_RABBITMQ_JUDGE_DEAD_QUEUE", "yoj.judge.tasks.dead"),
		RabbitQueueType:        strings.ToLower(getenv("YOJ_RABBITMQ_QUEUE_TYPE", "classic")),
		RabbitPublishTimeoutMS: getenvInt("YOJ_RABBITMQ_PUBLISH_TIMEOUT_MS", 5000),

		JudgeCapacityKey:        getenv("YOJ_JUDGE_CAPACITY_KEY", "yoj:judge:capacity"),
		JudgeMaxInflight:        positiveInt(getenvInt("YOJ_JUDGE_MAX_INFLIGHT", 200), 200),
		JudgeAdmissionTTLSecond: positiveInt(getenvInt("YOJ_JUDGE_ADMISSION_TTL_SECONDS", 21600), 21600),
		JudgeRetryAfterSecond:   positiveInt(getenvInt("YOJ_JUDGE_RETRY_AFTER_SECONDS", 3), 3),
		JudgeMaxRetries:         nonNegativeInt(getenvInt("YOJ_JUDGE_MAX_RETRIES", 2), 2),

		WorkerName:        getenv("YOJ_WORKER_NAME", ""),
		WorkerConcurrency: positiveInt(getenvInt("YOJ_WORKER_CONCURRENCY", 2), 2),
		WorkerPrefetch:    positiveInt(getenvInt("YOJ_WORKER_PREFETCH", 2), 2),

		CORSAllowOrigins: splitCSV(getenv(
			"YOJ_CORS_ALLOW_ORIGINS",
			"http://localhost:5173,http://127.0.0.1:5173",
		)),
		AdminUsername: getenv("YOJ_ADMIN_USERNAME", "admin"),
		AdminPassword: getenv("YOJ_ADMIN_PASSWORD", "admin123"),
	}
}

func (c Config) RootDSN() string {
	return c.DBUser + ":" + c.DBPassword + "@tcp(" + c.DBHost + ":" + c.DBPort + ")/?charset=utf8mb4&parseTime=True&loc=Local"
}

func (c Config) DSN() string {
	return c.DBUser + ":" + c.DBPassword + "@tcp(" + c.DBHost + ":" + c.DBPort + ")/" + c.DBName + "?charset=utf8mb4&parseTime=True&loc=Local"
}

func (c Config) JudgeAdmissionTTL() time.Duration {
	return time.Duration(c.JudgeAdmissionTTLSecond) * time.Second
}

func (c Config) RabbitPublishTimeout() time.Duration {
	return time.Duration(c.RabbitPublishTimeoutMS) * time.Millisecond
}

func getenv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}

func getenvChain(keys []string, fallback string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}

	return fallback
}

func getenvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func positiveInt(value, fallback int) int {
	if value <= 0 {
		return fallback
	}

	return value
}

func nonNegativeInt(value, fallback int) int {
	if value < 0 {
		return fallback
	}

	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}

	return out
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		line = strings.TrimPrefix(line, "export ")
		index := strings.Index(line, "=")

		if index <= 0 {
			continue
		}

		key := strings.TrimSpace(line[:index])
		value := strings.TrimSpace(line[index+1:])

		if key == "" || strings.ContainsAny(key, " \t") {
			continue
		}

		value = strings.Trim(value, `"'`)

		// System environment variables take precedence over .env.
		if strings.TrimSpace(os.Getenv(key)) == "" {
			_ = os.Setenv(key, value)
		}
	}
}
