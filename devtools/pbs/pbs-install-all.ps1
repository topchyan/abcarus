param(
  [ValidateSet("win-x64")]
  [string]$Platform = "win-x64"
)

$ErrorActionPreference = "Stop"
powershell -ExecutionPolicy Bypass -File devtools/pbs/pbs-install-windows.ps1 -Platform $Platform

