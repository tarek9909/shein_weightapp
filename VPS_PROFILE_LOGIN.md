# VPS SHEIN profile login

The scraper uses one persistent Playwright profile per SHEIN account. Set
these variables in the Python service environment:

```env
PLAYWRIGHT_HEADLESS=1
SHEIN_PLAYWRIGHT_CHANNEL=chromium
SHEIN_PLAYWRIGHT_PROFILES_DIR=/app/profiles
SHEIN_PROFILE_LOCK_TIMEOUT_SECONDS=5
SHEIN_MANUAL_LOGIN_TIMEOUT_SECONDS=1800
SHEIN_ENABLE_REMOTE_BROWSER=1
```

Mount `/app/profiles` to persistent VPS storage. The Python API exposes these
internal-token-protected endpoints for manual login:

```text
GET    /api/profiles
POST   /api/profiles/login/start
GET    /api/profiles/login/{session_id}
POST   /api/profiles/login/finish
DELETE /api/profiles/login/{session_id}
```

Start a login session, control the visible VPS browser through a private
noVNC/remote-desktop URL, log into SHEIN manually, then finish the session.
Future scraping requests open the same profile headlessly and reuse its saved
session.

Each account must have a different profile (`Default`, `Profile 1`, `Profile 2`,
and so on). The backend repairs old duplicate assignments during startup and
keeps the profile key unique in the database. Deleted account profile names are
reserved while their browser data remains on disk, preventing cookie reuse by a
future account.

The Docker image starts Xvfb, x11vnc, and noVNC automatically. It keeps the
viewer bound to the VPS loopback by default (`BROWSER_PORT=6080`), so publish
it only through an authenticated HTTPS reverse proxy, VPN, or SSH tunnel. Do
not expose the Python API, internal token, or noVNC without authentication and
HTTPS.

For a native Ubuntu install, the display layer can be started separately:

```bash
sudo apt update
sudo apt install -y xvfb x11vnc novnc websockify
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
x11vnc -display :99 -localhost -forever -shared -rfbport 5900 &
websockify --web=/usr/share/novnc/ 6080 127.0.0.1:5900 &
```

Put port `6080` behind an authenticated HTTPS reverse proxy or a private VPN
before opening it from a phone. The browser image used by the API must be able
to access the same `DISPLAY` and the same persistent `/app/profiles` volume.

If a saved session expires, scraping returns `409 SESSION_EXPIRED` with
`login_required: true`. Log into the same profile again and finish the session.
