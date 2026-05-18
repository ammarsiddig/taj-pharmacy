$VPS_IP = "178.104.158.147"
$VPS_USER = "root"
$REMOTE_DIR = "/opt/pms-cloud"
Write-Host "=== PMS PWA Fast Redeploy ===" -ForegroundColor Cyan
Write-Host "[1/4] Cleaning old dist..." -ForegroundColor Yellow
Remove-Item -Path "$PSScriptRoot\web\dist" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "[2/4] Building PWA..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\web"
npm run build
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) { Write-Host "BUILD FAILED" -ForegroundColor Red; exit 1 }
Write-Host "Build OK" -ForegroundColor Green
Write-Host "[3/4] Uploading to VPS..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "rm -rf $REMOTE_DIR/web-dist; mkdir -p $REMOTE_DIR/web-dist"
scp -r "$PSScriptRoot\web\dist\*" "${VPS_USER}@${VPS_IP}:${REMOTE_DIR}/web-dist/"
Write-Host "Upload OK" -ForegroundColor Green
Write-Host "[4/4] Reloading Nginx..." -ForegroundColor Yellow
ssh "$VPS_USER@$VPS_IP" "systemctl reload nginx"
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "PWA: https://taj.systems/" -ForegroundColor Cyan
