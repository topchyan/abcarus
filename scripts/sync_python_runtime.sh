#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest_root="${repo_root}/third_party/python-runtime"
python_bin="${PYTHON:-python3}"

if ! command -v "${python_bin}" >/dev/null 2>&1; then
  echo "Python not found: ${python_bin}"
  exit 1
fi

mapfile -t py_info < <(
  "${python_bin}" - <<'PY'
import sys, sysconfig
paths = sysconfig.get_paths()
exe = sys.executable
stdlib = paths.get("stdlib") or ""
platstdlib = paths.get("platstdlib") or ""
libdir = sysconfig.get_config_var("LIBDIR") or ""
ldlib = sysconfig.get_config_var("LDLIBRARY") or ""
version = sysconfig.get_python_version()
print(exe)
print(stdlib)
print(platstdlib)
print(libdir)
print(ldlib)
print(version)
PY
)

py_exe="${py_info[0]:-}"
py_stdlib="${py_info[1]:-}"
py_platstdlib="${py_info[2]:-}"
py_libdir="${py_info[3]:-}"
py_ldlib="${py_info[4]:-}"
py_version="${py_info[5]:-}"

if [[ -z "${py_exe}" || -z "${py_stdlib}" ]]; then
  echo "Failed to locate Python runtime paths."
  exit 1
fi

rm -rf "${dest_root}"
mkdir -p "${dest_root}/bin" "${dest_root}/lib"

py_exe_real="${py_exe}"
if [[ -L "${py_exe}" ]]; then
  py_exe_real="$(readlink -f "${py_exe}")"
fi

cp -aL "${py_exe_real}" "${dest_root}/bin/python3"
chmod 755 "${dest_root}/bin/python3"

stdlib_dir_name="python${py_version}"
mkdir -p "${dest_root}/lib/${stdlib_dir_name}"
cp -a "${py_stdlib}/." "${dest_root}/lib/${stdlib_dir_name}/"

if [[ -n "${py_platstdlib}" && "${py_platstdlib}" != "${py_stdlib}" ]]; then
  cp -a "${py_platstdlib}/." "${dest_root}/lib/${stdlib_dir_name}/"
fi

if [[ -n "${py_libdir}" && -n "${py_ldlib}" && -f "${py_libdir}/${py_ldlib}" ]]; then
  cp -a "${py_libdir}/${py_ldlib}" "${dest_root}/lib/"
fi

echo "Python runtime synced to: ${dest_root}"
