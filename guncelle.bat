@echo off
color 0A
echo ==========================================
echo PROJE GITHUB'DAN GUNCELLENIYOR...
echo ==========================================

:: 1. En son değişiklikleri indir
git pull origin main

echo.
echo ==========================================
echo DOCKER KONTEYNERLERI YENIDEN DERLENIYOR...
echo ==========================================

:: 2. Docker'ı güncelle ve yeniden başlat
docker-compose down
docker-compose up -d --build

echo.
echo ==========================================
echo ISLEM TAMAMLANDI! UYGULAMA HAZIR.
echo ==========================================
pause
