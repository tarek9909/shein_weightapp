# SHEIN Order & Weight Logistics App — Production & Deployment Manual

This guide outlines how to deploy, configure, and operate the application online in a production environment.

---

## 1. Quick Overview & Architecture

The application consists of three primary components:
1. **Fullstack Node.js Backend & React UI (Port 8081):** Express backend serving both the REST APIs and the pre-built React Single Page Application (`shein-frontend/build`).
2. **Python Playwright Scraper API (Port 8000):** FastAPI / Uvicorn service for automated SHEIN tracking extraction and package scraping.
3. **MySQL Database (Port 3306):** Relational store containing order history, multi-tenant records, delivery assignments, and audit logs.
4. **Nginx Reverse Proxy (Port 80 / 443):** Web server handling SSL certificates, static caching, gzip, and routing to the Node backend.

---

## 2. Default Initial Credentials

Fresh installations automatically seed the master administrator account on startup:
* **Username:** `admin`
* **Password:** `AdminPassword!123`
* **Role:** `Administrator` (Full access to create/manage users, reset passwords, and oversee all workspaces)

> [!IMPORTANT]
> Immediately log in and change the master password via **User Accounts** or **Reset Password** in the navigation menu.

---

## 3. Deployment Method A: Docker & Docker Compose (Recommended)

Docker provides an isolated, zero-dependency deployment that brings up MySQL, the Python Playwright service, the fullstack Node application, and Nginx in one command.

### Prerequisites
- Docker Engine 24+ and Docker Compose v2+ installed on your server.

### Steps
1. **Clone the repository onto the server:**
   ```bash
   git clone https://github.com/tarek9909/shein_weightapp.git /opt/shein
   cd /opt/shein
   ```

2. **Configure your production environment:**
   ```bash
   cp .env.production .env
   nano .env
   ```
   *Set your strong MySQL password, random JWT_SECRET, and encryption keys.*

3. **Build and start the services:**
   ```bash
   docker compose build
   docker compose up -d
   ```

4. **Verify running containers:**
   ```bash
   docker compose ps
   ```

5. **Access the application:**
   - Web application: `http://<your-server-ip>` (Port 80 via Nginx)
   - Direct Backend API: `http://<your-server-ip>:8081`

---

## 4. Deployment Method B: Native PM2 & Nginx (Ubuntu / Debian VPS)

For deploying directly on a Linux server without Docker.

### Prerequisites
```bash
sudo apt update && sudo apt install -y nodejs npm python3 python3-venv python3-pip nginx git
sudo npm install -g pm2
```

### Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/tarek9909/shein_weightapp.git /opt/shein
   cd /opt/shein
   ```

2. **Configure environment:**
   ```bash
   cp .env.production .env
   cp .env.production backend/.env
   ```

3. **Install Python virtual environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r api/requirements.txt
   playwright install --with-deps chromium
   deactivate
   ```

4. **Install Node dependencies and build frontend:**
   ```bash
   npm ci --prefix backend --omit=dev
   npm ci --prefix shein-frontend
   npm run build --prefix shein-frontend
   ```

5. **Start services with PM2:**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

6. **Configure Nginx:**
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/shein.conf
   sudo ln -s /etc/nginx/sites-available/shein.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 5. Setting up Free SSL with Let's Encrypt (Certbot)

To secure the app with `https://`:

1. Install Certbot:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   ```
2. Obtain and install certificates:
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```
3. Test automatic certificate renewal:
   ```bash
   sudo certbot renew --dry-run
   ```

---

## 6. Zero-Downtime Automated Updates

Whenever you push new code to GitHub, simply run the included deployment script:

```bash
# For PM2 deployment:
./deploy.sh

# For Docker deployment:
./deploy.sh --docker
```

---

## 7. Database Backups & Maintenance

### Creating a manual backup:
```bash
# Docker:
docker exec -t shein-mysql mysqldump -uroot -p<PASSWORD> shein > backup_$(date +%Y%m%d_%H%M%S).sql

# Native:
mysqldump -u root -p shein > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Automated daily backup cron job:
```bash
0 2 * * * mysqldump -u root -p<PASSWORD> shein | gzip > /var/backups/shein_$(date +\%F).sql.gz
```

---

## 8. Health & Monitoring Endpoints

- System Health: `GET http://127.0.0.1:8081/health`
- Database Readiness: `GET http://127.0.0.1:8081/ready`
- Performance Metrics: `GET http://127.0.0.1:8081/metrics`
- Scraper Readiness: `GET http://127.0.0.1:8000/ready`
