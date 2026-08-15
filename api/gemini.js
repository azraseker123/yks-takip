module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({ result: "HATA: Vercel ortam değişkenlerinde GEMINI_API_KEY bulunamadı." });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt || "Merhaba";

    // 1. Modelleri listele
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    if (!listRes.ok) {
      return res.status(200).json({ result: `Model Liste Hatası: ${listData.error?.message || 'Erişim reddedildi'}` });
    }

    // Pasif/kullanımdan kaldırılmış (2.0/2.5 flash vb.) olmayan aktif ilk geçerli modeli seç
    const availableModels = listData.models || [];
    const validModel = availableModels.find(m => 
      m.supportedGenerationMethods?.includes("generateContent") && 
      !m.name.includes("2.5") && 
      !m.name.includes("2.0")
    ) || availableModels.find(m => m.supportedGenerationMethods?.includes("generateContent"));

    if (!validModel) {
      return res.status(200).json({ result: "HATA: Aktif bir Gemini modeli bulunamadı." });
    }

    // 2. Seçilen modele istek gönder
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${validModel.name}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({ result: `API Hatası (${validModel.name}): ${data.error?.message || 'Bilinmeyen hata'}` });
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Yanıt alınamadı.";
    return res.status(200).json({ result: resultText });

  } catch (error) {
    return res.status(200).json({ result: `Sunucu Hatası: ${error.message}` });
  }
};
