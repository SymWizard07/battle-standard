#!/usr/bin/env bash
# Register Battle Standard native messaging host for Firefox.
# Firefox addon id from about:debugging (e.g. uuid@temporary-addon for unpacked builds).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/install/register-cli.ts"

FIREFOX_ID=""
LAUNCHER=""
DEV=0
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --firefox-id) FIREFOX_ID="$2"; shift 2 ;;
    --launcher) LAUNCHER="$2"; shift 2 ;;
    --dev-launcher) DEV=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$FIREFOX_ID" ]]; then
  echo "Usage: $0 --firefox-id ADDON_ID@temporary-addon [--launcher PATH] [--dev-launcher] [--dry-run]"
  exit 1
fi

ARGS=(tsx "$CLI" --platform firefox --firefox-id "$FIREFOX_ID")
[[ -n "$LAUNCHER" ]] && ARGS+=(--launcher "$LAUNCHER")
[[ "$DEV" -eq 1 ]] && ARGS+=(--dev-launcher)
[[ "$DRY" -eq 1 ]] && ARGS+=(--dry-run)

npx "${ARGS[@]}"
