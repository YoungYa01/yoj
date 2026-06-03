$env:GOCACHE = "D:\code\go\yoj\.cache\go-build"
$env:GOPATH = "D:\code\go\yoj\.gopath"
Set-Location "D:\code\go\yoj\server"
go run ./cmd/api
