$ErrorActionPreference = 'Stop'

param(
  [string]$Name = 'Codex MCP Healthcheck'
)

try {
  schtasks /Change /TN "$Name" /Disable | Out-Null
  Write-Host "Task disabled: $Name"
} catch {
  Write-Error "Failed to disable task '$Name': $($_.Exception.Message)"
}

