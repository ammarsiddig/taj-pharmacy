#!/bin/bash
set -e

echo "========================================="
echo "  TAJ Pharmacy - app.taj.systems Setup"
echo "========================================="

CERT_DOMAIN="app.taj.systems"
NGINX_SITE="/etc/nginx/sites-enabled/taj_suite"
MARKETING_DIR="/var/www/taj/marketing"

# ─────────────────────────────────────────────
# 1. Issue Let's Encrypt certificate
# ─────────────────────────────────────────────
echo "[1/6] Obtaining SSL certificate for ${CERT_DOMAIN}..."
if [ -d "/etc/letsencrypt/live/${CERT_DOMAIN}" ]; then
    echo "  Certificate already exists at /etc/letsencrypt/live/${CERT_DOMAIN}"
    echo "  Skipping certbot."
else
    certbot --nginx -d "${CERT_DOMAIN}" --non-interactive --agree-tos \
        -m ammarsdeeg@gmail.com
    echo "  Certificate obtained successfully."
fi

# ─────────────────────────────────────────────
# 2. Append app.taj.systems server block
# ─────────────────────────────────────────────
echo "[2/6] Adding app.taj.systems server block to ${NGINX_SITE}..."

# Check if the block already exists to make this idempotent
if grep -q "server_name app.taj.systems;" "${NGINX_SITE}" 2>/dev/null; then
    echo "  app.taj.systems server block already exists in ${NGINX_SITE}"
    echo "  Skipping append."
else
    cat >> "${NGINX_SITE}" << 'NGINXBLOCK'

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.taj.systems;
    ssl_certificate /etc/letsencrypt/live/app.taj.systems/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.taj.systems/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    root /opt/pms-cloud/web-dist;
    index index.html;
    client_max_body_size 25m;
    location ^~ /download/ {
        alias /var/www/taj/downloads/;
        autoindex off;
        add_header Content-Disposition "attachment";
        try_files $uri =404;
    }
    location = /health {
        proxy_pass http://taj_api;
        include /etc/nginx/snippets/taj_api_proxy.conf;
    }
    location ^~ /v1/ {
        proxy_pass http://taj_api;
        include /etc/nginx/snippets/taj_api_proxy.conf;
    }
    location ^~ /auth/ {
        proxy_pass http://taj_api;
        include /etc/nginx/snippets/taj_api_proxy.conf;
    }
    location = /admin {
        proxy_pass http://taj_api;
        include /etc/nginx/snippets/taj_api_proxy.conf;
    }
    location ^~ /admin/ {
        proxy_pass http://taj_api;
        include /etc/nginx/snippets/taj_api_proxy.conf;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXBLOCK
    echo "  app.taj.systems server block appended."
fi

# ─────────────────────────────────────────────
# 3. Create marketing directory
# ─────────────────────────────────────────────
echo "[3/6] Creating marketing directory..."
mkdir -p "${MARKETING_DIR}"
echo "  ${MARKETING_DIR} ready."

# ─────────────────────────────────────────────
# 4. Test and reload Nginx
# ─────────────────────────────────────────────
echo "[4/6] Testing Nginx configuration..."
nginx -t
echo "[5/6] Reloading Nginx..."
systemctl reload nginx
echo "  Nginx reloaded successfully."

# ─────────────────────────────────────────────
# 5. Smoke tests
# ─────────────────────────────────────────────
echo "[6/6] Running smoke tests..."
echo "--- app.taj.systems ---"
curl -sI https://app.taj.systems/ | head -3
echo ""
echo "--- taj.systems ---"
curl -sI https://taj.systems/ | head -3
echo ""

echo "========================================="
echo "  app.taj.systems setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Deploy marketing HTML to ${MARKETING_DIR}"
echo "  2. Update the apex taj.systems block to serve marketing site"
echo "     (change root to ${MARKETING_DIR})"
echo ""
