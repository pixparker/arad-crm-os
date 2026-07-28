# shellcheck shell=bash
# Arad CRM-OS deploy helpers (E01-F01).
#
# Self-contained on purpose: unlike digital-menu's shim, this does NOT source
# mvpool-local's library. The pool is still an mvpool pool — same slug layout
# (/srv/apps/<slug>), same shared edge/data networks, same tarball image mode —
# but a deploy that only needs "build, ship, restart, smoke" should not fail on
# a laptop that has not installed the CLI.

if [[ -z "${BASH_VERSION:-}" ]]; then
    echo "scripts/deploy/_lib.sh: requires bash" >&2
    return 1 2>/dev/null || exit 1
fi

[[ -n "${ARAD_LIB_SOURCED:-}" ]] && return 0
ARAD_LIB_SOURCED=1

# ─── colours + logging ───────────────────────────────────────────────────────

if [[ -t 2 ]]; then
    LIB_C_RED=$'\033[31m'; LIB_C_GREEN=$'\033[32m'; LIB_C_YELLOW=$'\033[33m'
    LIB_C_BLUE=$'\033[34m'; LIB_C_DIM=$'\033[2m';   LIB_C_RESET=$'\033[0m'
else
    LIB_C_RED=""; LIB_C_GREEN=""; LIB_C_YELLOW=""; LIB_C_BLUE=""; LIB_C_DIM=""; LIB_C_RESET=""
fi

# lib::log <info|ok|warn|error> <message…>
lib::log() {
    local level="$1"; shift
    local ts; ts="$(date '+%H:%M:%S')"
    case "$level" in
        ok)    printf '%s[%s] ✔ %s%s\n' "$LIB_C_GREEN"  "$ts" "$*" "$LIB_C_RESET" >&2 ;;
        warn)  printf '%s[%s] ! %s%s\n' "$LIB_C_YELLOW" "$ts" "$*" "$LIB_C_RESET" >&2 ;;
        error) printf '%s[%s] ✖ %s%s\n' "$LIB_C_RED"    "$ts" "$*" "$LIB_C_RESET" >&2 ;;
        *)     printf '%s[%s] · %s%s\n' "$LIB_C_BLUE"   "$ts" "$*" "$LIB_C_RESET" >&2 ;;
    esac
}

# lib::retry <attempts> <label> <command…>
lib::retry() {
    local attempts="$1" label="$2"; shift 2
    local n=1
    until "$@"; do
        if (( n >= attempts )); then
            lib::log error "${label} failed after ${n} attempt(s)"
            return 1
        fi
        lib::log warn "${label} failed (attempt ${n}/${attempts}) — retrying in $((n * 5))s"
        sleep $((n * 5))
        n=$((n + 1))
    done
}

# ─── apps.tsv ────────────────────────────────────────────────────────────────
# Single source of truth for app → slug/image/host/smoke_path (deploy/apps.tsv).
# Adding an app is a row there plus a Dockerfile — never an edit to these
# scripts.

LIB_APPS_TSV="${LIB_APPS_TSV:-${BASH_SOURCE%/*}/../../deploy/apps.tsv}"

# lib::app_field <app> <app|slug|image|public_host|public_sub|smoke_path|triggers>
lib::app_field() {
    local want_app="$1" want_field="$2" idx
    case "$want_field" in
        app) idx=1 ;; slug) idx=2 ;; image) idx=3 ;; public_host) idx=4 ;;
        public_sub) idx=5 ;; smoke_path) idx=6 ;; triggers) idx=7 ;;
        *) return 1 ;;
    esac
    awk -F'\t' -v app="$want_app" -v col="$idx" '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        $1 == app { print $col; found = 1; exit }
        END { if (!found) exit 1 }
    ' "$LIB_APPS_TSV"
}

lib::all_apps() {
    awk -F'\t' '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        { print $1 }
    ' "$LIB_APPS_TSV"
}

# ─── smoke check ─────────────────────────────────────────────────────────────
# TLS terminates at the Arvan edge and the origin serves plain HTTP (ADR-013),
# so the public check goes over https:// through the edge — which is what a
# seller's phone actually resolves.

# lib::smoke <host> <path> [expected_status] [attempts]
lib::smoke() {
    local host="$1" path="$2" expected="${3:-200}" attempts="${4:-10}"
    local url="https://${host}${path}"
    local n=1 code
    while (( n <= attempts )); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)"
        if [[ "$code" == "$expected" ]]; then
            lib::log ok "smoke ${url} → ${code}"
            return 0
        fi
        lib::log warn "smoke ${url} → ${code} (want ${expected}), attempt ${n}/${attempts}"
        sleep 6
        n=$((n + 1))
    done
    lib::log error "smoke ${url} never returned ${expected}"
    return 1
}
