$ErrorActionPreference = 'Stop'

$taskName = "Codex MCP Healthcheck"
$projPath = "C:\projects"
$xmlPath = Join-Path $projPath "Scripts\codex-mcp-healthcheck.xml"

if (-not (Test-Path $xmlPath)) { Write-Error "XML not found: $xmlPath" }

# Replace placeholders in XML with current user and project path
$xml = Get-Content $xmlPath -Raw
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$xml = $xml -replace 'YOUR-USER-NAME', [Regex]::Escape($user)
$xml = $xml -replace 'C:\\projects', [Regex]::Escape($projPath)

$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value $xml -Encoding Unicode

$service = New-Object -ComObject Schedule.Service
$service.Connect()
$root = $service.GetFolder("\\")

try { $root.DeleteTask($taskName, 0) } catch {}
$root.RegisterTask($taskName, (Get-Content $tmp -Raw), 6, $null, $null, 3, $null) | Out-Null
Remove-Item $tmp -Force
Write-Host "Task installed: $taskName"

Write-Host "To disable after validation: use Task Scheduler UI or run:"
Write-Host "  schtasks /Change /TN \"$taskName\" /Disable"

