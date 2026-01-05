param(
  [ValidateSet("win-x64")]
  [string]$Platform = "win-x64"
)

$ErrorActionPreference = "Stop"
node devtools/pbs/pbs-update-lock.mjs --platform=$Platform --py=3.11 --flavor=install_only_stripped

