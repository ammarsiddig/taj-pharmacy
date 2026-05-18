if (-not $env:PMS_VPS_IP) {
    Write-Host "ERROR: PMS_VPS_IP environment variable is not set." -ForegroundColor Red
    Write-Host "Set it once per shell session:" -ForegroundColor Yellow
    Write-Host '  $env:PMS_VPS_IP = "<your-vps-ip>"' -ForegroundColor Yellow
    exit 1
}

$VPS_IP = $env:PMS_VPS_IP
$VPS_USER = if ($env:PMS_VPS_USER) { $env:PMS_VPS_USER } else { "root" }
$REMOTE_DIR = if ($env:PMS_VPS_REMOTE_DIR) { $env:PMS_VPS_REMOTE_DIR } else { "/opt/pms-cloud" }
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
