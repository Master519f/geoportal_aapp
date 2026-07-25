@echo off
echo ============================================
echo   GeoPortal EPMAPAQ - Servidor Local
echo ============================================
echo.
echo Abre tu navegador en: http://localhost:8000
echo Presiona Ctrl+C para detener.
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause
