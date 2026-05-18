#!/usr/bin/env bash
set -euo pipefail

CERT="/etc/letsencrypt/live/taj.systems/fullchain.pem"
EXPIRY=$(openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW=$(date +%s)
DAYS=$(( (EXPIRY_EPOCH - NOW) / 86400 ))

echo "$(date -Is) SSL cert for taj.systems expires in $DAYS days ($EXPIRY)" >> /root/certbot-dns/renewal-check.log

if [ "$DAYS" -le 30 ]; then
  echo "WARNING: SSL cert expires in $DAYS days! Attempting renew..." | tee -a /root/certbot-dns/renewal-check.log
  certbot renew --cert-name taj.systems --force-renewal --non-interactive 2>>/root/certbot-dns/renewal-check.log &
fi
