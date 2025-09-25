$ErrorActionPreference = 'Stop'

# Move to project root reliably
try {
  $projRoot = $null
  if ($PSScriptRoot) {
    $projRoot = (Resolve-Path (Join-Path $PSScriptRoot '..'))
  } else {
    $projRoot = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..'))
  }
  Set-Location -Path $projRoot
} catch {
  Write-Host "Warning: failed to set project root: $($_.Exception.Message)"
}

Write-Host "Running self-test with safe defaults..."
$env:TEST_REMOTE_DIR = $env:TEST_REMOTE_DIR -as [string]
if (-not $env:TEST_REMOTE_DIR -or $env:TEST_REMOTE_DIR.Trim() -eq '') {
  $env:TEST_REMOTE_DIR = "/var/services/homes/svc_mcp/tmp"
}
if (-not $env:SELFTEST_REMOTE_READ -or $env:SELFTEST_REMOTE_READ.Trim() -eq '') {
  $env:SELFTEST_REMOTE_READ = "/proc/version"
}
if (-not $env:SELFTEST_REMOTE_SCAN_DIR -or $env:SELFTEST_REMOTE_SCAN_DIR.Trim() -eq '') {
  $env:SELFTEST_REMOTE_SCAN_DIR = "/tmp"
}

# Ensure logs directory exists before tee
$cwd = (Get-Location).Path
$logDir = Join-Path $cwd 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logPath = Join-Path $logDir 'selftest.log'

try {
  node src/index.js self-test --print-paths | Tee-Object -FilePath $logPath -Append
} catch {
  Write-Host "Tee to log failed: $($_.Exception.Message). Printing only..."
  node src/index.js self-test --print-paths
}

Pop-Location
