import { runHiringSlate, runPanel } from "../src/interview-engine.js";

function response(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
    try {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 1_000_000) return response({ error: "The submitted material is too large. Keep each input below 1 MB." }, 413);
      const payload = await request.json();
      const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai")).toLowerCase();
      const config = {
        provider,
        openaiApiKey: process.env.OPENAI_API_KEY,
        geminiApiKey: process.env.GEMINI_API_KEY,
        model: provider === "gemini" ? (process.env.GEMINI_MODEL || "gemini-3.6-flash") : (process.env.OPENAI_MODEL || "gpt-4.1-mini"),
        fallbackModel: provider === "gemini" ? (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite") : null
      };
      const report = Array.isArray(payload.candidates) ? await runHiringSlate(payload, config) : await runPanel(payload, config);
      return response(report);
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 500;
      return response({ error: error.message || "The panel could not complete this review." }, status);
    }
  }
};

