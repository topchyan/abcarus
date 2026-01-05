#!/usr/bin/env bash
set -euo pipefail

# Install for the current Unix platform(s). Run this script on the target OS.

if [[ "$(uname -s)" == "Linux" ]]; then
  bash devtools/pbs/pbs-install-unix.sh linux-x64
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  arch="$(uname -m)"
  if [[ "${arch}" == "arm64" ]]; then
    bash devtools/pbs/pbs-install-unix.sh darwin-arm64
  else
    bash devtools/pbs/pbs-install-unix.sh darwin-x64
  fi
  exit 0
fi

echo "Unsupported OS for pbs-install-all.sh: $(uname -s)"
exit 1

