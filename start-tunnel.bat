@echo off
echo Starting Cloudflare Tunnel for Price Tracker...
echo.
echo This will create a public URL for your price tracker website.
echo Your local application will remain unchanged.
echo.

REM Start the tunnel with a temporary URL (no login required)
echo Starting tunnel... This may take a moment.
echo.
.\cloudflared.exe tunnel --url http://localhost:80

echo.
echo Tunnel stopped.
pause