if (Get-Command refreshenv -ErrorAction SilentlyContinue) { refreshenv }
$logPath = "C:\Scripts\choco-log.txt"
"---- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ----" | Out-File $logPath -Append
choco upgrade all -y | Out-File $logPath -Append
