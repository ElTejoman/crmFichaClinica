#!/bin/bash
# Arranca el API en :8000 (desarrollo, SIN docker). Uso:
#   bash scripts/dev/start-api.sh > /tmp/api.log 2>&1 & echo $! > /tmp/api.pid
# `exec` reemplaza este shell por uvicorn: el PID guardado ES el del servidor, así que
# `kill $(cat /tmp/api.pid)` lo detiene de verdad (sin `exec` se mataría un subshell).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"
# shellcheck disable=SC1091
. .venv/bin/activate
exec uvicorn app.main:app --port "${PORT:-8000}"
