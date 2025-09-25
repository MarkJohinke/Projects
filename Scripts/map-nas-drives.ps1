# Maps NAS SMB shares using Windows 'net use'.
# Uses env vars from .env if present; otherwise accepts parameters.

param(
  [string]$DevHost,
  [string]$DevShare = "",
  [string]$DevLetter = "Y",
  [string]$PersonalHost,
  [string]$PersonalShare = "",
  [string]$PersonalLetter = "Z",
  [string]$Username = $env:NAS_USERNAME,
  [string]$Password = $env:NAS_PASSWORD,
  [string]$Domain = $env:NAS_DOMAIN
)

function Map-Drive($letter, $host, $share, $user, $pass, $domain) {
  if (-not $host -or -not $share) { return }
  $drive = "$letter:"
  $path = "\\\\$host\\$share"
  Write-Host "Mapping $drive to $path"
  try {& net use $drive /delete /y | Out-Null } catch {}
  $u = if ($domain) { "$domain\$user" } else { $user }
  if ($pass) {
    & net use $drive $path /user:$u $pass /persistent:yes
  } else {
    & net use $drive $path /user:$u /persistent:yes
  }
}

# Load .env if present (best-effort)
$envPath = Join-Path (Get-Location) ".env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^[A-Za-z_][A-Za-z0-9_]*=') {
      $k,$v = $_.Split('=',2)
      if (-not [string]::IsNullOrWhiteSpace($k)) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim()) }
    }
  }
}

if (-not $DevHost) { $DevHost = $env:NAS_HOST }
if (-not $DevShare) { $DevShare = $env:NAS_SHARE }
if (-not $Username) { $Username = $env:NAS_USERNAME }
if (-not $Password) { $Password = $env:NAS_PASSWORD }
if (-not $Domain) { $Domain = $env:NAS_DOMAIN }

Map-Drive -letter $DevLetter -host $DevHost -share $DevShare -user $Username -pass $Password -domain $Domain
Map-Drive -letter $PersonalLetter -host $PersonalHost -share $PersonalShare -user $Username -pass $Password -domain $Domain

