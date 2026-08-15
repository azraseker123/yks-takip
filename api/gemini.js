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

    // Stabil Gemini 1.5 Flash Modeli
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
      return res.status(200).json({ result: `API Hatası: ${data.error?.message || 'Bilinmeyen hata'}` });
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Yanıt alınamadı.";
    return res.status(200).json({ result: resultText });

  } catch (error) {
    return res.status(200).json({ result: `Sunucu Hatası: ${error.message}` });
  }
};
