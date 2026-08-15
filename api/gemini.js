module.exports = async function handler(req, res) {
  // CORS ayarları
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    // API anahtarı boşsa hata fırlat (Ama anahtarı ekrana basma!)
    if (!apiKey) {
      return res.status(500).json({ error: "Sunucu yapılandırma hatası." });
    }

    const { prompt } = req.body;
    
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
        return res.status(500).json({ error: "Google API bağlantısı başarısız." });
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Yanıt yok.";
    return res.status(200).json({ result: resultText });

  } catch (error) {
    return res.status(500).json({ error: "Sunucu hatası." });
  }
};
