module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(200).json({ result: "API Anahtarı Yok!" });

    // Hesabında açık olan TÜM modelleri liste yap
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({ result: `Liste Alınamadı: ${data.error?.message}` });
    }

    // Sadece metin üretebilen model isimlerini süz
    const modelNames = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    return res.status(200).json({ result: `AÇIK MODELLERIN: ${modelNames.join(", ")}` });

  } catch (error) {
    return res.status(200).json({ result: `Sunucu Hatası: ${error.message}` });
  }
};
