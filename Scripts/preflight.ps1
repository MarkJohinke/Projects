Param(
  [string]$DevTarget = "dev",
  [string]$PersonalTarget = "personal",
  [string]$HomeTmp = "/var/services/homes/svc_mcp/tmp",
  [string]$ReadPath = "/proc/version",
  [string]$ScanDir = "/tmp"
)

Write-Host "Preflight: ensuring remote dirs and running self-test..."

function Invoke-ToolExec($target, $command) {
  $json = '{"target":"' + $target + '","command":"' + $command.Replace('"','\"') + '"}'
  curl --% -s -X POST http://localhost:8765/tools/exec -H "Content-Type: application/json" -d $json | Out-Host
}

# Ensure home tmp exists on both NAS
Invoke-ToolExec -target $DevTarget -command "mkdir -p $HomeTmp && ls -ld $HomeTmp"
Invoke-ToolExec -target $PersonalTarget -command "mkdir -p $HomeTmp && ls -ld $HomeTmp"

# Run self-test with recommended env for this session
$env:TEST_REMOTE_DIR = $HomeTmp
$env:SELFTEST_REMOTE_READ = $ReadPath
$env:SELFTEST_REMOTE_SCAN_DIR = $ScanDir

Write-Host "Running self-test with:`n TEST_REMOTE_DIR=$($env:TEST_REMOTE_DIR)`n SELFTEST_REMOTE_READ=$($env:SELFTEST_REMOTE_READ)`n SELFTEST_REMOTE_SCAN_DIR=$($env:SELFTEST_REMOTE_SCAN_DIR)"

npm run self-test

