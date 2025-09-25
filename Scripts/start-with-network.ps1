$ErrorActionPreference = 'Stop'

function Write-Log($msg) {
  $logDir = Join-Path (Get-Location) 'logs'
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
  $line = "$(Get-Date -Format o) $msg"
  $line | Tee-Object -FilePath (Join-Path $logDir 'service.log') -Append
}

function Load-DotEnv($path) {
  if (-not (Test-Path $path)) { return }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^[A-Za-z_][A-Za-z0-9_]*=') {
      $k,$v = $_.Split('=',2)
      if ($k -and $v -ne $null) {
        [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim())
      }
    }
  }
}

function Wait-NetworkReady {
  param(
    [int]$TimeoutSec = 90
  )
  $tsExe = 'C:\Program Files\Tailscale\tailscale.exe'
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $hosts = @()
  if ($env:DEV_NAS_HOST) { $hosts += $env:DEV_NAS_HOST }
  if ($env:PERSONAL_NAS_HOST) { $hosts += $env:PERSONAL_NAS_HOST }
  if ($hosts.Count -eq 0) { return }
  Write-Log "Waiting for network/Tailscale up to $TimeoutSec seconds..."
  while ((Get-Date) -lt $deadline) {
    $okCount = 0
    foreach ($h in $hosts) {
      try {
        $null = Resolve-DnsName -Name $h -ErrorAction Stop
        $okCount++
      } catch {}
    }
    $tsOk = $false
    if (Test-Path $tsExe) {
      try {
        $out = & "$tsExe" status 2>$null
        if ($out -match 'Backend state: Running') { $tsOk = $true }
      } catch {}
    }
    if ($okCount -eq $hosts.Count -and ($tsOk -or -not (Test-Path $tsExe))) {
      Write-Log "Network ready (DNS ok${if($tsOk){', Tailscale running'}else{''}})."
      return
    }
    Start-Sleep -Seconds 5
  }
  Write-Log "Network wait timed out; continuing anyway."
}

function Ensure-DriveLabels {
  param(
    [string]$DevLetter = 'Y',
    [string]$DevName = 'Johinke Developments',
    [string]$PersonalLetter = 'Z',
    [string]$PersonalName = 'Johinke Personal'
  )
  try { Set-Volume -DriveLetter $DevLetter -NewFileSystemLabel $DevName -ErrorAction SilentlyContinue } catch {}
  try { Set-Volume -DriveLetter $PersonalLetter -NewFileSystemLabel $PersonalName -ErrorAction SilentlyContinue } catch {}
}

Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
cd .. # project root

Write-Log "Loading .env"
Load-DotEnv (Join-Path (Get-Location) '.env')

Wait-NetworkReady -TimeoutSec 90

Write-Log "Mapping NAS drives"
try {
  # Choose shell for child PS scripts (prefer pwsh if present)
  $psShell = (Get-Command pwsh -ErrorAction SilentlyContinue)
  if ($psShell) { $psCmd = 'pwsh' } else { $psCmd = 'powershell' }

  $devHost = $env:NAS_HOST; if ($env:DEV_NAS_HOST) { $devHost = $env:DEV_NAS_HOST }
  $personalHost = $env:PERSONAL_NAS_HOST
  $devShare = $env:NAS_SHARE
  $personalShare = $env:NAS_SHARE
  $mapScript = (Join-Path (Get-Location) 'Scripts\map-nas-drives.ps1')
  $attempts = 0
  $maxAttempts = 5
  do {
    $attempts++
    Write-Log "Drive map attempt $attempts/$maxAttempts"
    try {
      & $psCmd -NoProfile -File $mapScript -DevHost $devHost -DevShare $devShare -DevLetter Y -PersonalHost $personalHost -PersonalShare $personalShare -PersonalLetter Z | Tee-Object -FilePath (Join-Path (Get-Location) 'logs\service.log') -Append
      break
    } catch {
      Write-Log "Map attempt $attempts failed: $($_.Exception.Message)" 
      Start-Sleep -Seconds 10
    }
  } while ($attempts -lt $maxAttempts)
  Ensure-DriveLabels -DevLetter 'Y' -DevName ($env:NAS_DEV_NAME ?? 'Johinke Developments') -PersonalLetter 'Z' -PersonalName ($env:NAS_PERSONAL_NAME ?? 'Johinke Personal')
} catch { Write-Log "Drive mapping error: $($_.Exception.Message)" }

Write-Log "Starting server (npm start)"
$env:NODE_ENV = 'production'
## Skip SSH probe to avoid CPU/IO at boot
$env:NO_SSH_CHECK = '1'
## Cap Node memory to avoid high heap usage on boot
$env:NODE_OPTIONS = '--max-old-space-size=256'
try {
  npm start | Tee-Object -FilePath (Join-Path (Get-Location) 'logs\service.log') -Append
} catch {
  Write-Log "Server failed to start: $($_.Exception.Message)"
}
