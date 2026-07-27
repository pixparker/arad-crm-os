#!/usr/bin/env bash
# ArvanCloud DNS automation for Arad CRM-OS subdomains (ADR-013).
#
# Usage:
#   ARVAN_API_KEY=<key> bash deploy/dns-arvan.sh list
#   ARVAN_API_KEY=<key> bash deploy/dns-arvan.sh ensure-a <subdomain> <ip>
#   ARVAN_API_KEY=<key> bash deploy/dns-arvan.sh ensure-all <pool-ip>
#
# `ensure-all` provisions every host in the ADR-013 domain map in one shot:
#   mizro-crm.aradap.ir · ops.aradap.ir · api.aradap.ir · id.aradap.ir
#
# Records are created with "cloud":true — proxied through the Arvan edge, which
# is what terminates TLS. The origin (pool Caddy) then serves plain HTTP, which
# is why deploy/caddy/arad-crm.caddy uses `http://` blocks.
#
# Idempotent: ensure-a creates the record if missing, updates it if the IP
# differs, no-ops if already correct.
#
# Ported from digital-menu/deploy/dns-arvan.sh. The pinned --resolve fallback is
# kept: napi.arvancloud.ir does not always resolve from VPN-tunnelled Iran
# connections. Refresh ARVAN_API_RESOLVE_IP if Arvan rotates their API edge.

set -euo pipefail

: "${ARVAN_API_KEY:?ARVAN_API_KEY env var not set}"

ARVAN_API_BASE="${ARVAN_API_BASE:-https://napi.arvancloud.ir/cdn/4.0}"
ARVAN_API_RESOLVE_IP="${ARVAN_API_RESOLVE_IP:-185.143.232.11}"
DOMAIN="${ARAD_ROOT_DOMAIN:-aradap.ir}"

# Every public host in the ADR-013 map, as zone-relative labels.
CRM_SUBDOMAINS=(mizro-crm ops api id)

curl_arvan() {
    local resp
    if resp="$(curl -sS -m 20 -w '\nstatus=%{http_code}\n' \
        -H "Authorization: Apikey ${ARVAN_API_KEY}" \
        -H "Content-Type: application/json" \
        "$@" 2>&1)"; then
        if grep -q '^status=2' <<<"$resp"; then
            echo "$resp"
            return 0
        fi
    fi
    curl -sS -m 20 -w '\nstatus=%{http_code}\n' \
        --resolve "napi.arvancloud.ir:443:${ARVAN_API_RESOLVE_IP}" \
        -H "Authorization: Apikey ${ARVAN_API_KEY}" \
        -H "Content-Type: application/json" \
        "$@"
}

cmd_list() {
    echo ">> listing DNS records for ${DOMAIN}"
    curl_arvan "${ARVAN_API_BASE}/domains/${DOMAIN}/dns-records?per_page=200" \
        | sed -e 's/^status=/\nstatus=/'
}

cmd_ensure_a() {
    local sub="${1:?usage: ensure-a <subdomain> <ip>}"
    local ip="${2:?usage: ensure-a <subdomain> <ip>}"

    echo ">> ensure A ${sub}.${DOMAIN} → ${ip}"

    local list_resp list_json existing_id existing_ip
    list_resp="$(curl_arvan "${ARVAN_API_BASE}/domains/${DOMAIN}/dns-records?type=a&per_page=200" || true)"
    list_json="$(printf '%s' "$list_resp" | sed -e '/^status=/d')"

    existing_id="$(printf '%s' "$list_json" | python3 -c "
import json, sys
sub = sys.argv[1]
try:
    data = json.loads(sys.stdin.read()).get('data', [])
except Exception:
    sys.exit(0)
for r in data:
    if r.get('type') == 'a' and r.get('name') == sub:
        print(r.get('id', ''))
        break
" "$sub")"

    existing_ip="$(printf '%s' "$list_json" | python3 -c "
import json, sys
sub = sys.argv[1]
try:
    data = json.loads(sys.stdin.read()).get('data', [])
except Exception:
    sys.exit(0)
for r in data:
    if r.get('type') == 'a' and r.get('name') == sub:
        for v in r.get('value', []) or []:
            print(v.get('ip', ''))
            break
        break
" "$sub")"

    local body
    body="$(printf '{"type":"a","name":"%s","value":[{"ip":"%s","port":null,"weight":1000,"country":""}],"ttl":120,"cloud":true,"upstream_https":"default","ip_filter_mode":{"count":"single","order":"none","geo_filter":"none"}}' \
        "$sub" "$ip")"

    if [[ -z "${existing_id}" ]]; then
        echo ">> creating new A record"
        curl_arvan -X POST -d "$body" "${ARVAN_API_BASE}/domains/${DOMAIN}/dns-records"
    elif [[ "${existing_ip}" == "${ip}" ]]; then
        echo "✓ record already correct (id=${existing_id}, ip=${existing_ip}). no-op."
    else
        echo ">> updating existing record id=${existing_id} (${existing_ip} → ${ip})"
        curl_arvan -X PUT -d "$body" "${ARVAN_API_BASE}/domains/${DOMAIN}/dns-records/${existing_id}"
    fi
}

# ensure-all <pool-ip> — every ADR-013 host at once.
cmd_ensure_all() {
    local ip="${1:?usage: ensure-all <pool-ip>}"
    echo ">> ensuring ${#CRM_SUBDOMAINS[@]} A records in ${DOMAIN} → ${ip}"
    for sub in "${CRM_SUBDOMAINS[@]}"; do
        cmd_ensure_a "$sub" "$ip"
    done
    echo "✓ all CRM subdomains ensured"
}

main() {
    local cmd="${1:-help}"
    shift || true
    case "$cmd" in
        list) cmd_list "$@" ;;
        ensure-a) cmd_ensure_a "$@" ;;
        ensure-all) cmd_ensure_all "$@" ;;
        help|*) sed -n '1,22p' "$0" ;;
    esac
}

main "$@"
