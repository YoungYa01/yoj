package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	HTTPAddr         string
	DBHost           string
	DBPort           string
	DBUser           string
	DBPassword       string
	DBName           string
	RedisAddr        string
	RedisPassword    string
	RedisDB          int
	JWTSecret        string
	JWTExpireHours   int
	JudgeQueue       string
	JudgeMode        string
	GoBin            string
	CCompilerBin     string
	CPPCompilerBin   string
	PythonBin        string
	CORSAllowOrigins []string
	AdminUsername    string
	AdminPassword    string
}

func Load() Config {
	loadDotEnv(".env")
	loadDotEnv("../.env")
	loadDotEnv("server/.env")

	return Config{
		HTTPAddr:         getenv("YOJ_HTTP_ADDR", ":8080"),
		DBHost:           getenv("YOJ_DB_HOST", "127.0.0.1"),
		DBPort:           getenv("YOJ_DB_PORT", "3306"),
		DBUser:           getenv("YOJ_DB_USER", "root"),
		DBPassword:       getenv("YOJ_DB_PASSWORD", "root"),
		DBName:           getenv("YOJ_DB_NAME", "yoj"),
		RedisAddr:        getenv("YOJ_REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:    getenv("YOJ_REDIS_PASSWORD", ""),
		RedisDB:          getenvInt("YOJ_REDIS_DB", 0),
		JWTSecret:        getenv("YOJ_JWT_SECRET", "yoj-local-dev-secret"),
		JWTExpireHours:   getenvInt("YOJ_JWT_EXPIRE_HOURS", 168),
		JudgeQueue:       getenv("YOJ_JUDGE_QUEUE", "yoj:judge:queue"),
		JudgeMode:        strings.ToLower(getenv("YOJ_JUDGE_MODE", "host")),
		GoBin:            getenv("YOJ_GO_BIN", "go"),
		CCompilerBin:     getenvChain([]string{"YOJ_C_COMPILER_BIN", "YOJ_GCC_BIN"}, "gcc"),
		CPPCompilerBin:   getenvChain([]string{"YOJ_CPP_COMPILER_BIN", "YOJ_GXX_BIN"}, "g++"),
		PythonBin:        getenv("YOJ_PYTHON_BIN", ""),
		CORSAllowOrigins: splitCSV(getenv("YOJ_CORS_ALLOW_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		AdminUsername:    getenv("YOJ_ADMIN_USERNAME", "admin"),
		AdminPassword:    getenv("YOJ_ADMIN_PASSWORD", "admin123"),
	}
}

func (c Config) RootDSN() string {
	return c.DBUser + ":" + c.DBPassword + "@tcp(" + c.DBHost + ":" + c.DBPort + ")/?charset=utf8mb4&parseTime=True&loc=Local"
}

func (c Config) DSN() string {
	return c.DBUser + ":" + c.DBPassword + "@tcp(" + c.DBHost + ":" + c.DBPort + ")/" + c.DBName + "?charset=utf8mb4&parseTime=True&loc=Local"
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

		// 系统环境变量优先级更高，.env 不覆盖已经设置好的变量。
		if strings.TrimSpace(os.Getenv(key)) == "" {
			_ = os.Setenv(key, value)
		}
	}
}
