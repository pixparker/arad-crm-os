#!/usr/bin/env bash
# Secret-grep — fails CI if a high-entropy or shape-known secret lands in the
# tracked tree. Delivery plan §3.5 #4 ("no secrets in repo").
#
# This is a backstop, not the only line of defense. The real protection is:
#   - .env / .env.local in .gitignore
#   - Mode-600 on the pool host
#   - Code review
#
# Heuristic: known secret shapes + a generic "long base64-ish token" pattern.
# Tuned for a low false-positive rate on a fresh repo. Iterate if it fires
# on a legitimate addition.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Files we deliberately don't scan: lockfiles, vendored data, the secret-grep
# test fixture, generated code, the example env, this script itself.
EXCLUDES=(
    ':!pnpm-lock.yaml'
    ':!**/node_modules/**'
    ':!**/.next/**'
    ':!**/dist/**'
    ':!.env.example'
    ':!deploy/scripts/secret-grep.sh'
    ':!docs/**'                           # docs may legitimately quote example secrets
)

# Known shapes (high precision). Add more as we learn what real ones look like.
declare -a PATTERNS=(
    'AKIA[0-9A-Z]{16}'                    # AWS access key id
    'aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}'
    'ghp_[A-Za-z0-9]{36}'                 # GitHub personal token
    'github_pat_[A-Za-z0-9_]{82}'
    'sk-[A-Za-z0-9]{32,}'                 # OpenAI / similar
    'xox[baprs]-[A-Za-z0-9-]{10,}'        # Slack
    '-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----'
    'jwt[_-]?secret\s*[:=]\s*["'"'"'][^"'"'"']{16,}'   # naive JWT_SECRET=... in source
    'kavenegar.*api[_-]?key\s*[:=]\s*["'"'"'][^"'"'"']{16,}'
    'melipayamak.*api[_-]?key\s*[:=]\s*["'"'"'][^"'"'"']{16,}'
)

found=0
for pattern in "${PATTERNS[@]}"; do
    # -E extended regex; -I skip binary; -n line numbers; -r recurse
    if matches=$(git grep -InE "$pattern" -- "${EXCLUDES[@]}" 2>/dev/null); then
        echo "✗ secret pattern matched: ${pattern}"
        echo "${matches}" | head -10
        echo
        found=1
    fi
done

if [[ $found -ne 0 ]]; then
    echo "secret-grep: FAIL — remove the secrets above and re-run."
    exit 1
fi

echo "secret-grep: ok"
