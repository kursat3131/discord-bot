# 🎨 Resim Oluşturma Özelliği Kurulum Rehberi

Bu rehber Discord botunuzda AI resim oluşturma özelliğini etkinleştirmek için gerekli adımları içerir.

## 📋 Gereksinimler

### 1. Stability AI API Anahtarı (İsteğe Bağlı)
- **Ücretsiz Test**: Stability AI'den ücretsiz API anahtarı alabilirsiniz
- **Website**: https://platform.stability.ai/account/keys
- **Kayıt**: Hesap oluşturun ve API anahtarınızı alın

### 2. Discord Sunucusunda Rol Ayarları

## 🛠️ Kurulum Adımları

### Adım 1: API Anahtarını Ekleyin
1. `.env` dosyasını açın
2. Aşağıdaki satırı ekleyin:
   ```
   STABLE_DIFFUSION_API_KEY=your_api_key_here
   ```
3. `your_api_key_here` kısmını gerçek API anahtarınızla değiştirin

### Adım 2: Discord Sunucusunda "Resim Oluşturucu" Rolü Oluşturun
1. Discord sunucunuzda `/rol_oluştur Resim Oluşturucu` komutunu çalıştırın
2. Alternatif olarak Discord'dan manuel rol oluşturun:
   - Sunucu Ayarları → Roller → Rol Oluştur
   - Rol adı: "Resim Oluşturucu" veya "Image Creator"

### Adım 3: Kullanıcılara Rol Verin
Resim oluşturma yetkisi vermek istediğiniz kullanıcılara bu rolü verin:
- Discord'da kullanıcıya sağ tık → Roller → "Resim Oluşturucu" seçin

## 🔒 Yetki Sistemi

### Kimler Resim Oluşturabilir?
- ✅ **Yöneticiler** (Administrator yetkisi olanlar)
- ✅ **"Resim Oluşturucu"** rolüne sahip kullanıcılar
- ✅ **"Image Creator"** rolüne sahip kullanıcılar
- ❌ Diğer kullanıcılar

### Güvenlik Önlemleri
- Rol sistemi ile erişim kontrolü
- API rate limiting (dakikada maksimum 10 istek)
- Hata yönetimi ve fallback sistemi

## 🎯 Kullanım

### Komutlar
```
!resim <açıklama>     # AI resim oluştur
!image <açıklama>     # İngilizce alternatif
```

### Örnekler
```
!resim güzel bir manzara
!resim cute anime cat
!resim cyberpunk şehir
```

## ⚠️ Önemli Notlar

### API Anahtarı Olmadan
- API anahtarı ayarlanmadıysa placeholder resimler gösterilir
- Bot çalışmaya devam eder, sadece gerçek AI resmi oluşturamaz

### Maliyet
- Stability AI ücretsiz kredi verir
- Sonrasında resim başına küçük ücret alır
- Rate limiting ile aşırı kullanım engellenir

### Alternatif API'ler
Bu kod şu API'lerle de çalışabilir (kod değişikliği gerekir):
- OpenAI DALL-E
- Midjourney API
- Replicate API
- Hugging Face

## 🔧 Sorun Giderme

### "API anahtarı bulunamadı" Hatası
1. `.env` dosyasında `STABLE_DIFFUSION_API_KEY` satırını kontrol edin
2. API anahtarının doğru olduğundan emin olun
3. Botu yeniden başlatın

### "Yetkiniz yok" Hatası
1. Kullanıcının "Resim Oluşturucu" rolü olduğunu kontrol edin
2. Alternatif olarak Administrator yetkisi verin

### API Hatası
1. Internet bağlantınızı kontrol edin
2. Stability AI servis durumunu kontrol edin
3. API anahtarınızın geçerli olduğundan emin olun

## 📞 Destek

Sorun yaşarsanız:
1. Konsol loglarını kontrol edin
2. API anahtarı ve rol ayarlarını doğrulayın
3. Bot'u yeniden başlatmayı deneyin

---
**Not**: Bu özellik isteğe bağlıdır. API anahtarı olmadan da bot normal olarak çalışır.
