param(
  [string]$Root = '"C:\\Projects"',
  [switch]$Preview,
  [string[]]$ExcludePaths = @()
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $Root

function Resolve-Exclusions {
  param([string[]]$Paths)
  $set = New-Object System.Collections.Generic.HashSet[string]
  foreach ($p in $Paths) {
    try { $full = (Resolve-Path -LiteralPath $p).Path } catch { $full = [System.IO.Path]::GetFullPath((Join-Path $Root $p)) }
    [void]$set.Add($full.ToLowerInvariant())
  }
  return $set
}

$excludeSet = Resolve-Exclusions -Paths $ExcludePaths

function NotExcluded { param($item) return -not $excludeSet.Contains($item.FullName.ToLowerInvariant()) }

Write-Host "Scanning $Root ..." -ForegroundColor Cyan
$targets = [ordered]@{}

# Node/JS artifacts
$targets.node_modules = Get-ChildItem -Recurse -Directory -Filter node_modules -ErrorAction SilentlyContinue | Where-Object { NotExcluded $_ }
$targets.build_dirs   = Get-ChildItem -Recurse -Directory -Include dist,build,.next,out,coverage -ErrorAction SilentlyContinue | Where-Object { NotExcluded $_ }

# Python artifacts
$targets.py_cache     = Get-ChildItem -Recurse -Directory -Include __pycache__,.pytest_cache,.tox,.mypy_cache -ErrorAction SilentlyContinue | Where-Object { NotExcluded $_ }
$targets.venv         = Get-ChildItem -Recurse -Directory -Include .venv,venv -ErrorAction SilentlyContinue | Where-Object { NotExcluded $_ }

# Misc trash files
$targets.trash_files  = Get-ChildItem -Recurse -Force -Include .DS_Store,Thumbs.db -ErrorAction SilentlyContinue | Where-Object { NotExcluded $_ }

# Old archives/logs > 90d
$cutoff = (Get-Date).AddDays(-90)
$targets.old_archives = Get-ChildItem -Recurse -Include *.zip,*.tgz,*.tar.gz,*.log -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff -and (NotExcluded $_) }

# Preview
foreach ($k in $targets.Keys) {
  Write-Host "\nPreview: $k" -ForegroundColor Yellow
  $list = $targets[$k]
  if ($list) { $list | Select-Object FullName, LastWriteTime } else { Write-Host '(none)' }
}

if ($Preview) { Write-Host "\nPreview mode only. Nothing deleted." -ForegroundColor Magenta; exit 0 }

$ans = Read-Host "\nProceed with deletion? (y/N)"
if ($ans -notmatch '^[Yy]') { Write-Host 'Aborted. Nothing deleted.' -ForegroundColor Red; exit 1 }

Write-Host 'Deleting...' -ForegroundColor Cyan
foreach ($dir in @($targets.node_modules + $targets.build_dirs + $targets.py_cache + $targets.venv)) {
  try { if ($dir) { Remove-Item -Recurse -Force -LiteralPath $dir.FullName } } catch { Write-Warning $_ }
}
foreach ($f in @($targets.trash_files + $targets.old_archives)) {
  try { if ($f) { Remove-Item -Force -LiteralPath $f.FullName } } catch { Write-Warning $_ }
}

# Remove empty directories post-clean
Get-ChildItem -Recurse -Directory | Sort-Object FullName -Descending | ForEach-Object {
  try { if (($_ | Get-ChildItem -Force -ErrorAction SilentlyContinue).Count -eq 0) { Remove-Item -Recurse -Force -LiteralPath $_.FullName } } catch {}
}

Write-Host 'Cleanup complete.' -ForegroundColor Green
