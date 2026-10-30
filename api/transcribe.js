// Receives recorded audio (base64) from the page and turns it into text
// using Groq's free Whisper speech-to-text. The API key stays on the server.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const { audio, mime = "audio/webm" } = req.body || {};
    if (!audio || typeof audio !== "string") return res.status(400).json({ error: "No audio received" });

    const buf = Buffer.from(audio, "base64");
    if (buf.length < 1000) return res.status(400).json({ error: "Recording was too short. Please try again." });

    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), `question.${ext}`);
    form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
    form.append("language", "en");
    form.append("response_format", "json");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      console.error("Groq STT error", r.status, await r.text());
      return res.status(502).json({ error: "Couldn't understand the audio. Please try again or type your question." });
    }
    const data = await r.json();
    return res.status(200).json({ text: (data.text || "").trim() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
