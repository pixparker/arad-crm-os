#!/usr/bin/env bash
# deploy-ops-prod.sh — the Arad control plane at ops.aradap.ir (the demo's
# step 1): register businesses, create users, connect providers, edit platform
# settings.
#
# Deployed independently of the tenant stack on purpose (ADR-013 §4): an ops
# change must never require restarting the API a seller is mid-visit on.
#
# Fire and forget; flags pass through to scripts/deploy/deploy.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0" || echo "$0")")" && pwd)"
# The ops panel is a pure client of the API — no migration of its own.
exec bash "${HERE}/deploy.sh" ops --skip-migrate "$@"
