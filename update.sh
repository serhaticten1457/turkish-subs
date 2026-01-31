#!/bin/bash

# Hatalarda durma
set +e

# Renkler
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
REPO_URL="https://github.com/serhaticten1457/turkish-subs.git"

echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}🔄 PROJE GÜNCELLENİYOR...${NC}"
echo -e "${YELLOW}🔗 REPO: ${REPO_URL}${NC}"
echo -e "${YELLOW}==========================================${NC}"

# Docker komutları için sudo gerekli mi?
if [ "$EUID" -ne 0 ]; then
    DOCKER="sudo docker"
    COMPOSE="sudo docker-compose"
else
    DOCKER="docker"
    COMPOSE="docker-compose"
fi

# Git kontrolü
if ! command -v git &> /dev/null; then
    echo -e "${RED}HATA: Git yüklü değil.${NC}"
    exit 1
fi

echo -e "1. Uzak sunucu adresi (Origin) doğrulanıyor..."
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

if ! git remote | grep -q "^origin$"; then
    git remote add origin $REPO_URL
else
    git remote set-url origin $REPO_URL
fi

echo -e "2. Yerel değişiklikler sıfırlanıyor ve güncel kod çekiliyor..."
git fetch origin main
git reset --hard origin/main

echo -e "3. SSL Sertifikaları Kontrol Ediliyor..."
if [ ! -d "./certs" ]; then
    mkdir -p ./certs
fi

if [ ! -f "./certs/self-signed.crt" ] || [ ! -f "./certs/self-signed.key" ]; then
    echo -e "${YELLOW}⚠️ SSL Sertifikası bulunamadı. Otomatik oluşturuluyor...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ./certs/self-signed.key \
        -out ./certs/self-signed.crt \
        -subj "/C=TR/ST=Istanbul/L=Istanbul/O=SubtitleStudio/OU=Dev/CN=localhost" 2>/dev/null
    echo -e "${GREEN}✅ Sertifika oluşturuldu.${NC}"
else
    echo -e "${GREEN}✅ Sertifikalar mevcut.${NC}"
fi

echo -e ""
echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}🐳 DOCKER KONTEYNERLERİ GÜNCELLENİYOR...${NC}"
echo -e "${YELLOW}==========================================${NC}"

# Docker kontrolü
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}HATA: docker-compose yüklü değil.${NC}"
    exit 1
fi

echo -e "Konteynerler durduruluyor..."
$COMPOSE down

echo -e "Yeniden başlatılıyor (Bu işlem biraz sürebilir)..."
$COMPOSE up -d --build --remove-orphans

echo -e "Temizlik yapılıyor..."
$DOCKER image prune -f

echo -e ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✅ GÜNCELLEME BAŞARIYLA TAMAMLANDI!${NC}"
echo -e "${GREEN}🔗 ADRES: http://$(hostname -I | awk '{print $1}'):3000${NC}"
echo -e "${GREEN}==========================================${NC}"
