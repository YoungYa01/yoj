$env:GOCACHE = "D:\code\go\yoj\.cache\go-build"
$env:GOPATH = "D:\code\go\yoj\.gopath"
$env:YOJ_JUDGE_MODE = "host"
Set-Location "D:\code\go\yoj\server"
go run ./cmd/worker
