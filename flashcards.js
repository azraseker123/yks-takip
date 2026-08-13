import { callGemini, extractJSON, rateLimit, clientKey } from "./_gemini.js";

function norm(s) {
  return String(s || "").toLocaleLowerCase("tr").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Sadece POST kabul edilir." });
    return;
  }
  if (!rateLimit("fc:" + clientKey(req), { max: 20, windowMs: 60000 })) {
    res.status(429).json({ error: "Çok fazla istek. Biraz sonra tekrar dene." });
    return;
  }

  const { examType, ders, konu } = req.body || {};
  const recentTerms = Array.isArray(req.body?.recentTerms)
    ? req.body.recentTerms.slice(-40).map(s => String(s).slice(0, 80)).filter(Boolean)
    : [];

  if (!examType || !ders || !konu) {
    res.status(400).json({ error: "examType, ders ve konu zorunludur." });
    return;
  }
  if (examType !== "TYT" && examType !== "AYT") {
    res.status(400).json({ error: "Geçersiz examType." });
    return;
  }

  const recentList = recentTerms.length
    ? recentTerms.map(s => `- ${s}`).join("\n")
    : "(bu konu için henüz kayıtlı terim yok)";

  const prompt = `Sen YKS (TYT/AYT) için basılı "hızlı bilgi kartı / formül defteri" tarzı kaynak kitaplar hazırlayan deneyimli bir eğitmensin.

GÖREV: ${examType} sınavı için SADECE "${ders}" dersinin SADECE "${konu}" konusundan, Türkçe 4 adet KLASİK BİLGİ KARTI üret.

KART FORMATI — KESİNLİKLE UY:
- "q" alanı: SADECE bir terim, kavram adı, formül adı veya kısa kural başlığı olacak (ör. "Mol Kavramı — Avogadro Sayısı", "Türevde Çarpım Kuralı", "Ek Fiil"). Bu bir SORU CÜMLESİ DEĞİLDİR — soru işareti kullanma, "nedir/ne demektir" gibi ifadeler kullanma, sohbet/röportaj tarzı bir cümle kurma (ör. "sence sınavda ne çıkar" gibi ifadeler KESİNLİKLE YASAK).
- "a" alanı: O terimin/formülün/kuralın %100 müfredat odaklı, nokta atışı, kısa ve net tanımı/kuralı/formülüdür. Yoruma açık ifadeler ("sence", "genelde", "muhtemelen", "duruma göre değişir") KESİNLİKLE YASAK — ders kitabı doğruluğunda, kesin bilgi ver. Mümkünse formülü veya kesin sayısal/kavramsal değeri içersin.
- Bu bir tahmin ("sınavda ne çıkar" gibi) veya sohbet içeriği DEĞİLDİR — saf bilgi tekrar kartıdır.

MUTLAK KURAL — DERS/KONU SAPMASI KESİNLİKLE YASAK:
Her kart sadece "${ders}" dersinin "${konu}" konusuyla ilgili olmalı. Bunu doğrulayabilmem için her kart objesinde "ders" ve "konu" alanlarını AYNEN "${ders}" ve "${konu}" olarak tekrar yaz — bu alanlar eşleşmeyen kartlar otomatik olarak elenecek.

ÇEŞİTLİLİK:
"${konu}" konusunun farklı alt başlıklarından/farklı terimlerinden kart seç — 4 kartın hepsi aynı alt başlıktan olmasın. Aşağıdaki terimler DAHA ÖNCE üretildi; bunları aynen ya da eş anlamlısıyla TEKRAR ÜRETME:
${recentList}

SADECE şu JSON formatında döndür, başka hiçbir açıklama, giriş cümlesi ya da markdown ekleme:
[{"ders":"${ders}","konu":"${konu}","q":"terim/formül/kavram adı","a":"nokta atışı tanım/kural/formül"}, ...]`;

  try {
    const text = await callGemini({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.6 }
    });
    const parsed = extractJSON(text);
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("Model beklenen formatta yanıt vermedi.");

    // 1) Ders/konu sapması filtresi.
    const dersN = norm(ders), konuN = norm(konu);
    let candidates = parsed.filter(c =>
      c && c.q && c.a && norm(c.ders) === dersN && norm(c.konu) === konuN
    );
    if (!candidates.length) {
      throw new Error("Model istenen ders/konu dışında veya eksik formatta kartlar üretti — lütfen tekrar dene.");
    }

    // 2) Soru-cümlesi kaçağı filtresi — "q" alanı yine de bir soru gibi geldiyse ele
    //    (ör. "?" ile bitiyorsa ya da "nedir" geçiyorsa) — format kuralına uyulmamış demektir.
    candidates = candidates.filter(c => {
      const q = norm(c.q);
      return !q.includes("?") && !q.includes("nedir") && !q.includes("sence");
    });
    if (!candidates.length) {
      throw new Error("Model kart yerine soru cümlesi üretti — lütfen tekrar dene.");
    }

    // 3) Aynen tekrar eden terimleri ele (yakın eşitlik — büyük/küçük harf ve boşluk farkı sayılmaz).
    const recentNormSet = new Set(recentTerms.map(norm));
    const deduped = candidates.filter(c => !recentNormSet.has(norm(c.q)));
    const finalCards = deduped.length ? deduped : candidates;

    res.status(200).json({ cards: finalCards });
  } catch (e) {
    res.status(502).json({ error: e.message || "Flashcard üretilemedi." });
  }
}
