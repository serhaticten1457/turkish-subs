# Altyazı Stüdyosu Pro

Yapay zeka destekli, profesyonel altyazı çeviri ve düzenleme aracı. Gemini AI ile güçlendirilmiş, çift aşamalı çeviri hattı.

![Ekran Görüntüsü](https://cdn-icons-png.flaticon.com/512/11226/11226198.png)

## 🛠️ Gereksinimler

- **Docker:** Uygulamanın çalışması için Docker (veya Docker Desktop) kurulu olmalıdır.
- **Gemini API Key:** Google AI Studio üzerinden alınmış ücretsiz bir API anahtarı.

---

## 🪟 Windows Kurulumu

1. **Docker Desktop**'ı indirin ve kurun.
2. Bu projeyi bir klasöre indirin (ZIP olarak veya git clone ile).
3. Klasör içindeki **`setup_windows.bat`** dosyasına çift tıklayın.
4. Kurulum tamamlandığında açılan siyah pencerede size verilen linke tıklayın:
   - **http://localhost:3000**

> **Not:** Otomasyon özelliklerini (Klasör İzleme) kullanmak için **HTTPS** versiyonunu (`https://localhost:3443`) kullanmalısınız. Tarayıcı "Güvenli Değil" uyarısı verirse "Gelişmiş -> Devam Et" seçeneğini kullanın.

---

## 🐧 Linux / Raspberry Pi Kurulumu

Terminal üzerinden aşağıdaki komutları sırasıyla çalıştırın:

```bash
# 1. Proje klasörüne girin
cd turkish-subs

# 2. Kurulum scriptine izin verin
chmod +x update.sh

# 3. Kurulumu başlatın
./update.sh
```

---

## 🛠️ Özellikler
- **AI Destekli Çeviri:** Gemini 2.5/3.0 modelleri ile bağlamsal çeviri.
- **Otomasyon (Watch Folder):** Klasöre atılan dosyaları otomatik çevirip kaydeder.
- **TMDB Entegrasyonu:** Film/Dizi konusunu anlayarak doğru terminoloji kullanır.
- **Çeviri Hafızası (TM):** Yaptığınız düzeltmeleri hatırlar ve bir sonraki çeviride kullanır.
- **Deyim Sözlüğü:** İngilizce deyimleri yakalar ve yerelleştirme seçenekleri sunar.

## 💻 Geliştirici Notları

Proje Docker üzerinde 3 ana servis olarak çalışır:
- **app (Frontend):** React + Vite + Nginx (Port 3000/3443)
- **api (Backend):** FastAPI + Python (Port 8000)
- **redis (Cache):** Çeviri hafızası ve kuyruk yönetimi.