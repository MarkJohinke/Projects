$ErrorActionPreference = 'Stop'

param(
  [string]$Name = 'Codex MCP Healthcheck'
)

try {
  schtasks /Change /TN "$Name" /Enable | Out-Null
  Write-Host "Task enabled: $Name"
} catch {
  Write-Error "Failed to enable task '$Name': $($_.Exception.Message)"
}

