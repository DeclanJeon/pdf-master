#!/usr/bin/env bash
# ── Docker Compose STATUS — Health Check Overview ──────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Container Status ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Image}}"
echo ""

echo "=== Quick Health Probes ==="

probe_port() {
  local name="$1" port="$2"
  if ss -ltn | grep -q ":${port} "; then
    printf "  %-22s ✓ port %s\n" "$name" "$port"
  else
    printf "  %-22s ✗ DOWN\n" "$name"
  fi
}

probe_redis()  { redis-cli ping >/dev/null 2>&1 && echo "  Redis                  ✓ OK" || echo "  Redis                  ✗ DOWN"; }
probe_pg()     { pg_isready -U ponswarp -d ponswarp -h 127.0.0.1 >/dev/null 2>&1 && echo "  PostgreSQL             ✓ OK" || echo "  PostgreSQL             ✗ DOWN"; }

probe_redis
probe_pg
probe_port "ponslink-api"    6650
probe_port "pdf-master-api"  3001
probe_port "ponswarp"        5502
probe_port "coturn"          3478

echo ""
echo "=== Disk Usage ==="
docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"

echo ""
echo "=== Port Bindings ==="
ss -ltnp 2>/dev/null | grep -E ":(5432|6379|6650|5502|3001|3478|5349)" || echo "(none — services may still be starting)"
