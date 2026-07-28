#!/usr/bin/env bash
# deploy-mizro-crm-prod.sh — the seller-facing stack: CRM API + worker + the
# Mizro seller PWA at mizro-crm.aradap.ir (the demo's step 2).
#
# Fire and forget: returns as soon as the background run starts, and prints the
# log path. `bash scripts/deploy/deploy.sh --help` documents every flag; they
# all pass through here.
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0" || echo "$0")")" && pwd)"
exec bash "${HERE}/deploy.sh" api worker web-seller "$@"
