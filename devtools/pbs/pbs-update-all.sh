#!/usr/bin/env bash
set -euo pipefail

node devtools/pbs/pbs-update-lock.mjs --platform=linux-x64 --py=3.11 --flavor=install_only_stripped
node devtools/pbs/pbs-update-lock.mjs --platform=darwin-x64 --py=3.11 --flavor=install_only_stripped
node devtools/pbs/pbs-update-lock.mjs --platform=darwin-arm64 --py=3.11 --flavor=install_only_stripped
node devtools/pbs/pbs-update-lock.mjs --platform=win-x64 --py=3.11 --flavor=install_only_stripped

