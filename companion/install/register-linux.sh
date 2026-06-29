#!/usr/bin/env bash
# Register Battle Standard native messaging host on Linux (Chrome/Chromium).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/install/register-cli.ts"

EXTENSION_ID=""
LAUNCHER=""
DEV=0
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id) EXTENSION_ID="$2"; shift 2 ;;
    --launcher) LAUNCHER="$2"; shift 2 ;;
    --dev-launcher) DEV=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: $0 --extension-id YOUR_CHROME_EXTENSION_ID [--launcher PATH] [--dev-launcher] [--dry-run]"
  exit 1
fi

ARGS=(tsx "$CLI" --extension-id "$EXTENSION_ID" --platform linux)
[[ -n "$LAUNCHER" ]] && ARGS+=(--launcher "$LAUNCHER")
[[ "$DEV" -eq 1 ]] && ARGS+=(--dev-launcher)
[[ "$DRY" -eq 1 ]] && ARGS+=(--dry-run)

npx "${ARGS[@]}"
