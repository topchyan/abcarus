#!/usr/bin/env bash
# devtools/pbs/pbs-install-unix.sh
set -euo pipefail

platform="${1:-}"
if [[ -z "${platform}" ]]; then
  echo "Usage: bash devtools/pbs/pbs-install-unix.sh <linux-x64|darwin-x64|darwin-arm64>"
  exit 1
fi

lock="third_party/python-embed/${platform}/python-build-standalone.lock.json"
dest="third_party/python-embed/${platform}"
cache_dir="third_party/python-embed/.cache/python-build-standalone"

if [[ ! -f "${lock}" ]]; then
  echo "Lock file not found: ${lock}"
  echo "Run: node devtools/pbs/pbs-update-lock.mjs --platform=${platform} --py=3.11 --flavor=install_only_stripped"
  exit 1
fi

asset="$(node -p 'require("./'"${lock}"'").asset')"
sha_expected="$(node -p 'require("./'"${lock}"'").sha256')"
tag="$(node -p 'require("./'"${lock}"'").tag')"
repo="$(node -p 'require("./'"${lock}"'").repo')"

mkdir -p "${cache_dir}" "${dest}"
archive="${cache_dir}/${asset}"

if [[ ! -f "${archive}" ]]; then
  url="https://github.com/${repo}/releases/download/${tag}/${asset}"
  echo "Downloading missing archive: ${url}"
  curl -L --fail -o "${archive}" "${url}"
fi

echo "Verifying sha256..."
sha_actual=""
if command -v sha256sum >/dev/null 2>&1; then
  sha_actual="$(sha256sum "${archive}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  sha_actual="$(shasum -a 256 "${archive}" | awk '{print $1}')"
else
  echo "Missing checksum tool: shasum or sha256sum"
  exit 1
fi

if [[ "${sha_actual}" != "${sha_expected}" ]]; then
  echo "SHA256 mismatch!"
  echo "Expected: ${sha_expected}"
  echo "Actual:   ${sha_actual}"
  exit 1
fi

echo "Installing to: ${dest}"
tmp="${dest}/.install_tmp"
rm -rf "${tmp}"
mkdir -p "${tmp}"

# Archives have a top-level "python/" prefix. Strip it.
tar -xzf "${archive}" -C "${tmp}" --strip-components=1

# Remove previous runtime content, but keep lock + gitkeep.
shopt -s dotglob
for entry in "${dest}"/*; do
  base="$(basename "${entry}")"
  if [[ "${base}" == "python-build-standalone.lock.json" || "${base}" == ".gitkeep" || "${base}" == ".install_tmp" ]]; then
    continue
  fi
  rm -rf "${entry}"
done

mv "${tmp}"/* "${dest}/"
rm -rf "${tmp}"

echo "Done."
echo "Python: ${dest}/bin/python3"
"${dest}/bin/python3" -c 'import sys; print(sys.version); print(sys.executable)'
