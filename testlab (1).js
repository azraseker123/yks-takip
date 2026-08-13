import { callGemini, extractJSON, rateLimit, clientKey } from "./_gemini.js";

// Her istekte modele farklı bir "varyasyon açısı" vererek aynı ders/konuya art arda
// yapılan isteklerde bile örnekleme çeşitliliğini artırıyoruz (temperature'a ek olarak).
const VARIATION_HINTS = [
  "farklı sayısal değerler ve farklı bir problem kurgusu kullan",
  "konunun daha az sorulan bir alt başlığına odaklan",
  "iki kavramı/kuralı aynı soruda birlikte test eden bileşik bir soru kur",
  "çeldiricileri normalden daha yakın ve gerçekten ayırt edici yap",
  "konunun sınavda az kullanılan ama müfredatta olan bir formülünü/kuralını merkeze al",
  "önceki sorulardan tamamen farklı bir senaryo/bağlam ile aynı kazanımı ölç"
];

function norm(s) {
  return String(s || "").toLocaleLowerCase("tr").trim();
}

// Basit kelime-örtüşmesi (Jaccard) ile "neredeyse aynı soru" tespiti.
function tokenize(s) {
  return norm(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2);
}
function jaccard(aWords, bWords) {
  const a = new Set(aWords), b = new Set(bWords);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Sadece POST kabul edilir." });
    return;
  }
  if (!rateLimit("tl:" + clientKey(req), { max: 15, windowMs: 60000 })) {
    res.status(429).json({ error: "Çok fazla istek. Biraz sonra tekrar dene." });
    return;
  }

  const { examType, ders, konu, zorluk } = req.body || {};
  const adet = Math.min(Math.max(parseInt(req.body?.adet, 10) || 5, 1), 20);
  const recentSummaries = Array.isArray(req.body?.recentSummaries)
    ? req.body.recentSummaries.slice(-25).map(s => String(s).slice(0, 120)).filter(Boolean)
    : [];

  if (!examType || !ders || !konu || !zorluk) {
    res.status(400).json({ error: "examType, ders, konu ve zorluk zorunludur." });
    return;
  }
  if (examType !== "TYT" && examType !== "AYT") {
    res.status(400).json({ error: "Geçersiz examType." });
    return;
  }

  const recentList = recentSummaries.length
    ? recentSummaries.map(s => `- ${s}`).join("\n")
    : "(bu konu için henüz kayıtlı soru yok)";
  const variationHint = VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

  const prompt = `Sen YKS (TYT/AYT) hazırlık kurumları için basılı soru bankası hazırlayan, deneyimli ve titiz bir soru yazarısın.

GÖREV: ${examType} sınavı için SADECE "${ders}" dersinin SADECE "${konu}" konusundan, Türkçe ${adet} adet çoktan seçmeli (5 şıklı) soru üret.

MUTLAK KURAL — DERS/KONU SAPMASI KESİNLİKLE YASAK:
Üreteceğin HER soru sadece "${ders}" dersinin "${konu}" konusuyla ilgili olmalı. Başka bir derse kayan veya "${konu}" dışına taşan tek bir soru bile üretme. Bunu doğrulayabilmem için her soru objesinde "ders" ve "konu" alanlarını AYNEN "${ders}" ve "${konu}" olarak tekrar yaz — bu alanlar eşleşmeyen sorular otomatik olarak elenecek.

SORU TARZI (kesinlikle uy):
- Sorular ASLA kolay olmayacak — en az orta-zor, sınavı gerçekten ayırt edici (seçici) seviyede. Hedef zorluk: "${zorluk}".
- Sorular DOĞRUDAN ve NET olacak. Gereksiz uzun senaryo, gereksiz "hikaye", diyalog, karakter anlatımı veya abartılı "yeni nesil" dekor YASAK. Amaç bilgiyi, formül hakimiyetini ve analitik düşünmeyi ölçmek — kelime kalabalığıyla değil, kavramsal zorlukla ayırt et.
- Sayısal derslerde (Matematik, Geometri, Fizik, Kimya): sayısal veriler içeren, birden fazla işlem adımı gerektiren, klasik YKS soru kalıplarına (denklem çözme, formül uygulama, orantı, birleştirilmiş kavramlar vb.) uygun sorular üret. Şıklar birbirine yakın, dikkatli hesap gerektiren değerler olsun — kolayca elenebilecek uçuk şıklar koyma.
- Sözel derslerde (Türkçe, Edebiyat, Tarih, Coğrafya, Felsefe, Biyoloji, Din Kültürü): kısa ve öz bir bilgi/durum cümlesi üzerinden çıkarım, kıyaslama ya da sebep-sonuç isteyen sorular üret; paragraf kullanacaksan 2-4 cümleyi geçme, gereksiz dolgu cümlesi kurma.
- Her sorunun tam 5 şıkkı (A,B,C,D,E), tek doğru cevabı ve kısa ama gerekçeli bir çözüm açıklaması olsun.

ÇEŞİTLİLİK — TEKRARI ÖNLEME:
Aşağıda bu ders/konu için DAHA ÖNCE üretilmiş soru özetleri var. Bunlarla aynı senaryoyu, aynı sayısal değerleri ya da aynı yüzeysel kalıbı KESİNLİKLE tekrarlama:
${recentList}
Bu seti şu açıdan kur (bunu soru metninde belirtme, sadece bir yönlendirme): ${variationHint}.

SADECE şu JSON formatında döndür, başka hiçbir metin, giriş cümlesi veya markdown ekleme:
[{"ders":"${ders}","konu":"${konu}","soru":"...","secenekler":{"A":"...","B":"...","C":"...","D":"...","E":"..."},"dogru":"A","cozum":"..."}]`;

  try {
    const text = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.85 },
      timeoutMs: 40000
    });
    const parsed = extractJSON(text);
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("Model beklenen formatta yanıt vermedi.");

    // 1) Ders/konu sapması filtresi — model talimatı yok saymışsa burada elenir.
    const dersN = norm(ders), konuN = norm(konu);
    let candidates = parsed.filter(q =>
      q && q.soru && q.secenekler && q.dogru &&
      Object.keys(q.secenekler).length >= 4 &&
      norm(q.ders) === dersN && norm(q.konu) === konuN
    );
    if (!candidates.length) {
      throw new Error("Model istenen ders/konu dışında veya eksik formatta sorular üretti — lütfen tekrar dene.");
    }

    // 2) Basit yakın-tekrar filtresi — geçmiş özetlerle çok benzer soruları ele.
    const recentTokens = recentSummaries.map(tokenize);
    candidates = candidates.filter(q => {
      const qTokens = tokenize(q.soru);
      return !recentTokens.some(rt => jaccard(qTokens, rt) > 0.6);
    });
    if (!candidates.length) {
      throw new Error("Üretilen sorular önceki sorularla çok benziyordu — lütfen tekrar dene.");
    }

    res.status(200).json({ questions: candidates });
  } catch (e) {
    res.status(502).json({ error: e.message || "Test üretilemedi." });
  }
}
