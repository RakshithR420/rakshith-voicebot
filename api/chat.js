import { PERSONA } from "./persona.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const { messages = [] } = req.body || {};
    const history = messages
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.6,
        max_tokens: 220,
        messages: [{ role: "system", content: PERSONA }, ...history],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("Groq error", r.status, t);
      return res.status(502).json({ error: "The AI service is busy. Please try again." });
    }
    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Sorry, could you ask that again?";
    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
