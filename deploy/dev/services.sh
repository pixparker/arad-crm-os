#!/usr/bin/env bash
# Thin shim onto the shared portfolio dev stack (foundation/delivery/dev).
# Its whole job is locating the stack — all real logic lives there.
#
#   ./services.sh up | down | reset | status | url | psql
set -euo pipefail

SLUG=crm
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="${ARAD_DEV_HOME:-$REPO/foundation/delivery/dev}"

if [[ ! -x "$STACK/dev.sh" && ! -f "$STACK/dev.sh" ]]; then
  echo "error: shared dev stack not found at $STACK" >&2
  echo "       run 'git submodule update --init foundation', or export ARAD_DEV_HOME" >&2
  exit 1
fi

CMD="${1:-up}"; shift || true
case "$CMD" in
  # 🔒 "down" for ONE product is meaningless on a shared stack, and passing it
  # through would stop every other product's datastore too. Stopping the stack
  # is a deliberate, explicit act.
  down)
    echo "the shared dev stack stays up — it serves every Arad product."
    echo "to stop it for real:  bash $STACK/dev.sh down"
    echo "to drop only this product's data:  pnpm services:reset"
    ;;
  status) exec bash "$STACK/dev.sh" status ;;
  *)      exec bash "$STACK/dev.sh" "$CMD" "$SLUG" "$@" ;;
esac
