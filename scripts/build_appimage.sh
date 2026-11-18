#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

appdir="${repo_root}/dist/appimage/AppDir"
app_name="abcarus"
desktop_id="com.abcarus.ABCarus"
electron_dist="${repo_root}/node_modules/electron/dist"
icon_path="${repo_root}/assets/icons/icon.png"
metainfo_path="${repo_root}/assets/appstream/${desktop_id}.metainfo.xml"
appdata_path="${appdir}/usr/share/metainfo/${desktop_id}.appdata.xml"
python_embed_root="${repo_root}/third_party/python-embed/linux-x64"
clean=1

appdir="$(cd "${repo_root}" && mkdir -p "${appdir}" && cd "${appdir}" && pwd)"

if [[ ! -d "${electron_dist}" ]]; then
  echo "Electron dist not found: ${electron_dist}"
  exit 1
fi

if [[ ! -f "${icon_path}" ]]; then
  echo "Icon not found: ${icon_path}"
  exit 1
fi

if [[ ! -f "${metainfo_path}" ]]; then
  echo "AppStream metainfo not found: ${metainfo_path}"
  exit 1
fi

if [[ "${clean}" == "1" ]]; then
  rm -rf "${appdir}"
  mkdir -p "${appdir}"
fi

usr_dir="${appdir}/usr"
electron_dst="${usr_dir}/lib/${app_name}/electron"
resources_app="${electron_dst}/resources/app"

mkdir -p "${usr_dir}/bin" "${electron_dst}" "${resources_app}"

cp -a "${electron_dist}/." "${electron_dst}/"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude ".git" \
    --exclude ".agents" \
    --exclude ".claude" \
    --exclude ".github" \
    --exclude ".playwright-cli" \
    --exclude ".vscode" \
    --exclude "dist" \
    --exclude "node_modules" \
    --exclude "devtools" \
    --exclude "docs" \
    --exclude "kitchen" \
    --exclude "debug_dumps" \
    --exclude "output" \
    --exclude "scripts" \
    --exclude "assets/brand" \
    --exclude "third_party/_upd" \
    --exclude "third_party/python-embed" \
    --exclude "*.md" \
    "${repo_root}/" "${resources_app}/"
else
  (
    cd "${repo_root}"
    tar \
      --exclude "./.git" \
      --exclude "./.agents" \
      --exclude "./.claude" \
      --exclude "./.github" \
      --exclude "./.playwright-cli" \
      --exclude "./.vscode" \
      --exclude "./dist" \
      --exclude "./node_modules" \
      --exclude "./devtools" \
      --exclude "./docs" \
      --exclude "./kitchen" \
      --exclude "./debug_dumps" \
      --exclude "./output" \
      --exclude "./scripts" \
      --exclude "./assets/brand" \
      --exclude "./third_party/_upd" \
      --exclude "./third_party/python-embed" \
      --exclude "./*.md" \
      -cf - . | (cd "${resources_app}" && tar -xf -)
  )
fi

cat > "${usr_dir}/bin/${app_name}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
APPDIR="$(cd "${HERE}/../.." && pwd)"
ELECTRON_BIN="${APPDIR}/usr/lib/abcarus/electron/electron"
APP_PATH="${APPDIR}/usr/lib/abcarus/electron/resources/app"
export PATH="${APPDIR}/usr/bin:${PATH}"
exec "${ELECTRON_BIN}" "${APP_PATH}" "$@"
EOF
chmod 755 "${usr_dir}/bin/${app_name}"

cat > "${appdir}/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
if [[ -f "${HERE}/ABCarus.portable" ]]; then
  export ABCARUS_PORTABLE_DIR="${HERE}"
fi
exec "${HERE}/usr/bin/abcarus" "$@"
EOF
chmod 755 "${appdir}/AppRun"

mkdir -p "${appdir}/usr/share/applications"
cat > "${appdir}/${desktop_id}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ABCarus
Comment=Edit, render, and play ABC notation
Exec=${app_name}
Icon=${app_name}
Categories=AudioVideo;Audio;Music;
MimeType=text/x-abc;application/x-abc;
Terminal=false
EOF

cp "${appdir}/${desktop_id}.desktop" "${appdir}/usr/share/applications/${desktop_id}.desktop"

cp "${icon_path}" "${appdir}/${app_name}.png"

mkdir -p "${appdir}/usr/share/metainfo"
cp "${metainfo_path}" "${appdata_path}"

if command -v appstreamcli >/dev/null 2>&1; then
  appstreamcli validate --no-net "${appdata_path}"
fi

python_root="${python_embed_root}"
if [[ ! -x "${python_root}/bin/python3" ]]; then
  echo "Bundled Python runtime not found at: ${python_root}"
  echo "Install it via:"
  echo "  node devtools/pbs/pbs-update-lock.mjs --platform=linux-x64 --py=3.11 --flavor=install_only_stripped"
  echo "  bash devtools/pbs/pbs-install-unix.sh linux-x64"
  exit 1
fi

node "${repo_root}/scripts/bundle_python_appimage.mjs" --appdir "${appdir}" --python-root "${python_root}"

echo "AppDir prepared at: ${appdir}"
echo "Next: appimagetool ${appdir} ABCarus-x86_64.AppImage"
