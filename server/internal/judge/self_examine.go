package judge

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yoj/yoj/server/internal/model"
)

type SelfTestRequest struct {
	Language       string
	Code           string
	Input          string
	ExpectedOutput string
	TimeLimitMS    int
	MemoryLimitMB  int
}

type SelfTestResult struct {
	Status         string `json:"status"`
	TimeUsedMS     int    `json:"time_used_ms"`
	MemoryUsedKB   int    `json:"memory_used_kb"`
	Output         string `json:"output"`
	ExpectedOutput string `json:"expected_output,omitempty"`
	ErrorMessage   string `json:"error_message,omitempty"`
}

func (r *Runner) RunSelfTest(ctx context.Context, req SelfTestRequest) SelfTestResult {
	lang, ok := languageByName(req.Language)
	if !ok {
		return SelfTestResult{
			Status:       model.StatusSystemError,
			ErrorMessage: "unsupported language",
		}
	}

	timeLimitMS := req.TimeLimitMS
	if timeLimitMS <= 0 {
		timeLimitMS = 1000
	}

	memoryLimitMB := req.MemoryLimitMB
	if memoryLimitMB <= 0 {
		memoryLimitMB = 128
	}

	workDir, err := os.MkdirTemp("", "yoj-selftest-*")
	if err != nil {
		return SelfTestResult{
			Status:       model.StatusSystemError,
			ErrorMessage: err.Error(),
		}
	}
	defer os.RemoveAll(workDir)

	if err := os.WriteFile(filepath.Join(workDir, lang.SourceFile), []byte(req.Code), 0600); err != nil {
		return SelfTestResult{
			Status:       model.StatusSystemError,
			ErrorMessage: err.Error(),
		}
	}

	mode := r.judgeMode()

	if lang.compileCommand(mode) != "" {
		compileResult, err := runCommand(
			ctx,
			mode,
			lang.Image,
			workDir,
			lang.compileCommand(mode),
			30*time.Second,
			maxInt(memoryLimitMB, 512),
		)

		if err != nil && !compileResult.TimedOut {
			return SelfTestResult{
				Status:       model.StatusSystemError,
				ErrorMessage: err.Error(),
			}
		}

		if compileResult.TimedOut {
			return SelfTestResult{
				Status:       model.StatusCompileError,
				ErrorMessage: "compile timeout",
			}
		}

		if compileResult.ExitCode != 0 {
			message := strings.TrimSpace(compileResult.Stderr + "\n" + compileResult.Stdout)
			if message == "" {
				message = fmt.Sprintf("compiler exited with code %d", compileResult.ExitCode)
			}

			return SelfTestResult{
				Status:       model.StatusCompileError,
				ErrorMessage: message,
			}
		}
	}

	if err := os.WriteFile(filepath.Join(workDir, "input.txt"), []byte(req.Input), 0600); err != nil {
		return SelfTestResult{
			Status:       model.StatusSystemError,
			ErrorMessage: err.Error(),
		}
	}

	_ = os.Remove(filepath.Join(workDir, "output.txt"))

	timeout := time.Duration(timeLimitMS)*time.Millisecond + 500*time.Millisecond

	result, err := runCommand(
		ctx,
		mode,
		lang.Image,
		workDir,
		lang.runCommand(mode),
		timeout,
		memoryLimitMB,
	)

	if err != nil && !result.TimedOut {
		return SelfTestResult{
			Status:       model.StatusSystemError,
			ErrorMessage: err.Error(),
		}
	}

	outputBytes, _ := os.ReadFile(filepath.Join(workDir, "output.txt"))
	output := string(outputBytes)

	timeMS := int(result.Duration.Milliseconds())

	switch {
	case result.TimedOut:
		return SelfTestResult{
			Status:         model.StatusTimeLimitExceeded,
			TimeUsedMS:     timeMS,
			Output:         output,
			ExpectedOutput: req.ExpectedOutput,
			ErrorMessage:   "execution timed out",
		}

	case result.ExitCode == 137:
		return SelfTestResult{
			Status:         model.StatusMemoryLimitExceeded,
			TimeUsedMS:     timeMS,
			Output:         output,
			ExpectedOutput: req.ExpectedOutput,
			ErrorMessage:   "memory limit exceeded",
		}

	case result.ExitCode != 0:
		message := strings.TrimSpace(result.Stderr)
		if message == "" {
			message = fmt.Sprintf("program exited with code %d", result.ExitCode)
		}

		return SelfTestResult{
			Status:         model.StatusRuntimeError,
			TimeUsedMS:     timeMS,
			Output:         output,
			ExpectedOutput: req.ExpectedOutput,
			ErrorMessage:   message,
		}
	}

	status := model.StatusAccepted
	if strings.TrimSpace(req.ExpectedOutput) != "" &&
		normalizeOutput(output) != normalizeOutput(req.ExpectedOutput) {
		status = model.StatusWrongAnswer
	}

	return SelfTestResult{
		Status:         status,
		TimeUsedMS:     timeMS,
		Output:         output,
		ExpectedOutput: req.ExpectedOutput,
	}
}
