#!/usr/bin/env bash
# deploy.sh — the Arad CRM-OS deploy engine (E01-F01).
#
# Build → ship → migrate → restart → smoke, for one or more apps of the
# bundled `arad-crm` slug. The per-surface wrappers (deploy-mizro-crm-prod.sh,
# deploy-ops-prod.sh) are one line each; everything real lives here.
#
# 🔥 FIRE AND FORGET by default: the run detaches, logs to deploy/logs/, and
# this command returns immediately with the log path. Re-running is safe at
# every step — images are content-addressed by tag, migrations are tracked by
# drizzle's journal, and compose restarts are idempotent.
#
# Usage:
#   bash scripts/deploy/deploy.sh api worker web-seller
#   bash scripts/deploy/deploy.sh ops --foreground
#   bash scripts/deploy/deploy.sh api --tag abc1234 --skip-migrate
#   bash scripts/deploy/deploy.sh api --dry-run          # print the plan only
#
# Flags:
#   --foreground     run inline instead of detaching (CI, or when you want to watch)
#   --dry-run        print every step without touching the pool
#   --tag <T>        image tag (default: short HEAD, with -dirty if the tree is)
#   --skip-migrate   ship without running the migrate profile
#   --seed           run the seed profile after migrating (idempotent)
#   --skip-smoke     skip the post-deploy public check
#   --local-build    build here instead of on MVPOOL_BUILD_HOST (default today)
#
# Environment:
#   MVPOOL_HOST      ssh alias of the pool           (default: aradap)
#   REGISTRY         image name prefix on the pool   (default: mvpool)
#   SLUG             pool slug                       (default: from apps.tsv)

set -euo pipefail

HERE="$(cd "$(dirname "$(readlink -f "$0" || echo "$0")")" && pwd)"
PROJECT_ROOT="$(cd "${HERE}/../.." && pwd)"
cd "$PROJECT_ROOT"

# shellcheck source=_lib.sh
source "${HERE}/_lib.sh"

: "${MVPOOL_HOST:=aradap}"
: "${REGISTRY:=mvpool}"
: "${PLATFORM:=linux/amd64}"

usage() { sed -n '1,32p' "$0"; }

# Kept verbatim so the detached re-exec inherits every flag the operator typed.
ORIG_ARGS=("$@")

APPS=()
FOREGROUND=0
DRY_RUN=0
SKIP_MIGRATE=0
RUN_SEED=0
SKIP_SMOKE=0
TAG=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --foreground|--no-detach) FOREGROUND=1; shift ;;
        --dry-run) DRY_RUN=1; FOREGROUND=1; shift ;;
        --skip-migrate) SKIP_MIGRATE=1; shift ;;
        --seed) RUN_SEED=1; shift ;;
        --skip-smoke) SKIP_SMOKE=1; shift ;;
        --local-build) shift ;;  # accepted + ignored: local build is the default
        --tag) TAG="$2"; shift 2 ;;
        --tag=*) TAG="${1#*=}"; shift ;;
        --help|-h) usage; exit 0 ;;
        -*) lib::log error "unknown flag: $1"; usage; exit 2 ;;
        *) APPS+=("$1"); shift ;;
    esac
done

(( ${#APPS[@]} > 0 )) || { lib::log error "no apps given"; usage; exit 2; }

for app in "${APPS[@]}"; do
    lib::app_field "$app" slug >/dev/null || {
        lib::log error "unknown app '${app}' — not in deploy/apps.tsv"
        exit 2
    }
    [[ -f "deploy/Dockerfile.${app}" ]] || {
        lib::log error "missing deploy/Dockerfile.${app}"
        exit 2
    }
done

: "${SLUG:=$(lib::app_field "${APPS[0]}" slug)}"

if [[ -z "$TAG" ]]; then
    TAG="$(git rev-parse --short HEAD)"
    # A dirty tree ships something that exists in no commit — the tag says so
    # rather than pretending the deployed image is that commit.
    if [[ -n "$(git status --porcelain)" ]]; then
        TAG="${TAG}-dirty"
        lib::log warn "working tree is dirty — tagging ${TAG}"
    fi
fi

# ─── detach (the fire-and-forget contract) ───────────────────────────────────
# Re-exec ourselves with --foreground under nohup so an ssh drop or a closed
# terminal cannot kill a half-finished deploy. The parent prints where to look
# and exits 0 — "it started", not "it worked". Read the log for the verdict.
if (( FOREGROUND == 0 )); then
    mkdir -p deploy/logs
    LOG="deploy/logs/$(date '+%Y%m%d-%H%M%S')-${APPS[*]}-${TAG}.log"
    LOG="${LOG// /-}"
    # --tag is passed explicitly so the detached run ships exactly the tag this
    # invocation resolved, even if HEAD moves while it runs.
    nohup bash "$0" "${ORIG_ARGS[@]}" --foreground --tag "$TAG" >"$LOG" 2>&1 &
    lib::log ok "deploy started in the background (pid $!)"
    echo "    tag:    ${TAG}" >&2
    echo "    log:    ${LOG}" >&2
    echo "    follow: tail -f ${LOG}" >&2
    exit 0
fi

# ─── plan ────────────────────────────────────────────────────────────────────
lib::log warn "PRODUCTION deploy"
lib::log info "plan"
{
    echo "    apps         ${APPS[*]}"
    echo "    slug         ${SLUG}"
    echo "    pool         ${MVPOOL_HOST}"
    echo "    image tag    ${TAG}"
    echo "    migrate      $([ "$SKIP_MIGRATE" -eq 1 ] && echo skip || echo yes)"
    echo "    seed         $([ "$RUN_SEED" -eq 1 ] && echo yes || echo no)"
    echo "    smoke        $([ "$SKIP_SMOKE" -eq 1 ] && echo skip || echo yes)"
} >&2

run() {
    if (( DRY_RUN == 1 )); then
        printf '    %s%s%s\n' "$LIB_C_DIM" "$*" "$LIB_C_RESET" >&2
        return 0
    fi
    "$@"
}

# ─── step 1: build ───────────────────────────────────────────────────────────
# Self-contained Dockerfiles (deploy/Dockerfile.<app>) build from the repo root
# so the workspace packages and the foundation submodule are in context.
BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
for app in "${APPS[@]}"; do
    image="$(lib::app_field "$app" image)"
    lib::log info "building ${app} → ${REGISTRY}/${image}:${TAG}"
    api_base=""
    if [[ "$app" == web-seller || "$app" == web-admin || "$app" == ops ]]; then
        # Next bakes the API origin into the client bundle at build time.
        api_base="https://$(lib::app_field api public_host)"
    fi
    run docker build \
        --platform "$PLATFORM" \
        -f "deploy/Dockerfile.${app}" \
        -t "${REGISTRY}/${image}:${TAG}" \
        --build-arg "IMAGE_TAG=${TAG}" \
        --build-arg "BUILD_TIME=${BUILD_TIME}" \
        ${api_base:+--build-arg "NEXT_PUBLIC_API_BASE_URL=${api_base}"} \
        .
done

# ─── step 2: ship (tarball mode — the pool has no registry) ──────────────────
for app in "${APPS[@]}"; do
    image="$(lib::app_field "$app" image)"
    lib::log info "shipping ${image}:${TAG} to ${MVPOOL_HOST}"
    if (( DRY_RUN == 1 )); then
        printf '    %sdocker save %s/%s:%s | gzip | ssh %s docker load%s\n' \
            "$LIB_C_DIM" "$REGISTRY" "$image" "$TAG" "$MVPOOL_HOST" "$LIB_C_RESET" >&2
    else
        lib::retry 3 "ship ${image}" bash -c \
            "docker save '${REGISTRY}/${image}:${TAG}' | gzip -1 | ssh '${MVPOOL_HOST}' 'gunzip | docker load'"
    fi
done

# ─── step 3: pin the tag the slug runs ───────────────────────────────────────
# Every service in deploy/compose.yaml reads ${IMAGE_TAG}, so one line in .env
# moves the whole slug — and `mvpool rollback` stays atomic.
lib::log info "pinning IMAGE_TAG=${TAG} in /srv/apps/${SLUG}/.env"
run ssh "$MVPOOL_HOST" "set -e
    cd /srv/apps/${SLUG}
    if grep -q '^IMAGE_TAG=' .env; then
        sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|' .env
    else
        echo 'IMAGE_TAG=${TAG}' >> .env
    fi
    grep -q '^REGISTRY=' .env || echo 'REGISTRY=${REGISTRY}' >> .env"

# ─── step 4: migrate BEFORE the api/worker restart ───────────────────────────
# Order matters: the new schema must exist before the new code that expects it
# starts serving. The migrate profile runs the same image we just shipped.
if (( SKIP_MIGRATE == 0 )); then
    lib::log info "running migrations"
    run ssh "$MVPOOL_HOST" \
        "cd /srv/apps/${SLUG} && docker compose --profile tools run --rm migrate"
    lib::log ok "migrations applied"
else
    lib::log warn "skipping migrations (--skip-migrate)"
fi

if (( RUN_SEED == 1 )); then
    lib::log info "running seed"
    run ssh "$MVPOOL_HOST" \
        "cd /srv/apps/${SLUG} && docker compose --profile tools run --rm seed"
fi

# ─── step 5: restart just the services we shipped ────────────────────────────
services="${APPS[*]}"
lib::log info "recreating: ${services}"
run ssh "$MVPOOL_HOST" \
    "cd /srv/apps/${SLUG} && docker compose up -d --force-recreate ${services}"

# ─── step 6: smoke ───────────────────────────────────────────────────────────
if (( SKIP_SMOKE == 0 && DRY_RUN == 0 )); then
    failed=0
    for app in "${APPS[@]}"; do
        host="$(lib::app_field "$app" public_host)"
        path="$(lib::app_field "$app" smoke_path)"
        # '-' means the app has no HTTP surface (worker).
        [[ "$host" == "-" || "$path" == "-" ]] && continue
        lib::smoke "$host" "$path" || failed=1
    done
    if (( failed == 1 )); then
        lib::log error "deploy shipped but a smoke check failed — check the logs on the pool"
        exit 1
    fi
fi

lib::log ok "deployed ${APPS[*]} @ ${TAG}"
for app in "${APPS[@]}"; do
    host="$(lib::app_field "$app" public_host)"
    [[ "$host" == "-" ]] && continue
    echo "    https://${host}/" >&2
done
echo "    logs: ssh ${MVPOOL_HOST} 'cd /srv/apps/${SLUG} && docker compose logs -f ${APPS[*]}'" >&2
