param([switch]$Update)

# --- Paths & logging ---
$BaseDir = "C:\Scripts\Choco"
$LogDir  = Join-Path $BaseDir "logs"
$LogFile = Join-Path $LogDir ("choco-" + ($(if($Update){"update"} else {"install"}) + "-{0:yyyyMMdd-HHmm}.log" -f (Get-Date)))
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

function Log($msg) {
    $ts = (Get-Date).ToString("u")
    "$ts $msg" | Tee-Object -File $LogFile -Append | Out-Null
}

# --- Elevation guard (manual runs only) ---
$IsAdmin  = ([Security.Principal.WindowsPrincipal]([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$IsSystem = $env:USERNAME -eq "SYSTEM"
if (-not ($IsAdmin -or $IsSystem)) {
  Log "Re-launching as Administrator..."
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`" $($args -join ' ')"
  exit
}

# --- Ensure TLS + execution policy for Choco ---
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force | Out-Null

# --- Your package list (KeePassXC instead of KeePass) ---
$Packages = @(
  "python","nodejs","git","vscode","postgresql","qgis","googleearthpro",
  "office365business","r.project","r.studio","pandoc","wkhtmltopdf",
  "microsoft-teams","slack","zoom","synology-drive","7zip","vlc",
  "keepassxc","everything","spotify","steam","obsidian"
)

# --- Function to run Choco commands safely ---
function Run-ChocoCommand($args) {
    $output = choco $args 2>&1
    foreach ($line in $output) {
        if ($line -match "wmic' is not recognized") {
            Log "⚠️  Ignored WMIC warning: $line"
        } else {
            $line | Tee-Object -File $LogFile -Append | Out-Null
        }
    }
}

Log "=== Starting $(if($Update){"FULL UPGRADE (all)"}else{"Selective install/upgrade"}) ==="

if ($Update) {
    Log "Running: choco upgrade all -y"
    Run-ChocoCommand "upgrade all -y --no-progress"

    # Ensure KeePassXC path is in system PATH
    if (-not ($env:PATH -like "*C:\Program Files\KeePassXC*")) {
        setx PATH "$($env:PATH);C:\Program Files\KeePassXC" /M | Out-Null
        Log "Added KeePassXC to PATH"
    }

    Log "Done."
    exit
}

# Selective install/upgrade
$installed = @{}
choco list --local-only -r | ForEach-Object{
  $name = ($_ -split '\|')[0].ToLower()
  $installed[$name] = $true
}

foreach($pkg in $Packages){
  if($installed.ContainsKey($pkg.ToLower())){
    Log "$pkg already installed → upgrading"
    Run-ChocoCommand "upgrade $pkg -y --no-progress"
  } else {
    Log "$pkg not installed → installing"
    Run-ChocoCommand "install $pkg -y --no-progress"
  }
}

# Ensure KeePassXC path is always in system PATH
if (-not ($env:PATH -like "*C:\Program Files\KeePassXC*")) {
    setx PATH "$($env:PATH);C:\Program Files\KeePassXC" /M | Out-Null
    Log "Added KeePassXC to PATH"
}

Log "=== Finished selective run ==="
