#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

appimagetool_path="${repo_root}/../appimagetool/appimagetool-x86_64.AppImage"
output_path="${repo_root}/dist/appimage/ABCarus-x86_64.AppImage"

if [[ ! -x "${appimagetool_path}" ]]; then
  echo "appimagetool not executable: ${appimagetool_path}"
  echo "Expected: ${appimagetool_path}"
  exit 1
fi

# Ensure a pinned, portable Python runtime is present (see devtools/pbs/).
bash "${repo_root}/devtools/pbs/pbs-install-unix.sh" linux-x64

bash "${repo_root}/scripts/build_appimage.sh"

appdir="${repo_root}/dist/appimage/AppDir"
if [[ -f "${output_path}" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  backup_path="${output_path%.AppImage}.backup-${ts}.AppImage"
  echo "Backing up existing AppImage:"
  echo "  ${output_path}"
  echo "  -> ${backup_path}"
  cp -a "${output_path}" "${backup_path}"
fi

# appimagetool is itself an AppImage. To avoid FUSE-related issues in CI and
# containers, run it via self-extraction by default.
#
# Set ABCARUS_APPIMAGE_USE_FUSE=1 to run it directly.
if [[ "${ABCARUS_APPIMAGE_USE_FUSE:-0}" == "1" ]]; then
  "${appimagetool_path}" "${appdir}" "${output_path}"
else
  echo "Running appimagetool via self-extraction (set ABCARUS_APPIMAGE_USE_FUSE=1 to disable)"
  extract_dir="${repo_root}/dist/appimage/.appimagetool-extract"
  rm -rf "${extract_dir}"
  mkdir -p "${extract_dir}"
  (
    cd "${extract_dir}"
    "${appimagetool_path}" --appimage-extract >/dev/null
    "${extract_dir}/squashfs-root/AppRun" "${appdir}" "${output_path}"
  )
fi

echo "Release AppImage created at: ${output_path}"
