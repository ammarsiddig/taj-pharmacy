# PMS Cloud - Deploy to VPS from Windows
# Usage:
#   $env:PMS_VPS_IP = "<your-vps-ip>"   # one-time per shell session
#   .\deploy.ps1

if (-not $env:PMS_VPS_IP) {
    Write-Host "ERROR: PMS_VPS_IP environment variable is not set." -ForegroundColor Red
    Write-Host "Set it once per shell session:" -ForegroundColor Yellow
    Write-Host '  $env:PMS_VPS_IP = "<your-vps-ip>"' -ForegroundColor Yellow
    exit 1
}

$VPS_IP = $env:PMS_VPS_IP
$VPS_USER = if ($env:PMS_VPS_USER) { $env:PMS_VPS_USER } else { "root" }
$REMOTE_DIR = if ($env:PMS_VPS_REMOTE_DIR) { $env:PMS_VPS_REMOTE_DIR } else { "/opt/pms-cloud" }

Write-Host "=== PMS Cloud Deploy ===" -ForegroundColor Cyan

# Files to upload
# Caddyfile is legacy rollback reference only; production uses host-level Nginx.
$files = @(
    "package.json",
    "Dockerfile",
    ".dockerignore",
    "docker-compose.yml",
    "Caddyfile"
)

Write-Host "Uploading files to $VPS_USER@${VPS_IP}:${REMOTE_DIR}..." -ForegroundColor Yellow

# Ensure remote directories exist
ssh "$VPS_USER@$VPS_IP" "mkdir -p $REMOTE_DIR/src/routes $REMOTE_DIR/src/middleware $REMOTE_DIR/migrations"

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

# Upload middleware files
$middlewareFiles = Get-ChildItem -Path "$PSScriptRoot\src\middleware" -File -ErrorAction SilentlyContinue
foreach ($file in $middlewareFiles) {
    Write-Host "  -> src/middleware/$($file.Name)"
    scp $file.FullName "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/src/middleware/$($file.Name)"
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

Write-Host ""
Write-Host "Building and starting containers..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "cd $REMOTE_DIR && docker compose up -d --build postgres api && systemctl reload nginx"

Write-Host ""
Write-Host "=== Deploy Complete ===" -ForegroundColor Green
Write-Host "API:  https://taj.systems/health" -ForegroundColor Cyan
Write-Host "PWA:  https://taj.systems/" -ForegroundColor Cyan
Write-Host ""
