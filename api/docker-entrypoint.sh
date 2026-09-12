#!/usr/bin/env bash
set -euo pipefail

if [[ "${SHEIN_ENABLE_REMOTE_BROWSER:-1}" == "1" || "${SHEIN_ENABLE_REMOTE_BROWSER:-1}" == "true" ]]; then
  vnc_password="${SHEIN_VNC_PASSWORD:-}"
  if [[ ${#vnc_password} -lt 8 || "$vnc_password" =~ (replace|change|your|default) ]]; then
    echo "[ENTRYPOINT] SHEIN_VNC_PASSWORD must be a real password of at least 8 characters when the remote browser is enabled." >&2
    exit 1
  fi
  display_number="${DISPLAY:-:99}"
  screen_size="${SHEIN_SCREEN_SIZE:-1280x800x24}"
  disp_id="${display_number#:}"

  echo "[ENTRYPOINT] Starting Xvfb on display ${display_number}..."
  Xvfb "$display_number" -screen 0 "$screen_size" -nolisten tcp >/tmp/xvfb.log 2>&1 &

  # Wait for display socket
  for i in $(seq 1 30); do
    if [[ -e "/tmp/.X11-unix/X${disp_id}" ]]; then
      echo "[ENTRYPOINT] Xvfb display ${display_number} is ready."
      break
    fi
    sleep 0.2
  done

  VNC_AUTH="-nopw"
  if [[ -n "$vnc_password" ]]; then
    mkdir -p /root/.vnc
    x11vnc -storepasswd "$vnc_password" /root/.vnc/passwd
    VNC_AUTH="-rfbauth /root/.vnc/passwd"
  fi

  echo "[ENTRYPOINT] Starting x11vnc..."
  x11vnc -display "$display_number" -localhost -forever -shared -rfbport 5900 ${VNC_AUTH} >/tmp/x11vnc.log 2>&1 &
  sleep 0.5

  echo "[ENTRYPOINT] Starting websockify / noVNC on 0.0.0.0:6080..."
  websockify --web=/usr/share/novnc/ 0.0.0.0:6080 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &
fi

exec "$@"
