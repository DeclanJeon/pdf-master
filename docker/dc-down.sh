#!/usr/bin/env bash
# ── Docker Compose DOWN — Stop All Services ────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Stopping all Docker services ==="
docker compose down

echo ""
echo "=== Remaining containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "(none)"

echo ""
echo "All services stopped. Volumes preserved."
echo "To remove volumes: docker compose down -v"
