# Chocolatey Daily Check Script (ASCII-only)
$BaseDir = "C:\Scripts\Choco"
$LogDir  = Join-Path $BaseDir "logs"
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogFile = Join-Path $LogDir ("choco-dailycheck-{0:yyyyMMdd-HHmm}.log" -f (Get-Date))

function Log($msg) {
    ("{0:u} {1}" -f (Get-Date), $msg) | Tee-Object -File $LogFile -Append | Out-Null
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force | Out-Null

Log "=== Chocolatey Daily Package Status Check START ==="

# List all outdated packages
$out = choco outdated 2>&1
if ($out -and ($out | Where-Object { $_ -match '\S' })) {
    Log "OUTDATED PACKAGES:"
    $out | Tee-Object -File $LogFile -Append | Out-Null
} else {
    Log "No outdated packages found."
}

# Explicit KeePassXC status
$kpxc = choco list keepassxc --local-only -r 2>$null
if ($kpxc) {
    Log ("KeePassXC installed: {0}" -f $kpxc)
} else {
    Log "KeePassXC not installed."
}

Log "=== Chocolatey Daily Package Status Check SUCCESS ==="
