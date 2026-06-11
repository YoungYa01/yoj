package judge

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/model"
	"golang.org/x/text/encoding/simplifiedchinese"
	"gorm.io/gorm"
)

type Runner struct {
	db     *gorm.DB
	config config.Config
}

type languageConfig struct {
	SourceFile           string
	Image                string
	DockerCompileCommand string
	DockerRunCommand     string
	HostCompileCommand   string
	HostRunCommand       string
}

type executionResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
	Duration time.Duration
	TimedOut bool
}

func NewRunner(db *gorm.DB, cfg config.Config) *Runner {
	return &Runner{db: db, config: cfg}
}

func (r *Runner) JudgeSubmission(ctx context.Context, submissionID uint) error {
	var submission model.Submission
	if err := r.db.Preload("Problem").First(&submission, submissionID).Error; err != nil {
		return err
	}

	var testCases []model.TestCase
	if err := r.db.Where("problem_id = ?", submission.ProblemID).
		Order("sort_order ASC, id ASC").
		Find(&testCases).Error; err != nil {
		return err
	}
	if len(testCases) == 0 {
		return r.finishSystemError(&submission, "problem has no test cases")
	}

	if err := r.db.Model(&submission).Updates(map[string]any{
		"status":        model.StatusJudging,
		"error_message": "",
	}).Error; err != nil {
		return err
	}
	if err := r.db.Where("submission_id = ?", submission.ID).Delete(&model.SubmissionResult{}).Error; err != nil {
		return err
	}

	lang, ok := r.languageByName(submission.Language)
	if !ok {
		return r.finishSystemError(&submission, "unsupported language")
	}

	workDir, err := os.MkdirTemp("", fmt.Sprintf("yoj-%d-*", submission.ID))
	if err != nil {
		return r.finishSystemError(&submission, err.Error())
	}
	defer os.RemoveAll(workDir)

	if err := os.WriteFile(filepath.Join(workDir, lang.SourceFile), []byte(submission.Code), 0600); err != nil {
		return r.finishSystemError(&submission, err.Error())
	}

	mode := r.judgeMode()
	if lang.compileCommand(mode) != "" {
		compileResult, err := runCommand(ctx, mode, lang.Image, workDir, lang.compileCommand(mode), 30*time.Second, maxInt(submission.Problem.MemoryLimitMB, 512))
		if err != nil && !compileResult.TimedOut {
			return r.finishSystemError(&submission, err.Error())
		}
		if compileResult.TimedOut {
			return r.finishCompileError(&submission, "compile timeout")
		}
		if compileResult.ExitCode != 0 {
			message := strings.TrimSpace(compileResult.Stderr + "\n" + compileResult.Stdout)
			if message == "" {
				message = fmt.Sprintf("compiler exited with code %d", compileResult.ExitCode)
			}
			return r.finishCompileError(&submission, message)
		}
	}

	finalStatus := model.StatusAccepted
	finalError := ""
	maxTimeMS := 0

	for _, tc := range testCases {
		if err := os.WriteFile(filepath.Join(workDir, "input.txt"), []byte(tc.Input), 0600); err != nil {
			return r.finishSystemError(&submission, err.Error())
		}
		_ = os.Remove(filepath.Join(workDir, "output.txt"))

		timeout := time.Duration(submission.Problem.TimeLimitMS)*time.Millisecond + 500*time.Millisecond
		result, err := runCommand(ctx, mode, lang.Image, workDir, lang.runCommand(mode), timeout, submission.Problem.MemoryLimitMB)
		if err != nil && !result.TimedOut {
			return r.finishSystemError(&submission, err.Error())
		}

		outputBytes, _ := os.ReadFile(filepath.Join(workDir, "output.txt"))
		output := string(outputBytes)
		status := model.StatusAccepted
		errorMessage := ""

		switch {
		case result.TimedOut:
			status = model.StatusTimeLimitExceeded
			errorMessage = "execution timed out"
		case result.ExitCode == 137:
			status = model.StatusMemoryLimitExceeded
			errorMessage = "memory limit exceeded"
		case result.ExitCode != 0:
			status = model.StatusRuntimeError
			errorMessage = strings.TrimSpace(result.Stderr)
			if errorMessage == "" {
				errorMessage = fmt.Sprintf("program exited with code %d", result.ExitCode)
			}
		case normalizeOutput(output) != normalizeOutput(tc.ExpectedOutput):
			status = model.StatusWrongAnswer
		}

		timeMS := int(result.Duration.Milliseconds())
		if timeMS > maxTimeMS {
			maxTimeMS = timeMS
		}
		record := model.SubmissionResult{
			SubmissionID: submission.ID,
			TestCaseID:   tc.ID,
			Status:       status,
			TimeUsedMS:   timeMS,
			MemoryUsedKB: 0,
			Output:       output,
			Expected:     tc.ExpectedOutput,
			ErrorMessage: errorMessage,
		}
		if err := r.db.Create(&record).Error; err != nil {
			return err
		}

		if status != model.StatusAccepted {
			finalStatus = status
			finalError = errorMessage
			break
		}
	}

	err = r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&submission).Updates(map[string]any{
			"status":         finalStatus,
			"time_used_ms":   maxTimeMS,
			"memory_used_kb": 0,
			"error_message":  finalError,
		}).Error; err != nil {
			return err
		}
		if finalStatus == model.StatusAccepted {
			return tx.Model(&model.Problem{}).Where("id = ?", submission.ProblemID).
				UpdateColumn("accept_count", gorm.Expr("accept_count + ?", 1)).Error
		}
		return nil
	})
	return err
}

func (r *Runner) judgeMode() string {
	mode := strings.ToLower(strings.TrimSpace(r.config.JudgeMode))
	if mode == "docker" {
		return "docker"
	}
	return "host"
}

func (r *Runner) finishCompileError(submission *model.Submission, message string) error {
	return r.db.Model(submission).Updates(map[string]any{
		"status":        model.StatusCompileError,
		"error_message": message,
	}).Error
}

func (r *Runner) finishSystemError(submission *model.Submission, message string) error {
	return r.db.Model(submission).Updates(map[string]any{
		"status":        model.StatusSystemError,
		"error_message": message,
	}).Error
}

func (r *Runner) languageByName(name string) (languageConfig, bool) {
	switch name {
	case model.LanguageGo:
		goBin := quoteCommandIfNeeded(r.config.GoBin)

		return languageConfig{
			SourceFile:           "main.go",
			Image:                "golang:1.22",
			DockerCompileCommand: "go build -o main main.go",
			DockerRunCommand:     "./main < input.txt > output.txt",
			HostCompileCommand:   fmt.Sprintf("%s build -o %s main.go", goBin, hostExecutableName("main")),
			HostRunCommand:       hostRunCommand("main"),
		}, true

	case model.LanguageC:
		cCompiler := quoteCommandIfNeeded(r.config.CCompilerBin)

		return languageConfig{
			SourceFile:           "main.c",
			Image:                "gcc:13",
			DockerCompileCommand: "gcc main.c -O2 -std=c17 -o main",
			DockerRunCommand:     "./main < input.txt > output.txt",
			HostCompileCommand:   fmt.Sprintf("%s main.c -O2 -std=c17 -o %s", cCompiler, hostExecutableName("main")),
			HostRunCommand:       hostRunCommand("main"),
		}, true

	case model.LanguageCPP:
		cppCompiler := quoteCommandIfNeeded(r.config.CPPCompilerBin)

		return languageConfig{
			SourceFile:           "main.cpp",
			Image:                "gcc:13",
			DockerCompileCommand: "g++ main.cpp -O2 -std=c++17 -o main",
			DockerRunCommand:     "./main < input.txt > output.txt",
			HostCompileCommand:   fmt.Sprintf("%s main.cpp -O2 -std=c++17 -o %s", cppCompiler, hostExecutableName("main")),
			HostRunCommand:       hostRunCommand("main"),
		}, true

	case model.LanguagePython:
		python := r.hostPythonCommand()

		return languageConfig{
			SourceFile:           "main.py",
			Image:                "python:3.12-alpine",
			DockerCompileCommand: "python3 -m py_compile main.py",
			DockerRunCommand:     "python3 main.py < input.txt > output.txt",
			HostCompileCommand:   python + " -m py_compile main.py",
			HostRunCommand:       python + " main.py < input.txt > output.txt",
		}, true

	default:
		return languageConfig{}, false
	}
}

func (c languageConfig) compileCommand(mode string) string {
	if mode == "docker" {
		return c.DockerCompileCommand
	}
	return c.HostCompileCommand
}

func (c languageConfig) runCommand(mode string) string {
	if mode == "docker" {
		return c.DockerRunCommand
	}
	return c.HostRunCommand
}

func runCommand(parent context.Context, mode, image, workDir, command string, timeout time.Duration, memoryMB int) (executionResult, error) {
	if mode == "docker" {
		return runDocker(parent, image, workDir, command, timeout, memoryMB)
	}
	return runHost(parent, workDir, command, timeout)
}

func runHost(parent context.Context, workDir, command string, timeout time.Duration) (executionResult, error) {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	shell, args := hostShell(command)
	cmd := exec.CommandContext(ctx, shell, args...)
	cmd.Dir = workDir

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	result := executionResult{
		ExitCode: 0,
		Stdout:   decodeCommandOutput(stdout.Bytes()),
		Stderr:   decodeCommandOutput(stderr.Bytes()),
		Duration: duration,
	}

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		result.TimedOut = true
		return result, nil
	}

	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}

		return result, err
	}

	return result, nil
}

func hostShell(command string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd", []string{"/C", command}
	}
	return "sh", []string{"-lc", command}
}

func hostExecutableName(base string) string {
	if runtime.GOOS == "windows" {
		return base + ".exe"
	}
	return base
}

func hostRunCommand(base string) string {
	if runtime.GOOS == "windows" {
		return ".\\" + hostExecutableName(base) + " < input.txt > output.txt"
	}
	return "./" + base + " < input.txt > output.txt"
}

func (r *Runner) hostPythonCommand() string {
	if configured := strings.TrimSpace(r.config.PythonBin); configured != "" {
		return quoteCommandIfNeeded(configured)
	}

	if configured := strings.TrimSpace(os.Getenv("YOJ_PYTHON_BIN")); configured != "" {
		return quoteCommandIfNeeded(configured)
	}

	candidates := []string{"python3", "python"}

	if runtime.GOOS == "windows" {
		candidates = []string{
			"py -3",
			"python3",
			"python",
		}
	}

	for _, candidate := range candidates {
		if pythonCommandWorks(candidate) {
			return candidate
		}
	}

	return hostPythonMissingCommand()
}

func pythonCommandWorks(command string) bool {
	shell, args := hostShell(quoteCommandIfNeeded(command) + " --version")
	cmd := exec.Command(shell, args...)

	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Run(); err != nil {
		return false
	}

	text := strings.ToLower(decodeCommandOutput(output.Bytes()))

	if !strings.Contains(text, "python") {
		return false
	}

	badOutputs := []string{
		"microsoft store",
		"was not found",
		"not recognized",
		"不是内部或外部命令",
		"不是可运行的程序",
	}

	for _, bad := range badOutputs {
		if strings.Contains(text, strings.ToLower(bad)) {
			return false
		}
	}

	return true
}

func hostPythonMissingCommand() string {
	message := "Python interpreter not found. Install Python or set YOJ_PYTHON_BIN to the real python.exe path."

	if runtime.GOOS == "windows" {
		return fmt.Sprintf("echo %s 1>&2 && exit /b 1", message)
	}

	return fmt.Sprintf("echo '%s' 1>&2 && exit 1", message)
}

func quoteCommandIfNeeded(command string) string {
	command = strings.TrimSpace(command)

	if command == "" {
		return command
	}

	if runtime.GOOS != "windows" {
		return command
	}

	if strings.HasPrefix(command, `"`) {
		return command
	}

	if strings.Contains(command, " ") && strings.ContainsAny(command, `\/`) {
		return `"` + command + `"`
	}

	return command
}

func decodeCommandOutput(data []byte) string {
	if len(data) == 0 {
		return ""
	}

	if utf8.Valid(data) {
		return string(data)
	}

	if runtime.GOOS == "windows" {
		decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes(data)
		if err == nil && utf8.Valid(decoded) {
			return string(decoded)
		}
	}

	return strings.ToValidUTF8(string(data), "�")
}

func runDocker(parent context.Context, image, workDir, command string, timeout time.Duration, memoryMB int) (executionResult, error) {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	name := fmt.Sprintf("yoj-%d", time.Now().UnixNano())
	mountPath := workDir
	if runtime.GOOS == "windows" {
		mountPath = filepath.ToSlash(workDir)
	}
	args := []string{
		"run", "--rm",
		"--name", name,
		"--network", "none",
		"--cpus", "1",
		"-m", fmt.Sprintf("%dm", maxInt(memoryMB, 32)),
		"-v", mountPath + ":/workspace",
		"-w", "/workspace",
		image,
		"sh", "-lc", command,
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	result := executionResult{
		ExitCode: 0,
		Stdout:   decodeCommandOutput(stdout.Bytes()),
		Stderr:   decodeCommandOutput(stderr.Bytes()),
		Duration: duration,
	}

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		result.TimedOut = true
		_ = exec.Command("docker", "kill", name).Run()
		return result, nil
	}
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
			return result, nil
		}
		return result, err
	}
	return result, nil
}

func normalizeOutput(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	lines := strings.Split(value, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
