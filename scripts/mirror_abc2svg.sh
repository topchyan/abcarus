#!/usr/bin/env bash
set -euo pipefail

remote="${ABC2SVG_FOSSIL_REMOTE:-https://chiselapp.com/user/moinejf/repository/abc2svg}"
repository="${1:-scripts/local/upstream-mirrors/abc2svg.fossil}"

command -v fossil >/dev/null 2>&1 || {
  echo "fossil is required to mirror abc2svg" >&2
  exit 1
}

mkdir -p "$(dirname "$repository")"
if [[ -f "$repository" ]]; then
  fossil pull -R "$repository" "$remote"
else
  fossil clone "$remote" "$repository"
fi

fossil info -R "$repository"
