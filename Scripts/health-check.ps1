$ErrorActionPreference = 'Stop'

function Write-HealthLog($msg) {
  $logDir = Join-Path (Get-Location) 'logs'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
  $line = "$(Get-Date -Format o) $msg"
  $line | Tee-Object -FilePath (Join-Path $logDir 'healthcheck.log') -Append | Out-Null
}

Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
cd ..  # project root

$url = $env:HEALTH_URL
if (-not $url -or $url.Trim() -eq '') { $url = 'http://localhost:8765/health' }

Write-HealthLog "Health check start: $url"
$deadline = (Get-Date).AddSeconds(60)
$ok = $false
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-RestMethod -Method GET -Uri $url -TimeoutSec 5 -ErrorAction Stop
    if ($resp.ok -eq $true) {
      Write-HealthLog "OK name=$($resp.name) tls=$($resp.tls) auth=$($resp.auth) targets=$([string]::Join(',', $resp.targets))"
      $ok = $true
      break
    } else {
      Write-HealthLog "Unexpected response: $($resp | ConvertTo-Json -Compress)"
    }
  } catch {
    Write-HealthLog "Not ready: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 3
}

if (-not $ok) {
  Write-HealthLog "FAILED after timeout"
  exit 1
} else {
  Write-HealthLog "SUCCESS"
  # Optionally disable the scheduled task after first success
  $disableFlag = $env:HEALTH_TASK_DISABLE_ON_SUCCESS
  if (-not $disableFlag -or $disableFlag -ne '0') {
    $taskName = $env:HEALTH_TASK_NAME
    if (-not $taskName -or $taskName.Trim() -eq '') { $taskName = 'Codex MCP Healthcheck' }
    try {
      Write-HealthLog "Disabling scheduled task '$taskName'"
      schtasks /Change /TN "$taskName" /Disable | Out-Null
      Write-HealthLog "Task disabled"
    } catch {
      Write-HealthLog "Could not disable task: $($_.Exception.Message)"
    }
  }
  exit 0
}
