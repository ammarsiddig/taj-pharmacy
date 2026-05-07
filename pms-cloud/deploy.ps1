# PMS Cloud - Deploy to VPS from Windows
# Usage: .\deploy.ps1

$VPS_IP = "178.104.158.147"
$VPS_USER = "root"
$REMOTE_DIR = "/opt/pms-cloud"

Write-Host "=== PMS Cloud Deploy ===" -ForegroundColor Cyan

# Files to upload
$files = @(
    "package.json",
    "Dockerfile",
    ".dockerignore",
    "docker-compose.yml",
    "Caddyfile"
)

Write-Host "Uploading files to $VPS_USER@${VPS_IP}:${REMOTE_DIR}..." -ForegroundColor Yellow

# Ensure remote directories exist
ssh "$VPS_USER@$VPS_IP" "mkdir -p $REMOTE_DIR/src/routes $REMOTE_DIR/migrations"

# Upload root files
foreach ($file in $files) {
    Write-Host "  -> $file"
    scp "$PSScriptRoot\$file" "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/$file"
}

# Upload migrations
$migrationFiles = Get-ChildItem -Path "$PSScriptRoot\migrations" -File
foreach ($file in $migrationFiles) {
    Write-Host "  -> migrations/$($file.Name)"
    scp $file.FullName "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/migrations/$($file.Name)"
}

# Upload src files
$srcFiles = Get-ChildItem -Path "$PSScriptRoot\src" -File
foreach ($file in $srcFiles) {
    Write-Host "  -> src/$($file.Name)"
    scp $file.FullName "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/src/$($file.Name)"
}

# Upload route files
$routeFiles = Get-ChildItem -Path "$PSScriptRoot\src\routes" -File
foreach ($file in $routeFiles) {
    Write-Host "  -> src/routes/$($file.Name)"
    scp $file.FullName "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/src/routes/$($file.Name)"
}

# Clean and rebuild PWA
Write-Host ""
Write-Host "Cleaning old build..." -ForegroundColor Yellow
Remove-Item -Path "$PSScriptRoot\web\dist" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Building Owner PWA..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\web"
npm run build
Pop-Location

# Upload PWA dist
Write-Host "Uploading PWA to VPS..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "rm -rf $REMOTE_DIR/web-dist && mkdir -p $REMOTE_DIR/web-dist"
scp -r "$PSScriptRoot\web\dist\*" "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/web-dist/"

# Clear Caddy cache/restart to ensure fresh content
Write-Host "Clearing server cache..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "cd $REMOTE_DIR && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true"

Write-Host ""
Write-Host "Building and starting containers..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "cd $REMOTE_DIR && docker compose up -d --build && docker compose restart caddy"

Write-Host ""
Write-Host "=== Deploy Complete ===" -ForegroundColor Green
Write-Host "API:  http://${VPS_IP}/health" -ForegroundColor Cyan
Write-Host "PWA:  http://${VPS_IP}/" -ForegroundColor Cyan
Write-Host ""
