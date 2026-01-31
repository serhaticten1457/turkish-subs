#!/bin/bash

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

# Git kontrolü
if ! command -v git &> /dev/null; then
    echo -e "${RED}HATA: Git yüklü değil. Lütfen 'sudo apt install git' ile yükleyin.${NC}"
    exit 1
fi

# Docker kontrolü
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}HATA: docker-compose yüklü değil.${NC}"
    exit 1
fi

echo -e "1. Uzak sunucu adresi (Origin) doğrulanıyor..."
# .git klasörü yoksa başlat
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

# Origin remote'unu kontrol et ve ayarla
if ! git remote | grep -q "^origin$"; then
    git remote add origin $REPO_URL
else
    git remote set-url origin $REPO_URL
fi

echo -e "2. Yerel değişiklikler sıfırlanıyor ve güncel kod çekiliyor..."
# Çakışmaları önlemek için yerel dosyaları sunucuyla birebir eşle
git fetch origin main
git reset --hard origin/main

echo -e ""
echo -e "${YELLOW}==========================================${NC}"
echo -e "${YELLOW}🐳 DOCKER KONTEYNERLERİ GÜNCELLENİYOR...${NC}"
echo -e "${YELLOW}==========================================${NC}"

# Konteynerleri yeniden oluştur ve başlat
docker-compose down
docker-compose up -d --build --remove-orphans

echo -e "3. Temizlik yapılıyor..."
docker image prune -f

echo -e ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}✅ GÜNCELLEME BAŞARIYLA TAMAMLANDI!${NC}"
echo -e "${GREEN}==========================================${NC}"
