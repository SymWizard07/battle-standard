#!/usr/bin/env bash
set -euo pipefail
HOST_DIR="C:/Users/cade0/source/repos/5e Battle Map Website/companion/tray/resources/host"
MAIN="C:/Users/cade0/source/repos/5e Battle Map Website/companion/tray/resources/host/main.js"
cd "$HOST_DIR"
if command -v node >/dev/null 2>&1; then
  exec node "$MAIN"
fi
if [ -n "${BATTLE_STANDARD_ELECTRON_NODE:-}" ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec "$BATTLE_STANDARD_ELECTRON_NODE" "$MAIN"
fi
echo "Node.js not found. Install Node or set BATTLE_STANDARD_ELECTRON_NODE." >&2
exit 1
