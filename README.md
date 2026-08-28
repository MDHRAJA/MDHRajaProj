# Panelroom

An evidence-led multi-agent interview panel simulator. It builds one candidate profile, runs four independent reviews, conducts a direct-response panel debate, and produces a final decision that weighs evidence quality and unresolved risk instead of averaging scores.

## Run locally

1. Copy `.env.example` to `.env`, choose `AI_PROVIDER`, and add its server-side API key.
2. Run `node server.js`.
3. Open `http://localhost:3000`.

Both OpenAI and Gemini are supported. The API key remains server-side. The app expects pasted material or `.txt`/`.md` files for a resume and transcript.

For Gemini, the application retries temporary 500/503 capacity errors once, then automatically retries the same call with `GEMINI_FALLBACK_MODEL`. The default pair is `gemini-3.6-flash` and `gemini-3.1-flash-lite`.

## Deliberation guarantee

`src/interview-engine.js` intentionally calls the four persona reviews with `Promise.all`. Each call receives only the shared profile plus the source material—never another persona's conclusion. Only after they finish does the debate call receive the collected opinions, followed by a separate hiring-chair decision call.

