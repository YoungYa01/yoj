package model

import (
	"time"

	"gorm.io/gorm"
)

const (
	RoleUser  = "user"
	RoleAdmin = "admin"

	StatusPending             = "Pending"
	StatusJudging             = "Judging"
	StatusAccepted            = "Accepted"
	StatusWrongAnswer         = "Wrong Answer"
	StatusCompileError        = "Compile Error"
	StatusRuntimeError        = "Runtime Error"
	StatusTimeLimitExceeded   = "Time Limit Exceeded"
	StatusMemoryLimitExceeded = "Memory Limit Exceeded"
	StatusSystemError         = "System Error"

	LanguageGo     = "go"
	LanguageC      = "c"
	LanguageCPP    = "cpp"
	LanguagePython = "python"
)

type User struct {
	gorm.Model
	Username     string `gorm:"type:varchar(64);uniqueIndex;not null"`
	Nickname     string `gorm:"type:varchar(64);not null;default:''"`
	AvatarURL    string `gorm:"type:varchar(512);not null;default:''"`
	CoverURL     string `gorm:"type:varchar(512);not null;default:''"`
	PasswordHash string `gorm:"type:varchar(255);not null"`
	Role         string `gorm:"type:varchar(32);not null;default:user"`
}

type Problem struct {
	gorm.Model
	Title             string     `gorm:"type:varchar(255);not null"`
	Slug              string     `gorm:"type:varchar(255);uniqueIndex;not null"`
	Description       string     `gorm:"type:longtext;not null"`
	InputDescription  string     `gorm:"type:text"`
	OutputDescription string     `gorm:"type:text"`
	Difficulty        string     `gorm:"type:varchar(32);not null;default:Easy"`
	TimeLimitMS       int        `gorm:"not null;default:1000"`
	MemoryLimitMB     int        `gorm:"not null;default:128"`
	Hint              string     `gorm:"type:text"`
	IsPublished       bool       `gorm:"not null;default:true"`
	SubmitCount       int64      `gorm:"not null;default:0"`
	AcceptCount       int64      `gorm:"not null;default:0"`
	Tags              []Tag      `gorm:"many2many:problem_tags;constraint:OnDelete:CASCADE;"`
	TestCases         []TestCase `gorm:"constraint:OnDelete:CASCADE;"`
}

type Tag struct {
	gorm.Model
	Name string `gorm:"type:varchar(64);uniqueIndex;not null"`
}

type TestCase struct {
	gorm.Model
	ProblemID      uint   `gorm:"not null;index"`
	Input          string `gorm:"type:longtext;not null"`
	ExpectedOutput string `gorm:"type:longtext;not null"`
	IsSample       bool   `gorm:"not null;default:false"`
	SortOrder      int    `gorm:"not null;default:0"`
}

type Submission struct {
	gorm.Model
	UserID       uint   `gorm:"not null;index"`
	ProblemID    uint   `gorm:"not null;index"`
	ContestID    *uint  `gorm:"index"`
	Language     string `gorm:"type:varchar(32);not null"`
	Code         string `gorm:"type:longtext;not null"`
	Status       string `gorm:"type:varchar(64);not null;index"`
	TimeUsedMS   int    `gorm:"not null;default:0"`
	MemoryUsedKB int    `gorm:"not null;default:0"`
	ErrorMessage string `gorm:"type:text"`
	User         User
	Problem      Problem
	Contest      Contest
	Results      []SubmissionResult `gorm:"constraint:OnDelete:CASCADE;"`
}

type SubmissionResult struct {
	gorm.Model
	SubmissionID uint   `gorm:"not null;index"`
	TestCaseID   uint   `gorm:"not null;index"`
	Status       string `gorm:"type:varchar(64);not null"`
	TimeUsedMS   int    `gorm:"not null;default:0"`
	MemoryUsedKB int    `gorm:"not null;default:0"`
	Output       string `gorm:"type:longtext"`
	Expected     string `gorm:"type:longtext"`
	ErrorMessage string `gorm:"type:text"`
	TestCase     TestCase
}

type Contest struct {
	gorm.Model
	Title        string    `gorm:"type:varchar(255);not null"`
	Description  string    `gorm:"type:text"`
	StartTime    time.Time `gorm:"not null;index"`
	EndTime      time.Time `gorm:"not null;index"`
	IsPublic     bool      `gorm:"not null;default:true"`
	CreatedByID  uint      `gorm:"not null;index"`
	CreatedBy    User
	Problems     []ContestProblem     `gorm:"constraint:OnDelete:CASCADE;"`
	Participants []ContestParticipant `gorm:"constraint:OnDelete:CASCADE;"`
}

type ContestProblem struct {
	gorm.Model
	ContestID uint `gorm:"not null;uniqueIndex:idx_contest_problem"`
	ProblemID uint `gorm:"not null;uniqueIndex:idx_contest_problem"`
	SortOrder int  `gorm:"not null;default:0"`
	Score     int  `gorm:"not null;default:100"`
	Problem   Problem
}

type ContestParticipant struct {
	gorm.Model
	ContestID uint `gorm:"not null;uniqueIndex:idx_contest_participant"`
	UserID    uint `gorm:"not null;uniqueIndex:idx_contest_participant"`
	User      User
}
