module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(200).json({ result: "HATA: API Key bulunamadı." });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt || "Merhaba";

    // Listenden teyit edilen stabil ve hafif modeller
    const fallbackModels = ["gemini-3.5-flash", "gemini-2.5-flash-lite"];
    let lastError = "";

    for (const model of fallbackModels) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ result: data.candidates[0].content.parts[0].text });
      }

      lastError = data.error?.message || "Bilinmeyen hata";
    }

    return res.status(200).json({ result: `API Hatası: ${lastError}` });

  } catch (error) {
    return res.status(200).json({ result: `Sunucu Hatası: ${error.message}` });
  }
};
