#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

appdir="${repo_root}/dist/appimage/AppDir"
app_name="abcarus"
desktop_id="com.abcarus.ABCarus"
electron_dist="${repo_root}/node_modules/electron/dist"
icon_path="${repo_root}/assets/icons/abcarus_512.png"
python_root="${repo_root}/third_party/python-runtime"
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
    --exclude "dist" \
    --exclude "node_modules" \
    --exclude "devtools" \
    --exclude "docs" \
    --exclude "scripts" \
    --exclude "third_party/python-runtime" \
    --exclude "third_party/python-embed" \
    --exclude "docs/qa/chat-exports" \
    --exclude "*.md" \
    "${repo_root}/" "${resources_app}/"
else
  (
    cd "${repo_root}"
    tar \
      --exclude "./.git" \
      --exclude "./dist" \
      --exclude "./node_modules" \
      --exclude "./devtools" \
      --exclude "./docs" \
      --exclude "./scripts" \
      --exclude "./third_party/python-runtime" \
      --exclude "./third_party/python-embed" \
      --exclude "./docs/qa/chat-exports" \
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
exec "${HERE}/usr/bin/abcarus" "$@"
EOF
chmod 755 "${appdir}/AppRun"

mkdir -p "${appdir}/usr/share/applications"
cat > "${appdir}/${desktop_id}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ABCarus
Exec=${app_name}
Icon=${app_name}
Categories=AudioVideo;Audio;Music;
Terminal=false
EOF

cp "${appdir}/${desktop_id}.desktop" "${appdir}/usr/share/applications/${desktop_id}.desktop"

cp "${icon_path}" "${appdir}/${app_name}.png"

mkdir -p "${appdir}/usr/share/metainfo"
cat > "${appdir}/usr/share/metainfo/${desktop_id}.appdata.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${desktop_id}</id>
  <name>ABCarus</name>
  <summary>ABC notation editor and toolkit</summary>
  <description>
    <p>ABCarus is a small Electron app for editing, converting, and auditioning ABC notation.</p>
    <p>Import and export flows support common MusicXML workflows with bundled tools for portability.</p>
  </description>
  <content_rating type="oars-1.1"/>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>
  <launchable type="desktop-id">${desktop_id}.desktop</launchable>
</component>
EOF

if [[ -d "${python_embed_root}" ]]; then
  python_root="${python_embed_root}"
fi

node "${repo_root}/scripts/bundle_python_appimage.mjs" --appdir "${appdir}" --python-root "${python_root}"

echo "AppDir prepared at: ${appdir}"
echo "Next: appimagetool ${appdir} Abcarus-x86_64.AppImage"
