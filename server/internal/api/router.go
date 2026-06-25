package api

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/yoj/yoj/server/internal/config"
	"github.com/yoj/yoj/server/internal/queue"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB         *gorm.DB
	Redis      *redis.Client
	Config     config.Config
	JudgeQueue *queue.Dispatcher
}

type Server struct {
	db         *gorm.DB
	redis      *redis.Client
	config     config.Config
	judgeQueue *queue.Dispatcher
}

func NewRouter(deps Dependencies) *gin.Engine {
	server := &Server{
		db:         deps.DB,
		redis:      deps.Redis,
		config:     deps.Config,
		judgeQueue: deps.JudgeQueue,
	}

	router := gin.Default()
	router.Use(cors.New(cors.Config{
		AllowOrigins:     deps.Config.CORSAllowOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	router.Static("/uploads", "./uploads")

	api := router.Group("/api/v1")
	{
		api.GET("/health", server.health)

		auth := api.Group("/auth")
		auth.POST("/register", server.register)
		auth.POST("/login", server.login)
		auth.GET("/me", server.authRequired(), server.me)

		api.GET("/users/me/profile", server.authRequired(), server.getMyProfile)
		api.PUT("/users/me/profile", server.authRequired(), server.updateMyProfile)
		api.POST("/users/me/avatar", server.authRequired(), server.uploadMyAvatar)
		api.POST("/users/me/cover", server.authRequired(), server.uploadMyCover)
		api.PUT("/users/me/password", server.authRequired(), server.changeMyPassword)
		api.GET("/users/me/activity", server.authRequired(), server.getMyActivity)

		api.GET("/problems", server.optionalAuth(), server.listProblems)
		api.GET("/problems/:id", server.optionalAuth(), server.getProblem)
		api.GET("/problems/:id/submissions", server.authRequired(), server.listProblemSubmissions)
		api.POST("/problems/:id/submit", server.authRequired(), server.submitProblem)
		api.POST("/problems/:id/run", server.authRequired(), server.runProblemSelfTest)
		api.GET("/tags", server.listTags)

		api.GET("/contests", server.optionalAuth(), server.listContests)
		api.GET("/contests/:id", server.optionalAuth(), server.getContest)
		api.POST("/contests/:id/join", server.authRequired(), server.joinContest)
		api.GET("/contests/:id/standings", server.optionalAuth(), server.getContestStandings)
		api.GET("/contests/:id/problems/:problem_id", server.authRequired(), server.getContestProblem)
		api.GET("/contests/:id/problems/:problem_id/submissions", server.authRequired(), server.listContestProblemSubmissions)
		api.POST("/contests/:id/problems/:problem_id/submit", server.authRequired(), server.submitContestProblem)
		api.POST("/contests/:id/problems/:problem_id/run", server.authRequired(), server.runContestProblemSelfTest)

		api.GET("/submissions", server.authRequired(), server.listSubmissions)
		api.GET("/submissions/:id", server.authRequired(), server.getSubmission)

		admin := api.Group("/admin", server.authRequired(), server.adminRequired())
		admin.GET("/dashboard", server.adminDashboard)
		admin.GET("/problems", server.adminListProblems)
		admin.GET("/problems/:id", server.adminGetProblem)
		admin.POST("/problems", server.adminCreateProblem)
		admin.PUT("/problems/:id", server.adminUpdateProblem)
		admin.DELETE("/problems/:id", server.adminDeleteProblem)
		admin.GET("/problems/:id/test-cases", server.adminListTestCases)
		admin.POST("/problems/:id/test-cases", server.adminCreateTestCase)
		admin.PUT("/test-cases/:id", server.adminUpdateTestCase)
		admin.DELETE("/test-cases/:id", server.adminDeleteTestCase)
		admin.GET("/submissions", server.adminListSubmissions)
		admin.POST("/submissions/:id/rejudge", server.adminRejudgeSubmission)
		admin.GET("/tags", server.adminListTags)
		admin.POST("/tags", server.adminCreateTag)
		admin.PUT("/tags/:id", server.adminUpdateTag)
		admin.DELETE("/tags/:id", server.adminDeleteTag)
		admin.GET("/users", server.adminListUsers)
		admin.PUT("/users/:id/role", server.adminUpdateUserRole)
		admin.GET("/contests", server.adminListContests)
		admin.GET("/contests/:id", server.adminGetContest)
		admin.POST("/contests", server.adminCreateContest)
		admin.PUT("/contests/:id", server.adminUpdateContest)
		admin.DELETE("/contests/:id", server.adminDeleteContest)
	}

	return router
}

func (s *Server) health(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok"})
}
