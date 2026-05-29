#!/usr/bin/env bash
# ── Docker Compose UP — Build & Start All Services ─────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Building & starting all services ==="
echo ""

docker compose build --pull
echo ""
docker compose up -d
echo ""

echo "=== Waiting for health checks ==="
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Image}}"

echo ""
echo "=== Service ports ==="
ss -ltnp 2>/dev/null | grep -E ":(5432|6379|6650|5502|3001|3478|5349)" || true

echo ""
echo "All services started. Run ./dc-status.sh for health overview."
