$logPath = "C:\Scripts\choco-recover.log"
"---- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ----" | Out-File $logPath -Append
# Clear any stale lock folders under lib-bad
$bad = Join-Path $env:ChocolateyInstall "lib-bad"
if (Test-Path $bad) { Get-ChildItem $bad -Directory | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
# Retry with relaxed checksums only for this run if needed
choco upgrade all -y --ignore-checksums | Out-File $logPath -Append
