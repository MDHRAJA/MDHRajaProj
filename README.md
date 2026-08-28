# Panelroom

An evidence-led multi-agent interview panel simulator. It builds one candidate profile, runs four independent reviews, conducts a direct-response panel debate, and produces a final decision that weighs evidence quality and unresolved risk instead of averaging scores.

## Run locally

1. Copy `.env.example` to `.env` and add an `OPENAI_API_KEY`.
2. Run `node server.js`.
3. Open `http://localhost:3000`.

The API key remains server-side. The app expects pasted material or `.txt`/`.md` files for a resume and transcript.

## Deliberation guarantee

`src/interview-engine.js` intentionally calls the four persona reviews with `Promise.all`. Each call receives only the shared profile plus the source material—never another persona's conclusion. Only after they finish does the debate call receive the collected opinions, followed by a separate hiring-chair decision call.

