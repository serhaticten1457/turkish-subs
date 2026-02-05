@echo off
chcp 65001 >nul
color 0B
cls

echo ========================================================
echo        ALTYAZI STUDYOSU PRO - WINDOWS KURULUMU
echo ========================================================
echo.

:: 1. Docker Kontrolü
docker info >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [HATA] Docker Desktop calismiyor veya yuklu degil.
    echo Lutfen Docker Desktop'i kurun ve baslatin: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b
)

echo [1/3] Dosya yapisi kontrol ediliyor...

if not exist "certs" (
    mkdir certs
)

:: 2. SSL Sertifikası Kontrolü ve Oluşturma (Docker Alpine Kullanarak)
if not exist "certs\self-signed.crt" (
    echo [2/3] SSL Sertifikalari olusturuluyor (Docker Alpine)...
    
    :: Windows'ta OpenSSL genellikle yüklü değildir. 
    :: Bu yüzden Docker içindeki Alpine imajını kullanarak sertifika üretiyoruz.
    docker run --rm -v "%cd%/certs:/certs" alpine /bin/sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/self-signed.key -out /certs/self-signed.crt -subj '/C=TR/ST=Istanbul/L=Istanbul/O=SubtitleStudio/OU=Dev/CN=localhost' 2>/dev/null"
    
    if exist "certs\self-signed.crt" (
        echo     OK: Sertifika basariyla olusturuldu.
    ) else (
        color 0C
        echo     HATA: Sertifika olusturulamadi. Docker erisim izinlerini kontrol edin.
        pause
        exit /b
    )
) else (
    echo [2/3] Mevcut SSL sertifikalari kullaniliyor.
)

:: 3. Uygulamayı Başlat
echo [3/3] Uygulama derleniyor ve baslatiliyor...
echo.
echo Lutfen bekleyin, ilk kurulumda indirme islemi zaman alabilir...
echo.

docker-compose down --remove-orphans
docker-compose up -d --build

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [HATA] Docker Compose baslatilamadi.
    pause
    exit /b
)

cls
color 0A
echo ========================================================
echo               KURULUM BASARIYLA TAMAMLANDI!
echo ========================================================
echo.
echo Uygulamaya erismek icin tarayicinizda su adresleri kullanin:
echo.
echo   HTTP  (Standart): http://localhost:3000
echo   HTTPS (Otomasyon): https://localhost:3443
echo.
echo NOT: HTTPS baglantisinda "Guvenli Degil" uyarisi alabilirsiniz.
echo      GelismiS - Siteye Ilerle diyerek devam edin.
echo.
pause