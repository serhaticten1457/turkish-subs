# Altyazı Stüdyosu Pro

Yapay zeka destekli, profesyonel altyazı çeviri ve düzenleme aracı.

## 🚀 Kurulum ve Çalıştırma

### Geliştirme Ortamı (Bilgisayarınız)
1. Kodları düzenleyin.
2. Değişiklikleri gönderin:
   ```bash
   git add .
   git commit -m "Yeni özellikler"
   git push origin main
   ```

### Sunucu / CasaOS (Raspberry Pi)
Bu işlemi **sadece bir kez** yapmanız gerekir:
1. Terminali açın.
2. Proje klasörüne gidin: `cd subtitle-studio`
3. Güncelleme betiğine izin verin: `chmod +x update.sh`

## 🔄 Nasıl Güncellenir?

Geliştirme bilgisayarınızdan kodları `git push` ile gönderdikten sonra, Raspberry Pi terminalinde sadece şunu yazın:

```bash
./update.sh
```

Bu komut:
1. GitHub'dan son kodları çeker.
2. Docker'ı günceller.
3. Sistemi yeniden başlatır.
