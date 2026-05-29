#!/usr/bin/env bash
# ── Migrate from systemd/PM2 to Docker ─────────────────────────────────────
# Usage: ./migrate.sh
#   - Dumps PostgreSQL ponswarp DB
#   - Stops existing systemd/PM2 services
#   - Starts everything in Docker
#   - Restores the DB dump
#
# Safe: can be re-run; existing Docker data is preserved unless --reset passed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

RESET="${1:-}"

echo -e "${YELLOW}=== PonsLink Server — Systemd/PM2 → Docker Migration ===${NC}"
echo ""

# ── Load POSTGRES_PASSWORD ─────────────────────────────────────────────────
if [ -f /home/declan/ponswarp/env/.env ]; then
  export POSTGRES_PASSWORD=$(grep "^DATABASE_URL=" /home/declan/ponswarp/env/.env | sed -E 's/.*:\/\/([^:]+):([^@]+)@.*/\2/')
fi
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo -e "${RED}ERROR: Cannot extract POSTGRES_PASSWORD from ponswarp/.env${NC}"
  echo "Set it manually: export POSTGRES_PASSWORD=..."
  exit 1
fi

# ── Step 1: Dump PostgreSQL ─────────────────────────────────────────────────
echo -e "${GREEN}[1/6] Dumping PostgreSQL (ponswarp database)...${NC}"
DUMP_FILE="./pg_dump_$(date +%Y%m%d_%H%M%S).sql"
sudo -u postgres pg_dump --clean --if-exists --no-owner ponswarp > "$DUMP_FILE"
DUMP_SIZE=$(wc -c < "$DUMP_FILE")
echo "  Dump saved: $DUMP_FILE ($DUMP_SIZE bytes)"

# ── Step 2: Backup Redis ────────────────────────────────────────────────────
echo -e "${GREEN}[2/6] Backing up Redis...${NC}"
redis-cli BGSAVE
sleep 1
echo "  Redis SAVE triggered. RDB at /var/lib/redis/dump.rdb"

# ── Step 3: Stop existing services ──────────────────────────────────────────
echo -e "${GREEN}[3/6] Stopping existing systemd/PM2 services...${NC}"

# PM2 first
pm2 stop ponslink-api 2>/dev/null && echo "  PM2: ponslink-api stopped" || echo "  PM2: ponslink-api (not running)"
pm2 stop pdf-master-api 2>/dev/null && echo "  PM2: pdf-master-api stopped" || echo "  PM2: pdf-master-api (not running)"

# Then systemd (order matters: app → db)
for svc in ponswarp-signaling coturn redis-server postgresql@16-main; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    sudo systemctl stop "$svc"
    echo "  systemd: $svc stopped"
  else
    echo "  systemd: $svc (not running)"
  fi
done

# ── Step 4: Set up Docker environment ───────────────────────────────────────
echo -e "${GREEN}[4/6] Setting up Docker environment...${NC}"

# Copy ponswarp Dockerfile to ponswarp dir (it references . as context)
if [ ! -f /home/declan/ponswarp/Dockerfile ]; then
  cp "$SCRIPT_DIR/ponswarp.Dockerfile" /home/declan/ponswarp/Dockerfile
  echo "  Copied ponswarp.Dockerfile → /home/declan/ponswarp/Dockerfile"
fi

# Ensure POSTGRES_PASSWORD is available for compose
export POSTGRES_PASSWORD

# ── Step 5: Build & Start Docker ────────────────────────────────────────────
if [ "$RESET" = "--reset" ]; then
  echo -e "${YELLOW}[5/6] RESET mode: removing old volumes...${NC}"
  docker compose down -v 2>/dev/null || true
fi

echo -e "${GREEN}[5/6] Building images and starting containers...${NC}"
docker compose build --pull
docker compose up -d

# ── Step 6: Wait & restore DB ───────────────────────────────────────────────
echo -e "${GREEN}[6/6] Waiting for PostgreSQL to be ready...${NC}"
for i in $(seq 1 30); do
  if pg_isready -U ponswarp -d ponswarp -h 127.0.0.1 >/dev/null 2>&1; then
    echo "  PostgreSQL ready after ${i}s"
    break
  fi
  if [ "$i" = "30" ]; then
    echo -e "${RED}ERROR: PostgreSQL did not become ready${NC}"
    docker compose logs postgres --tail 30
    exit 1
  fi
  sleep 1
done

echo "  Restoring ponswarp database from dump..."
PGPASSWORD="$POSTGRES_PASSWORD" psql -U ponswarp -h 127.0.0.1 -d ponswarp -f "$DUMP_FILE" 2>&1 | grep -v "already exists\|does not exist" || true
echo "  Database restored."

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=== Migration complete! ===${NC}"
echo ""
echo "Services now running in Docker:"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo ""
echo "Verify: ./dc-status.sh"
echo "Rollback: ./dc-down.sh && sudo systemctl start postgresql@16-main redis-server coturn ponswarp-signaling && pm2 start all"
