# 🤖 Discord Bot Dashboard

Çok fonksiyonlu Discord botu ve web dashboard'u. Müzik, AI sohbet, moderasyon ve daha fazlası!

## 🌐 Live Dashboard

**Web Dashboard:** [https://kursa.github.io/discord-bot-new](https://kursa.github.io/discord-bot-new)

Bot durumunu, istatistikleri ve komutları görüntüleyebilirsiniz.

## ✨ Özellikler

### 🎵 Müzik Sistemi
- YouTube'dan müzik çalma
- Ses seviyesi kontrolü
- Kuyruk sistemi
- Yüksek kalite audio

### 🎬 Watch Party
- YouTube Together entegrasyonu
- Otomatik kanal oluşturma
- Birlikte video izleme

### 🤖 AI Sohbet
- Google Gemini AI entegrasyonu
- Kişilik sistemi (5 farklı kişilik)
- Konuşma hafızası
- Akıllı yanıtlar

### 🛡️ Moderasyon
- Kick, ban, mute komutları
- Mesaj temizleme
- Kanal ve rol yönetimi
- Geçici ban sistemi

### 🧮 Matematik
- Hesap makinesi
- Rastgele sayı üretici
- Karekök hesaplama

### 🎮 Eğlence
- Şaka sistemi
- 8ball (sihirli top)
- Zar atma
- Avatar gösterme
- Sunucu bilgileri

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- Discord Bot Token
- Google Gemini API Key

### Adımlar

1. **Repository'yi klonlayın:**
```bash
git clone https://github.com/kursa/discord-bot-new.git
cd discord-bot-new
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Environment dosyasını oluşturun:**
```bash
cp .env.example .env
```

4. **Environment değişkenlerini ayarlayın:**
```env
DISCORD_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

5. **Botu başlatın:**
```bash
npm start
```

## 📋 Komutlar

### 🎵 Müzik
- `!music <şarkı>` - Müzik çal
- `!stop` - Müziği durdur
- `!volume <1-100>` - Ses seviyesi ayarla
- `!party <youtube_link>` - Watch party oluştur

### 🤖 AI Sohbet
- `!chat <mesaj>` - AI ile sohbet et
- `!personality <tip>` - Kişilik ayarla (arkadaş/resmi/komik/bilgili/motivasyon)
- `!memory` - Hafıza durumunu görüntüle

### 🛡️ Moderasyon
- `!kick @kullanıcı` - Kullanıcıyı at
- `!ban @kullanıcı` - Kullanıcıyı yasakla
- `!clear <sayı>` - Mesajları sil
- `!mute @kullanıcı` - Kullanıcıyı sustur

### 🎮 Eğlence
- `!joke` - Şaka yap
- `!8ball <soru>` - Sihirli 8 top
- `!dice` - Zar at
- `!avatar @kullanıcı` - Avatar göster

## 🌐 Web Dashboard

Bot ile birlikte çalışan web dashboard'u:

- **Gerçek zamanlı bot durumu**
- **Sunucu ve kullanıcı istatistikleri**
- **Komut listesi ve açıklamalar**
- **Bot davet linki**
- **Responsive tasarım**

### Dashboard Özellikleri
- 📊 Canlı istatistikler
- 🎛️ Bot durumu izleme
- 📱 Mobil uyumlu
- 🎨 Modern tasarım
- ⚡ Hızlı yükleme

## 🔧 API Endpoints

Bot aşağıdaki API endpoint'lerini sağlar:

- `GET /api/status` - Bot durumu ve istatistikleri
- `POST /api/control/:action` - Bot kontrolü (start/stop/restart)
- `GET /api/logs` - Bot logları

## 📦 Deployment

### GitHub Pages (Ücretsiz)
1. Repository'yi GitHub'a push edin
2. Settings > Pages > Source: GitHub Actions
3. Otomatik deployment başlayacak

### Heroku (Bot için)
1. Heroku hesabı oluşturun
2. Heroku CLI ile deploy edin:
```bash
heroku create your-bot-name
git push heroku main
```

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🆘 Destek

Sorunlarınız için:
- [Issues](https://github.com/your-username/discord-bot-new/issues) açın
- [Discord sunucumuza](https://discord.gg/your-invite) katılın

## 📸 Ekran Görüntüleri

### Web Dashboard
![Dashboard](https://via.placeholder.com/800x400?text=Dashboard+Screenshot)

### Bot Komutları
![Commands](https://via.placeholder.com/800x400?text=Bot+Commands+Screenshot)

---

⭐ **Projeyi beğendiyseniz yıldız vermeyi unutmayın!**