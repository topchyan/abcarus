#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rm -rf "${repo_root}/third_party/python-runtime"
bash "${repo_root}/scripts/build_appimage.sh"
