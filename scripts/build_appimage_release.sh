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
"${appimagetool_path}" "${appdir}" "${output_path}"

echo "Release AppImage created at: ${output_path}"
