# Poller script: checks for a flag file on the NAS share
$flag = "\\johinke-developments\Triggers\choco-run.flag"

if (Test-Path $flag) {
    Write-Output "[$(Get-Date)] Flag detected, running Chocolatey maintenance..."
    powershell -ExecutionPolicy Bypass -File "C:\Scripts\choco-maintenance.ps1"
    Remove-Item $flag -Force
}
