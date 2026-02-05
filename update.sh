#!/bin/bash
# Altyazı Stüdyosu - Linux Kurulum Scripti

# Renkler
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}   ALTYAZI STÜDYOSU - KURULUM SİHİRBAZI   ${NC}"
echo -e "${CYAN}==========================================${NC}"

# 1. Docker Kontrolü
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⛔ Docker bulunamadı. Lütfen önce Docker'ı kurun.${NC}"
    exit 1
fi

# 2. SSL Sertifikası Kontrolü (Otomasyon/HTTPS için gerekli)
if [ ! -d "./certs" ]; then
    echo -e "${YELLOW}📂 Certs klasörü oluşturuluyor...${NC}"
    mkdir -p ./certs
fi

if [ ! -f "./certs/self-signed.crt" ]; then
    echo -e "${YELLOW}🔐 SSL Sertifikası oluşturuluyor...${NC}"
    # Linux üzerinde openssl genelde yüklüdür, yoksa docker ile deneriz
    if command -v openssl &> /dev/null; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ./certs/self-signed.key \
            -out ./certs/self-signed.crt \
            -subj "/C=TR/ST=Istanbul/L=Istanbul/O=SubtitleStudio/OU=Dev/CN=localhost" 2>/dev/null
    else 
        echo -e "${YELLOW}⚠️ OpenSSL bulunamadı, Docker Alpine kullanılıyor...${NC}"
        docker run --rm -v "$(pwd)/certs:/certs" alpine /bin/sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/self-signed.key -out /certs/self-signed.crt -subj '/C=TR/ST=Istanbul/L=Istanbul/O=SubtitleStudio/OU=Dev/CN=localhost'"
    fi
    echo -e "${GREEN}✅ Sertifika hazır.${NC}"
fi

# 3. Docker Konteynerlerini Başlat
echo -e "${YELLOW}🐳 Uygulama başlatılıyor...${NC}"

# docker-compose v1 ve v2 uyumluluğu
if docker compose version &> /dev/null; then
    docker compose down --remove-orphans
    docker compose up -d --build
elif command -v docker-compose &> /dev/null; then
    docker-compose down --remove-orphans
    docker-compose up -d --build
else
    echo -e "${YELLOW}⛔ Docker Compose bulunamadı.${NC}"
    exit 1
fi

# IP Adresini Bul
IP_ADDR=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✅ KURULUM BAŞARIYLA TAMAMLANDI!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "Uygulamaya şu adreslerden erişebilirsiniz:"
echo -e ""
echo -e "   🔗 HTTP : http://$IP_ADDR:3000"
echo -e "   🔗 HTTPS: https://$IP_ADDR:3443 (Otomasyon için)"
echo -e ""
echo -e "${CYAN}Keyifli kullanımlar!${NC}"
