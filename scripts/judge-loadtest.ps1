# 此脚本用于测试并发提交，测试结果会输出在控制台。
# 测试题目是167，语言是Go。

# 基础URL
$base = "http://127.0.0.1:8080/api/v1"
# 题目ID
$problemId = 167
# 测试数量
$count = 40
# 提交并发
$submitConcurrency = 20

# 登录
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

# 获取Token
$login = Invoke-RestMethod `
    -Method Post `
    -Uri "$base/auth/login" `
    -ContentType "application/json" `
    -Body $loginBody

# 获取Token
$token = $login.token

# 源代码
$code = @'
package main

import (
    "fmt"
    "time"
)

func main() {
    time.Sleep(2 * time.Second)
    fmt.Println("OK")
}
'@

# 提交数据
$payload = @{
    language = "go"
    code = $code
} | ConvertTo-Json

# 提交
$watch = [System.Diagnostics.Stopwatch]::StartNew()

# 提交
$results = 1..$count | ForEach-Object -Parallel {
    try {
        $response = Invoke-RestMethod `
            -Method Post `
            -Uri "$using:base/problems/$using:problemId/submit" `
            -Headers @{
                Authorization = "Bearer $using:token"
            } `
            -ContentType "application/json" `
            -Body $using:payload

        [PSCustomObject]@{
            Ok     = $true
            Id     = [int]$response.submission.id
            Http   = 201
            Status = $response.submission.status
            Error  = ""
        }
    }
    catch {
        $statusCode = 0

        try {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        catch {}

        [PSCustomObject]@{
            Ok     = $false
            Id     = 0
            Http   = $statusCode
            Status = ""
            Error  = $_.ErrorDetails.Message
        }
    }
} -ThrottleLimit $submitConcurrency

# 统计结果
$accepted = @($results | Where-Object Ok)
$rejected = @($results | Where-Object { $_.Http -eq 503 })
$failed = @($results | Where-Object { -not $_.Ok -and $_.Http -ne 503 })

# 输出结果
Write-Host ""
Write-Host "已进入队列: $($accepted.Count)"
Write-Host "容量熔断:   $($rejected.Count)"
Write-Host "其他失败:   $($failed.Count)"

# 轮询提交结果
$pending = @{}

# 添加提交
foreach ($item in $accepted) {
    $pending[$item.Id] = $true
}

# 轮询提交结果
$terminal = @{}

# 轮询提交结果
while ($pending.Count -gt 0) {
    Start-Sleep -Milliseconds 800

    foreach ($id in @($pending.Keys)) {
        try {
            $result = Invoke-RestMethod `
                -Method Get `
                -Uri "$base/submissions/$id" `
                -Headers @{
                    Authorization = "Bearer $token"
                }

            $status = $result.submission.status

            if ($status -notin @("Pending", "Judging")) {
                $terminal[$id] = $status
                $pending.Remove($id)
            }
        }
        catch {
            Write-Warning "查询提交 #$id 失败"
        }
    }

    Write-Host "`r已完成 $($terminal.Count)/$($accepted.Count)，剩余 $($pending.Count)    " -NoNewline
}

# 停止计时
$watch.Stop()

# 输出结果
Write-Host ""
Write-Host ""
Write-Host "总耗时: $([math]::Round($watch.Elapsed.TotalSeconds, 2)) 秒"

# 吞吐量
if ($watch.Elapsed.TotalSeconds -gt 0) {
    $throughput = $terminal.Count / $watch.Elapsed.TotalSeconds
    Write-Host "吞吐量: $([math]::Round($throughput, 2)) 个提交/秒"
}

# 统计结果
$terminal.Values |
    Group-Object |
    Select-Object Name, Count |
    Format-Table

Write-Host ""
Write-Host "失败状态码统计："

$results |
    Where-Object { -not $_.Ok } |
    Group-Object Http |
    Select-Object Name, Count |
    Format-Table

Write-Host ""
Write-Host "失败详情："

$results |
    Where-Object { -not $_.Ok } |
    Select-Object Http, Error |
    Format-List