import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { runHiringSlate, runPanel } from "./src/interview-engine.js";

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

// Keep configuration dependency-free: the key is read on the server, never by the browser.
try {
  const envFile = await readFile(join(process.cwd(), ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
} catch { /* .env is optional until a live panel is run. */ }

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("The submitted material is too large. Keep each input below 1 MB.");
  }
  return JSON.parse(raw || "{}");
}

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { status: "ok" });
    }
    if (req.method === "POST" && req.url === "/api/analyze") {
      const payload = await readJson(req);
      const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai")).toLowerCase();
      const config = {
        provider,
        openaiApiKey: process.env.OPENAI_API_KEY,
        geminiApiKey: process.env.GEMINI_API_KEY,
        model: provider === "gemini" ? (process.env.GEMINI_MODEL || "gemini-3.6-flash") : (process.env.OPENAI_MODEL || "gpt-4.1-mini"),
        fallbackModel: provider === "gemini" ? (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite") : null
      };
      const report = Array.isArray(payload.candidates) ? await runHiringSlate(payload, config) : await runPanel(payload, config);
      return send(res, 200, report);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
    const requested = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    const filePath = normalize(join(publicDir, requested));
    if (!filePath.startsWith(publicDir)) return send(res, 403, { error: "Forbidden" });
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
    return res.end(req.method === "HEAD" ? undefined : file);
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    return send(res, status, { error: error.message || "The panel could not complete this review." });
  }
}).listen(port, () => console.log(`Panelroom is ready at http://localhost:${port}`));

