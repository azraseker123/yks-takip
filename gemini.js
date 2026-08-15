// /api/gemini.js
// Vercel Serverless Function — Google Gemini API'ye sunucu tarafından köprü.
// Frontend artık hiçbir zaman bir API anahtarı görmez / göndermez.
// GEMINI_API_KEY, Vercel proje panelinde "Environment Variables" altında
// eklenmelidir (Settings → Environment Variables). Bu değişken tarayıcıya
// asla gönderilmez, yalnızca bu sunucu fonksiyonu içinde okunur.

const GEMINI_MODEL = "gemini-flash-latest";

module.exports = async function handler(req, res) {
  // Basit CORS/güvenlik: sadece POST kabul edilir.
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "server_missing_api_key",
      detail: "GEMINI_API_KEY ortam değişkeni Vercel projesinde tanımlı değil.",
    });
    return;
  }

  let body = req.body;
  // Bazı Vercel çalışma zamanlarında req.body zaten parse edilmiş olur;
  // string gelirse burada güvenle JSON'a çeviriyoruz.
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "invalid_json" });
      return;
    }
  }

  const { messages, max_tokens, system } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "invalid_request", detail: "messages alanı zorunludur." });
    return;
  }

  // Anthropic tarzı mesaj dizisini Gemini'nin "contents" formatına çevir.
  // Gemini rolleri "user" ve "model" olarak bekler (asistan mesajları "model").
  function toGeminiContents(msgs) {
    return msgs.map((m) => {
      const role = m.role === "assistant" ? "model" : "user";
      const parts = [];
      const content = m.content;
      if (typeof content === "string") {
        parts.push({ text: content });
      } else if (Array.isArray(content)) {
        content.forEach((block) => {
          if (block && block.type === "text") {
            parts.push({ text: block.text });
          } else if (block && block.type === "image" && block.source) {
            parts.push({
              inline_data: {
                mime_type: block.source.media_type,
                data: block.source.data,
              },
            });
          }
        });
      }
      return { role, parts };
    });
  }

  const geminiBody = {
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: max_tokens || 1500 },
  };
  if (system && typeof system === "string") {
    geminiBody.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const message = (data && data.error && data.error.message) || "gemini_error";
      res.status(resp.status).json({ error: message });
      return;
    }

    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("");

    if (!text) {
      res.status(502).json({ error: "empty_response" });
      return;
    }

    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: "server_error", detail: String((err && err.message) || err) });
  }
};
