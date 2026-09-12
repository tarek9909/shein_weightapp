#!/usr/bin/env bash
# ==============================================================================
# SHEIN Weight & Logistics App - Automated Production Deployment Script
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " Starting Production Deployment: $(date -u)"
echo "======================================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Pull latest changes
echo "[1/6] Pulling latest code from Git..."
git pull --ff-only

# 2. Check for .env file
if [ ! -f .env ]; then
  if [ -f .env.production ]; then
    echo "Warning: .env not found. Copying .env.production to .env..."
    cp .env.production .env
  else
    echo "Error: No .env file found. Please create one before deploying."
    exit 1
  fi
fi

# The Node service loads backend/.env when running under PM2. Keep it aligned
# with the root deployment environment unless an operator deliberately keeps a
# separate backend environment file.
if [ ! -f backend/.env ]; then
  cp .env backend/.env
fi

# 3. Check deployment mode (Docker vs PM2 / Native)
if [ "${1:-}" = "--docker" ] || [ "${DEPLOY_MODE:-}" = "docker" ]; then
  echo "[2/6] Building and updating Docker services..."
  docker compose pull || true
  docker compose build --no-cache
  echo "[3/6] Starting containers..."
  docker compose up -d --remove-orphans
  echo "[4/6] Waiting for services to become healthy..."
  ready=0
  for i in {1..30}; do
    if curl -sf http://127.0.0.1:8081/ready >/dev/null 2>&1 && curl -sf http://127.0.0.1:8000/ping >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  docker compose ps
  if [ "$ready" -ne 1 ]; then
    echo "Error: Docker services did not become ready."
    docker compose logs --tail=100 app scraper mysql
    exit 1
  fi
else
  # Native PM2 deployment mode
  echo "[2/6] Installing backend dependencies..."
  npm ci --prefix backend --omit=dev --silent

  echo "[3/6] Building frontend production bundle..."
  npm ci --prefix shein-frontend --silent
  npm run build --prefix shein-frontend

  echo "[4/6] Running backend integrity checks..."
  node backend/scripts/check.js

  echo "[5/6] Reloading PM2 processes..."
  if command -v pm2 >/dev/null 2>&1; then
    mkdir -p service-logs
    pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
    pm2 save
  else
    echo "PM2 not found. Skipping PM2 reload. You can start the app via: node backend/server.js"
  fi
  echo "[5b/6] Verifying Python scraper API..."
  scraper_ready=0
  for i in {1..15}; do
    if curl -sf http://127.0.0.1:8000/ping >/dev/null 2>&1; then
      echo " Python scraper healthcheck passed."
      scraper_ready=1
      break
    fi
    sleep 2
  done
  if [ "$scraper_ready" -ne 1 ]; then
    echo "Error: Python scraper API did not become ready."
    exit 1
  fi
fi

# 6. Verify health endpoint
echo "[6/6] Verifying system readiness..."
node_ready=0
for i in {1..15}; do
  if curl -sf http://127.0.0.1:8081/health >/dev/null 2>&1; then
    echo " Healthcheck passed! Node backend is up and responding."
    node_ready=1
    break
  fi
  sleep 2
done

if [ "$node_ready" -ne 1 ]; then
  echo "Error: Node backend did not become ready."
  exit 1
fi

echo "======================================================================"
echo " Deployment Successfully Completed: $(date -u)"
echo " App URL: use the configured public proxy (Compose gateway defaults to http://127.0.0.1:8088)"
echo "======================================================================"
