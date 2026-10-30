import { PERSONA } from "./persona.js";

// Tries these models in order. If one isn't available on the account, it moves to the next.
const MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
].filter(Boolean);

async function callGroq(model, messages) {
  const isReasoning = model.startsWith("openai/gpt-oss");
  const body = {
    model,
    temperature: 0.6,
    messages,
    // reasoning models think first, so they need more room and low effort to stay fast
    max_tokens: isReasoning ? 1500 : 300,
    ...(isReasoning ? { reasoning_effort: "low", include_reasoning: false } : {}),
  };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch (_) {}
  return { ok: r.ok, status: r.status, data, text };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  try {
    const { messages = [] } = req.body || {};
    const history = messages
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const msgs = [{ role: "system", content: PERSONA }, ...history];

    for (const model of MODELS) {
      const r = await callGroq(model, msgs);
      if (r.ok) {
        const reply = r.data?.choices?.[0]?.message?.content?.trim();
        if (reply) return res.status(200).json({ reply });
        console.error("Empty reply from", model);
        continue;
      }
      console.error("Groq error", model, r.status, r.text);
      // model missing / not allowed / bad params for this model -> try the next one
      if ([400, 403, 404].includes(r.status)) continue;
      if (r.status === 429) return res.status(429).json({ error: "Lots of people are asking right now. Please try again in a few seconds." });
      if (r.status === 401) return res.status(502).json({ error: "The AI service isn't set up correctly yet." });
      break;
    }
    return res.status(502).json({ error: "The AI service is busy. Please try again." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
