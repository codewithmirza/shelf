#!/usr/bin/env bash
# Fails if a tracked file holds something that looks like a secret (AGENTS.md: never commit a secret).
# The sandbox client ID and webhook ID in wrangler.jsonc are public by design and are allowed.
set -euo pipefail
hits=$(git ls-files -z | xargs -0 grep -nIE \
  -e 'EL[A-Za-z0-9_-]{60,}' \
  -e 'A21AA[A-Za-z0-9_-]{40,}' \
  -e '-----BEGIN (RSA |EC )?PRIVATE KEY-----' \
  -e '"private_key"\s*:' \
  -e 'shelf_sk_[A-Za-z0-9_-]{20,}' \
  -e 'TOKEN_SECRET\s*=\s*"[^"]{8,}"' \
  -- ':!pnpm-lock.yaml' ':!scripts/check_secrets.sh' 2>/dev/null | grep -v 'tests/' || true)
if [ -n "$hits" ]; then echo "secrets: possible secret in tracked files:"; echo "$hits" | cut -c1-160; exit 1; fi
echo "secrets: none found in tracked files"
