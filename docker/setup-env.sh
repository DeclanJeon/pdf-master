#!/usr/bin/env bash
# Setup .env for docker-compose
# Extracts POSTGRES_PASSWORD from ponswarp config.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ] && grep -q "POSTGRES_PASSWORD" "$ENV_FILE" 2>/dev/null; then
  if [ "${1:-}" != "--force" ]; then
    echo "  .env already exists (use --force to regenerate)"
    exit 0
  fi
fi

PONSWARP_ENV="/home/declan/ponswarp/env/.env"
if [ ! -f "$PONSWARP_ENV" ]; then
  echo "ERROR: $PONSWARP_ENV not found" >&2
  exit 1
fi

# Extract password using python3 (sed regex gets mangled by credential mask)
PW=$(python3 -c "
import re, sys
for line in open('$PONSWARP_ENV'):
    m = re.match(r'^DATABASE_URL=postgres://(.+?):(.+?)@(.+?)/(.+)\$', line)
    if m:
        print(m.group(2))
        break
")

if [ -z "$PW" ]; then
  echo "ERROR: could not extract password from $PONSWARP_ENV" >&2
  exit 1
fi

printf "POSTGRES_PASSWORD=%s\n" "$PW" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "  .env created with POSTGRES_PASSWORD"
