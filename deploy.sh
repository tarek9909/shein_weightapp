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

# 3. Check deployment mode (Docker vs PM2 / Native)
if [ "${1:-}" = "--docker" ] || [ "${DEPLOY_MODE:-}" = "docker" ]; then
  echo "[2/6] Building and updating Docker services..."
  docker compose pull || true
  docker compose build --no-cache
  echo "[3/6] Starting containers..."
  docker compose up -d --remove-orphans
  echo "[4/6] Waiting for services to become healthy..."
  sleep 10
  docker compose ps
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
fi

# 6. Verify health endpoint
echo "[6/6] Verifying system readiness..."
for i in {1..15}; do
  if curl -sf http://127.0.0.1:8081/health >/dev/null 2>&1; then
    echo " Healthcheck passed! Node backend is up and responding."
    break
  fi
  sleep 2
done

echo "======================================================================"
echo " Deployment Successfully Completed: $(date -u)"
echo " App URL: http://localhost:8081"
echo "======================================================================"
