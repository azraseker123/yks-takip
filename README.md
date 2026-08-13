# YKS Takip — Ultimate (Adım 1: Güvenli Backend)

## Ne değişti?
- Test Lab, Flashcard, AI koç sohbeti ve fotoğraftan soru çözme özellikleri
  kendi backend uç noktalarına (`/api/*.js`) istek atıyor; bu uç noktalar
  Vercel'in sunucu ortamında çalışıyor ve `GEMINI_API_KEY`'i sadece
  `process.env` üzerinden okuyor.
- Test Lab ve Flashcard promptları da (Adım 2 ve 3) tamamen yeniden yazıldı —
  detaylar aşağıda.

## Dosya yapısı
```
yks-takip/
  index.html          ← ön yüz (herkese açık, gizli bilgi içermez)
  api/
    _gemini.js         ← paylaşılan Gemini çağrı yardımcı fonksiyonu (sadece sunucu)
    flashcards.js       ← POST /api/flashcards
    testlab.js          ← POST /api/testlab
    chat.js              ← POST /api/chat
    photosolve.js        ← POST /api/photosolve
  package.json
  .env.example
  .gitignore
```

## Kurulum adımları

### 1) Gemini API anahtarı al
[Google AI Studio](https://aistudio.google.com/apikey) üzerinden ücretsiz bir
API anahtarı oluştur.

### 2) Projeyi Vercel'e bağla
```bash
npm i -g vercel   # yoksa
cd yks-takip
vercel
```
Sorulara varsayılan cevaplarla devam edebilirsin — proje kökünde `index.html`
ve `api/` klasörü olduğu için Vercel bunu otomatik statik site + serverless
function projesi olarak algılar.

### 3) Anahtarı Vercel'e gir (KRİTİK — burayı atlarsan API çalışmaz)
Vercel Dashboard → Proje → **Settings → Environment Variables**:
- `GEMINI_API_KEY` = az önce aldığın anahtar
- (opsiyonel) `GEMINI_MODEL` = `gemini-3.5-flash` (boş bırakırsan zaten bu kullanılır)

Değişkeni ekledikten sonra **yeniden deploy et** (env değişkenleri sadece yeni
deploy'larda devreye girer):
```bash
vercel --prod
```

### 4) Lokal geliştirme (opsiyonel)
```bash
cp .env.example .env.local   # ve içine gerçek anahtarını yaz
vercel dev
```
`.env.local` `.gitignore` içinde olduğu için yanlışlıkla commit edilmez.

## Bu adımda eklenen temel güvenlik/istikrar önlemleri
- **Anahtar asla client'a gitmiyor.** DevTools → Network sekmesinde artık
  hiçbir istekte `GEMINI_API_KEY` görünmeyecek.
- Her uç noktada basit bir **rate limit** var (ör. Test Lab: dakikada 15
  istek/IP) — kötüye kullanımı ve sürpriz faturaları zorlaştırır. Not: Bu
  limit her serverless "cold start"ta sıfırlanır; kalıcı/robust bir limit
  için ileride Vercel KV veya Upstash Redis eklenebilir — istersen ayrı bir
  adım olarak yapabiliriz.
- Test Lab'da `adet` parametresi sunucu tarafında 1–20 arasına sabitlendi
  (istemci ne gönderirse göndersin).
- Fotoğraf çözme uç noktasında dosya boyutu ve mime type kontrolü var.
- Her uç nokta ayrı dosya olduğu için ileride (Adım 2/3) prompt'ları
  değiştirmek tek bir dosyayı bulup değiştirmek kadar kolay.

## Sıradaki adımlar
- ~~**Adım 2:** Test sistemi müfredat ağacına göre yeniden yazıldı.~~ ✅ Tamamlandı
- ~~**Adım 3:** Flashcard sistemi bilgi/tanım odaklı hale getirildi.~~ ✅ Tamamlandı

## Adım 2 — Test Lab (özet)
- `api/testlab.js` prompt'u artık: (1) asla kolay olmayan, doğrudan/net, aşırı hikayeleştirilmemiş, bilgi+formül+analitik düşünce ölçen sorular istiyor; (2) her soru objesinde `ders`/`konu` alanlarını istenenle **aynen eşleştirmek zorunda** — sunucu bu alanları kontrol edip eşleşmeyenleri otomatik eliyor (ders karışması artık teknik olarak engelleniyor, sadece prompt'a güvenilmiyor); (3) istemciden gelen `recentSummaries` (o ders/konu için daha önce üretilmiş soru özetleri) prompt'a eklenip modele "bunları tekrarlama" deniyor, ayrıca sunucu basit bir kelime-örtüşmesi (Jaccard) testiyle çok benzer soruları da ayrıca eliyor.
- İstemci (`index.html`), her ders+konu kombinasyonu için `state.aiQuestionHistory` içinde son 50 soru özetini saklıyor ve her yeni istekte gönderiyor — bu, "hafıza/çeşitlilik algoritması".
- Mevcut `TOPIC_DATA` müfredat ağacı (TYT + AYT tüm alanlar, satır ~705) incelendi: zaten güncel MEB/YKS kazanımlarına uygun, ders-konu kırılımlı ve kapsamlı olduğu için **yeniden yazılmadı** — üzerine inşa edildi. Değiştirilmesini/genişletilmesini istersen ayrıca söyle.

## Adım 3 — Flashcard'lar (özet)
- `api/flashcards.js` artık kartları `{q: "terim/formül/kavram adı", a: "nokta atışı tanım/kural"}` formatında üretiyor — soru cümlesi, "sence ne çıkar" tarzı yorum içeriği kesinlikle yasak (prompt'ta açıkça belirtildi + sunucu `?`/"nedir"/"sence" içeren kaçakları filtreliyor).
- Aynı ders/konu sapması koruması ve terim tekrarını önleyen hafıza (`state.aiCardTermHistory`, son 80 terim) burada da var.
- AI çağrısı tamamen başarısız olursa devreye giren yerel (AI'sız) yedek kart üretici de aynı standarda (terim/tanım, röportaj tarzı değil) güncellendi — kullanıcı hata durumunda bile eski "sence sınavda ne çıkar" tarzı içerik görmeyecek.
