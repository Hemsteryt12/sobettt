# YanYana

Arkadaşlarınla aynı yerel ağda kullanabileceğin, hesaplı ve iki kanallı gerçek zamanlı sohbet uygulaması.

## USB'den başlatma

1. `start.bat` dosyasına çift tıkla; sunucu penceresini açık bırak.
2. Sunucu bilgisayarında `http://localhost:8011` adresini aç.
3. İlk açılışta yönetici adını ve en az 12 karakterli özel bir parolayı belirle. Parola güvenli özet olarak saklanır.
4. Diğer bilgisayarlarda aynı Wi-Fi/ağa bağlıyken tarayıcıdan `http://SUNUCU-IP:8011` adresine gidin. Sunucu IP'sini Windows'ta `ipconfig` komutuyla öğrenebilirsin.
5. Arkadaşların kendi hesaplarını açabilir. Yönetici, çevrimiçi kullanıcı listesinden kullanıcı çıkarabilir.

Windows Güvenlik Duvarı ilk çalıştırmada izin isterse, yalnızca güvendiğin özel/yerel ağlarda izin ver. Uygulamayı kullanmadan önce okul bilgisayarları ve ağı için yetkin olduğundan emin ol. Hesaplar ve sohbet geçmişi USB'deki `data` klasöründe saklanır; USB'yi çıkarmadan önce sunucu penceresini kapat. Bu klasörü silmek hesapları ve geçmişi siler.

## Özellikler

- `Sohbet`, `Kodlar` ve mikrofonlu `Sesli Oda` kanalları
- Hesap kaydı, giriş ve yönetici hesabı
- Üye parolalarında sabit karakter sayısı sınırı yoktur; parola boş bırakılamaz
- Yönetici tarafından kullanıcının bütün açık oturumlarının sonlandırılması
- Mesajların bir saat sonra ekrandan ve kalıcı geçmişten silinmesi
- Yöneticinin kullanıcıları çıkarabilmesi ve açık kanal sohbetini temizleyebilmesi
- Sesli odada tarayıcı mikrofonuyla gerçek zamanlı konuşma, mikrofonu kapatma ve görüşmeden ayrılma
- Sesli görüşme sırasında izin vererek ekran paylaşma; arkadaşlarının paylaştığı ekranı izleme
- Ayrı `/arena` sayfasında 3D çok oyunculu arena oyunu
- Üç operatör, üç harita ve dört ekipman yuvası (ana silah, tabanca, bomba, bıçak); başlangıçta AK-47, AWP sniper ve 100 altın
- Maçta isabet, kafa vuruşu, eleme ve MVP için altın; 50 altınlık CS tarzı silah kasası (standart %70, nadir %24, destansı %5, efsanevi %1; seçilen seviyede eşya yoksa altın telafisi) ve ekipman yükseltmeleri
- Oyun içi yazılı sohbet, silah/harita araması, tam ekran ve ayarlanabilir nişangâh

## Arena kontrolleri

- WASD veya yön tuşlarıyla hareket et; fareyle nişan al ve sol tıklamayla ateş et.
- `1` ana silah, `2` tabanca, `3` bomba, `4` bıçak yuvasını seçer. `Esc` fareyi serbest bırakır.
- Lobi ekranında operatörünü, haritayı ve sahip olduğun her yuvanın ekipmanını seç.
- Maçta `NİŞANGÂH` ayarını ve `✦` mağaza düğmesini kullan. Sohbet kutusu oyun ekranının sağ altındadır.
- Arenadaki harita/ekipman arama kutusu seçenekleri filtreler; tam ekran düğmesi üst çubuktadır.
- Bir vuruş 10, kafa vuruşu ek 20, eleme 25 ve yeni skor liderliği MVP bonusu 25 altın verir.
- Kasa 50 altındır. Mağazadan ekipman satın alabilir veya sahip olduğun silahı yükseltebilirsin.
- Maça AK-47 otomatik tüfeğiyle başlarsın; lobi ekipman menüsünden ücretsiz AWP sniper'a geçebilirsin. AK-47 ile sol tık basılı tutulduğunda otomatik ateş eder.
- Her hesap arena için 100 başlangıç altını alır. Kasa kilitli silahları nadirlik ağırlığıyla verir; seçilen seviyede uygun silah yoksa altın telafisi verir.

Mikrofon ve ekran paylaşımı için tarayıcının güvenli bağlamı ve kullanıcı izni gerekir. `localhost` güvenli kabul edilir; farklı ağlardan HTTPS tünel adresini kullan. Ses ve ekran bağlantısında STUN kullanılır; bazı ağlarda TURN sunucusu gerekir. Ekran paylaşımını yalnızca güvendiğin kişilerle yap.

## Farklı ağlardan geçici erişim

İlk kurulumu önce sunucu bilgisayarında `http://localhost:8011` üzerinden tamamla ve yönetici hesabı oluştur. Yönetici için en az 12 karakterli, paylaşmadığın bir parola seç. Sunucu kapalıyken USB'deki `internetten-baslat.bat` dosyasına çift tıkla. Açılan tünel penceresinde `https://...trycloudflare.com` adresi görünür; bu adresi yalnızca arkadaşlarınla paylaş. Sunucu ve tünel pencereleri açık kalmalıdır. Durdurmak için önce tünel penceresinde, ardından sunucu penceresinde Ctrl+C kullan.

Bu, kalıcı olmayan geçici bir internet bağlantısıdır. Yeniden başlatınca yeni adres oluşur; ağ veya hizmet kısıtları bağlantıyı engelleyebilir. Adresi herkese açık yerde paylaşma ve okul ağı/bilgisayarlarında yalnızca izin alarak kullan. Kalıcı internet sitesi değildir.

## Geliştirme

Node.js 18 veya üzeri kurulu proje klasöründe `npm install` ve `npm start` komutlarını çalıştır.
