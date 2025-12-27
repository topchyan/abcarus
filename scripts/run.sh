#!/usr/bin/env bash
set -euo pipefail

APPDIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APPDIR"

# Вариант 1: через npm script (если у вас настроен)
# npm start

# Вариант 2: напрямую electron
./node_modules/.bin/electron .
