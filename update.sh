#!/bin/bash
# CasaOS Yerel Kurulum Scripti

# Renkler
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Kurulum Başlatılıyor...${NC}"

# 1. SSL Sertifikası Kontrolü (Otomasyon/HTTPS için gerekli)
if [ ! -d "./certs" ]; then
    mkdir -p ./certs
fi

if [ ! -f "./certs/self-signed.crt" ]; then
    echo -e "${YELLOW}⚠️ SSL Sertifikası oluşturuluyor...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ./certs/self-signed.key \
        -out ./certs/self-signed.crt \
        -subj "/C=TR/ST=Istanbul/L=Istanbul/O=SubtitleStudio/OU=Dev/CN=localhost" 2>/dev/null
    echo -e "${GREEN}✅ Sertifika oluşturuldu.${NC}"
fi

# 2. Docker Konteynerlerini Başlat
echo -e "${YELLOW}🐳 Docker imajları derleniyor ve başlatılıyor...${NC}"

# İzin sorunlarını önlemek için sudo kontrolü (CasaOS genellikle root veya sudo gerektirir)
if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build --remove-orphans
else
    echo "docker-compose bulunamadı, 'docker compose' deneniyor..."
    docker compose up -d --build --remove-orphans
fi

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✅ KURULUM TAMAMLANDI!${NC}"
echo -e "${GREEN}🔗 HTTP:  http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo -e "${GREEN}🔗 HTTPS: https://$(hostname -I | awk '{print $1}'):3443 (Otomasyon için bunu kullanın)${NC}"
echo -e "${GREEN}==========================================${NC}"
