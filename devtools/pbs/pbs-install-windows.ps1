param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("win-x64")]
  [string]$Platform
)

$ErrorActionPreference = "Stop"

$lock = Join-Path "third_party/python-embed/$Platform" "python-build-standalone.lock.json"
$dest = "third_party/python-embed/$Platform"
$cacheDir = "third_party/python-embed/.cache/python-build-standalone"

if (!(Test-Path $lock)) {
  Write-Host "Lock file not found: $lock"
  Write-Host "Run: node devtools/pbs/pbs-update-lock.mjs --platform=$Platform --py=3.11 --flavor=install_only_stripped"
  exit 1
}

$lockJson = Get-Content $lock -Raw | ConvertFrom-Json
$asset = $lockJson.asset
$shaExpected = $lockJson.sha256
$tag = $lockJson.tag
$repo = $lockJson.repo

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$archive = Join-Path $cacheDir $asset
if (!(Test-Path $archive)) {
  $url = "https://github.com/$repo/releases/download/$tag/$asset"
  Write-Host "Downloading missing archive: $url"
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
}

Write-Host "Verifying sha256..."
$shaActual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()
if ($shaActual -ne $shaExpected.ToLowerInvariant()) {
  Write-Host "SHA256 mismatch!"
  Write-Host "Expected: $shaExpected"
  Write-Host "Actual:   $shaActual"
  exit 1
}

Write-Host "Installing to: $dest"
$tmp = Join-Path $dest ".install_tmp"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# Extract archive to temp (tar.exe is available on Windows 10/11).
tar -xzf $archive -C $tmp

function Get-PythonCandidates([string]$Root) {
  $out = @()
  $direct = Join-Path $Root "python.exe"
  if (Test-Path $direct) { $out += (Resolve-Path $direct).Path }

  # Depth 1: <root>\<dir>\python.exe
  Get-ChildItem -Force -Path $Root -Directory | ForEach-Object {
    $p1 = Join-Path $_.FullName "python.exe"
    if (Test-Path $p1) { $out += (Resolve-Path $p1).Path }
  }

  # Depth 2: <root>\<dir>\<dir>\python.exe
  Get-ChildItem -Force -Path $Root -Directory | ForEach-Object {
    $d1 = $_.FullName
    Get-ChildItem -Force -Path $d1 -Directory | ForEach-Object {
      $p2 = Join-Path $_.FullName "python.exe"
      if (Test-Path $p2) { $out += (Resolve-Path $p2).Path }
    }
  }

  return $out | Select-Object -Unique
}

function Pick-PythonExe([string]$Root) {
  $candidates = Get-PythonCandidates -Root $Root
  if ($candidates.Count -eq 0) {
    Write-Host "ERROR: python.exe not found under extracted archive (max depth 2)."
    Write-Host "Top-level entries under ${Root}:"
    Get-ChildItem -Force -Path $Root | ForEach-Object { Write-Host ("  - " + $_.Name) }
    exit 1
  }

  $preferred = Join-Path (Join-Path $Root "python") "python.exe"
  if (Test-Path $preferred) { return (Resolve-Path $preferred).Path }

  # Otherwise prefer the shortest path.
  return ($candidates | Sort-Object { $_.Length } | Select-Object -First 1)
}

# Discover python.exe without assuming a fixed layout.
$discoveredTmpPython = Pick-PythonExe -Root $tmp
$discoveredRel = [System.IO.Path]::GetRelativePath((Resolve-Path $tmp).Path, $discoveredTmpPython)

# Remove previous runtime content, but keep lock + gitkeep.
Get-ChildItem -Force -Path $dest | ForEach-Object {
  if ($_.Name -eq "python-build-standalone.lock.json") { return }
  if ($_.Name -eq ".gitkeep") { return }
  Remove-Item -Recurse -Force $_.FullName
}

Get-ChildItem -Force -Path $tmp | ForEach-Object {
  Move-Item -Force $_.FullName (Join-Path $dest $_.Name)
}
Remove-Item -Recurse -Force $tmp

Write-Host "Done."

$pythonExe = Join-Path (Resolve-Path $dest).Path $discoveredRel
if (!(Test-Path $pythonExe)) {
  Write-Host "ERROR: Installed python.exe not found at expected path: $pythonExe"
  exit 1
}
Write-Host "Python: $pythonExe"
try {
  & $pythonExe -c "import sys; print(sys.version); print(sys.executable)"
} catch {
  Write-Host "ERROR: Failed to execute installed python.exe: $pythonExe"
  Write-Host $_
  exit 1
}
