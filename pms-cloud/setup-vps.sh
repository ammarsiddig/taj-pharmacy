#!/bin/bash
set -e

echo "========================================="
echo "  PMS Cloud - VPS Setup Script"
echo "========================================="

# 1. Update system
echo "[1/6] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed."
else
    echo "Docker already installed."
fi

# 3. Install Docker Compose plugin
echo "[3/6] Checking Docker Compose..."
if docker compose version &> /dev/null; then
    echo "Docker Compose already available."
else
    apt-get install -y -qq docker-compose-plugin
fi

# 4. Configure firewall and host reverse proxy packages
echo "[4/6] Configuring firewall and installing Nginx/Certbot..."
apt-get install -y -qq ufw nginx certbot python3-certbot-nginx
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
systemctl enable nginx
echo "Firewall configured: SSH(22), HTTP(80), HTTPS(443)"

# 5. Create app directories
echo "[5/6] Setting up app directories..."
mkdir -p /opt/pms-cloud
mkdir -p /var/www/taj/bin /var/www/taj/data/pharmacies /var/www/taj/data/clinics /var/www/taj/data/labs
echo "App directory: /opt/pms-cloud"

# 6. Generate admin token
echo "[6/6] Generating admin token..."
ADMIN_TOKEN=$(openssl rand -hex 32)
echo "PMS_ADMIN_TOKEN=${ADMIN_TOKEN}" > /opt/pms-cloud/.env
echo ""

echo "========================================="
echo "  VPS Setup Complete!"
echo "========================================="
echo ""
echo "Your admin token (SAVE THIS):"
echo "  ${ADMIN_TOKEN}"
echo ""
echo "Next step: upload your pms-cloud files to /opt/pms-cloud"
echo "Then configure /etc/nginx/sites-available/taj_suite per docs/AGENT-HANDOFF.md"
echo "Then run: cd /opt/pms-cloud && docker compose up -d --build postgres api"
echo ""
