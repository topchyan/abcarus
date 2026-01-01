#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

appimagetool_path="${repo_root}/../appimagetool/appimagetool-x86_64.AppImage"
python_bin="python3"
output_path="${repo_root}/dist/appimage/ABCarus-x86_64.AppImage"

if [[ ! -x "${appimagetool_path}" ]]; then
  echo "appimagetool not executable: ${appimagetool_path}"
  echo "Expected: ${appimagetool_path}"
  exit 1
fi

PYTHON="${python_bin}" bash "${repo_root}/scripts/sync_python_runtime.sh"
bash "${repo_root}/scripts/build_appimage.sh" --python-root "${repo_root}/third_party/python-runtime"

appdir="${repo_root}/dist/appimage/AppDir"
if [[ -f "${output_path}" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_path="${output_path%.AppImage}.backup-${ts}.AppImage"
  echo "Backing up existing AppImage:"
  echo "  ${output_path}"
  echo "  -> ${backup_path}"
  cp -a "${output_path}" "${backup_path}"
fi
"${appimagetool_path}" "${appdir}" "${output_path}"

echo "Release AppImage created at: ${output_path}"
