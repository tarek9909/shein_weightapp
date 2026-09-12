# SHEIN VPS Server Setup

This guide explains how to run the current application on an Ubuntu VPS and
log into multiple SHEIN accounts manually from a phone.

The recommended deployment is Docker. With Docker, the VPS does **not** need a
separate Python, Node.js, Playwright, Chromium, or MySQL installation. Docker
installs and runs those services in containers.

## 1. Recommended VPS

- Ubuntu 22.04 or 24.04
- Minimum: 2 vCPU and 4 GB RAM
- Recommended for several accounts: 4 vCPU and 4 GB RAM
- At least 20 GB free disk space
- A domain name is recommended for HTTPS and phone access
- Open only SSH, HTTP, and HTTPS publicly: ports 22, 80, and 443

Avoid using a 2 GB VPS if several browsers may run at the same time. Add swap
if the VPS has limited RAM.

## 2. Install the required VPS software

SSH into the VPS and install Git and Docker:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker --version
docker compose version
```

If `docker compose version` does not work, install the Docker Compose plugin
from the Docker documentation before continuing.

Optional firewall setup:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do not publicly open ports 3306, 6080, or 8000. Port 6080 is the remote
browser and must be protected by HTTPS authentication, a VPN, or a private
tunnel.

## 3. Copy the project to the VPS

Either clone the repository:

```bash
sudo mkdir -p /opt/shein
sudo chown -R "$USER":"$USER" /opt/shein
git clone YOUR_REPOSITORY_URL /opt/shein
cd /opt/shein
```

Or copy the current project from your computer to `/opt/shein` using Git, SCP,
or another private deployment method.

## 4. Create the production environment file

```bash
cd /opt/shein
cp .env.production .env
nano .env
```

Replace every placeholder. Generate secrets with commands such as:

```bash
openssl rand -hex 32
```

The important values are:

```env
DB_PASSWORD=use_a_strong_database_password
APP_SECRET=unique_random_secret_at_least_32_characters
JWT_SECRET=unique_random_secret_at_least_32_characters
CREDENTIAL_ENCRYPTION_KEY=unique_random_secret_at_least_32_characters
INTERNAL_API_TOKEN=unique_random_secret_at_least_32_characters
SHEIN_LOCAL_API_TOKEN=unique_random_secret_at_least_32_characters
SEED_ADMIN_PASSWORD=choose_a_strong_initial_admin_password
SHEIN_BASE_URL=https://ar.shein.com
PLAYWRIGHT_HEADLESS=1
SHEIN_MANUAL_LOGIN_TIMEOUT_SECONDS=1800
SHEIN_ENABLE_REMOTE_BROWSER=1
SHEIN_VNC_PASSWORD=choose_a_strong_vnc_password
BROWSER_PORT=6080
SHEIN_REMOTE_BROWSER_URL=https://browser.your-domain.com/vnc/vnc.html?path=websockify&autoconnect=true&resize=scale
```

For Docker Compose, `SHEIN_LOCAL_API_TOKEN` is used for Node-to-Python
communication and `INTERNAL_API_TOKEN` is retained for compatibility. They may
use the same random value, but both must be configured. Never commit `.env` to
Git.

The `SHEIN_REMOTE_BROWSER_URL` must be the URL that your phone can open. Do not
set it to `http://127.0.0.1:6080`; that address exists only inside the VPS.

## 5. Build and start the application

```bash
cd /opt/shein
docker compose build
docker compose up -d
docker compose ps
```

The containers are:

- `shein-mysql`: database
- `shein-scraper`: Python API, Playwright, Chromium, Xvfb, and noVNC
- `shein-app`: Node backend and React frontend
- `shein-nginx`: web gateway

Check logs if a service is not running:

```bash
docker compose logs --tail=100 app
docker compose logs --tail=100 scraper
docker compose logs --tail=100 mysql
```

The Compose Nginx gateway listens on `127.0.0.1:8088` by default. If you use a
host-level Nginx or another HTTPS proxy, point it to that port. You can change
the bind port with `HTTP_HOST_PORT`.

The web application is available through the gateway, for example:

```text
http://127.0.0.1:8088/
```

The initial administrator password is the value of `SEED_ADMIN_PASSWORD`.
Set it before the first production boot and change it after the first login.

## 6. Make the VPS browser accessible from the phone

The application starts a visible Chromium browser inside the scraper
container. The noVNC viewer is bound to the VPS loopback at:

```text
http://127.0.0.1:6080/vnc.html
```

This is intentionally not public by default. To use it from a phone, create a
protected HTTPS or private-network route to:

```text
http://127.0.0.1:6080
```

Use one of these approaches:

1. A reverse proxy with HTTPS and authentication.
2. A VPN such as Tailscale or WireGuard.
3. A private Cloudflare Tunnel protected by Cloudflare Access.

The current project Nginx configuration proxies the application. If you want
it to proxy noVNC too, add a protected WebSocket-capable route for `/vnc/` to
the scraper's port 6080. The route must include authentication; noVNC itself
should not be exposed anonymously.

On the current `shein-tracker.duckdns.org` VPS, opening the browser URL first
shows HTTP Basic Auth (`admin` plus the private `SHEIN_VNC_PASSWORD` value),
then the noVNC password prompt. Keep the password out of the URL query string.

After the browser URL works from the phone, set the same public URL in `.env`:

```env
SHEIN_REMOTE_BROWSER_URL=https://browser.your-domain.com/vnc.html
```

Restart the application after changing `.env`:

```bash
docker compose up -d
```

## 7. Log in to each SHEIN account

Repeat these steps once for every account:

1. Open the application website.
2. Open **SHEIN Accounts**.
3. Add the API email and SHEIN email. Gmail details are optional because the
   normal workflow uses manual login in the VPS browser.
4. Leave the profile as **Create automatically**, or select the assigned
   profile.
5. Click **Login on VPS**.
6. Open the VPS browser link on the phone.
7. Log into SHEIN manually in that browser.
8. Return to the application and click **Check**.
9. When it says logged in, click **Finish**.

Each account receives a different persistent profile such as:

```text
Default
Profile 1
Profile 2
Profile 3
```

Do not assign two SHEIN accounts to the same profile. The backend enforces
this. The profile data is stored in the persistent Docker volume
`shein_profiles`.

After login, assign the correct profile to each cart before refreshing SHEIN
tracking or weight data.

## 8. If a SHEIN session expires

The scraper returns `SESSION_EXPIRED` and `login_required: true`. This means
the SHEIN cookie in that profile is no longer valid.

1. Open **SHEIN Accounts**.
2. Use the same account and profile.
3. Click **Login on VPS**.
4. Log in again in the VPS browser.
5. Click **Check**, then **Finish**.

The scraper then reuses the updated persistent profile.

## 9. Updating the application

From `/opt/shein`:

```bash
git pull
docker compose build
docker compose up -d
```

Do not run `docker compose down -v` during normal updates. The `-v` option
deletes the database and browser-profile volumes.

## 10. Backups

Back up the MySQL database regularly:

```bash
cd /opt/shein
docker compose exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" shein' \
  > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

Also back up the Docker volume containing `/app/profiles`. Those files contain
the persistent SHEIN browser sessions. Store backups privately because they
contain sensitive login data.

## 11. Native installation alternative

Docker is preferred. If Docker cannot be used, install the following on Ubuntu:

```bash
sudo apt update
sudo apt install -y git nodejs npm python3 python3-venv python3-pip \
  mysql-server nginx xvfb x11vnc novnc websockify
sudo npm install -g pm2
```

Then install the Python and Node dependencies:

```bash
cd /opt/shein
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
playwright install --with-deps chromium
deactivate

npm ci --prefix backend --omit=dev
npm ci --prefix shein-frontend
npm run build --prefix shein-frontend
```

For native mode, create both `.env` and `backend/.env`, configure MySQL, and
start Xvfb/noVNC with a password before starting the Python API:

```bash
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
export SHEIN_VNC_PASSWORD='choose-a-strong-password'
mkdir -p ~/.vnc
x11vnc -storepasswd "$SHEIN_VNC_PASSWORD" ~/.vnc/passwd
x11vnc -display :99 -localhost -forever -shared -rfbport 5900 -rfbauth ~/.vnc/passwd &
websockify --web=/usr/share/novnc/ 6080 127.0.0.1:5900 &
pm2 start ecosystem.config.cjs
pm2 save
```

For native Nginx, install `nginx.native.conf`; `nginx.conf` uses Docker service
names and is only for the Compose gateway.

Native mode requires more maintenance: MySQL, PM2, Chromium, Xvfb, the
profile directory, and the reverse proxy must all be kept running manually.

## 12. Important safety rules

- Never expose the Python API port 8000 publicly.
- Never expose MySQL port 3306 publicly.
- Never expose noVNC without HTTPS plus authentication or a private VPN.
- Never share the internal API token or `.env` file.
- Do not delete the `shein_profiles` volume unless all saved sessions are no
  longer needed.
- Log in to SHEIN only through the VPS browser profile assigned to that
  account; phone cookies are not copied automatically.

For the browser-specific workflow, see
[`VPS_PROFILE_LOGIN.md`](VPS_PROFILE_LOGIN.md).
