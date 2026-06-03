package model

import "gorm.io/gorm"

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&Problem{},
		&Tag{},
		&TestCase{},
		&Contest{},
		&ContestProblem{},
		&ContestParticipant{},
		&Submission{},
		&SubmissionResult{},
	)
}
