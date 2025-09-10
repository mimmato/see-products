@echo off
echo Starting Advanced Cloudflare Tunnel with API routing...
echo.
echo This tunnel routes:
echo - Main site: http://localhost:80
echo - API calls: http://localhost:3001
echo.

REM Check if config file exists
if not exist "tunnel-config.yml" (
    echo ERROR: tunnel-config.yml not found!
    echo Please make sure the config file is in the same directory.
    pause
    exit /b 1
)

echo Starting tunnel with configuration...
echo.
.\cloudflared.exe tunnel --config tunnel-config.yml --url http://localhost:80

echo.
echo Tunnel stopped.
pause