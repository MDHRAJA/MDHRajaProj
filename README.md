# Panelroom

An evidence-led multi-agent interview panel simulator. It builds one candidate profile, runs four independent reviews, conducts a direct-response panel debate, and produces a final decision that weighs evidence quality and unresolved risk instead of averaging scores.

## Run locally

1. Copy `.env.example` to `.env`, choose `AI_PROVIDER`, and add its server-side API key.
2. Run `node server.js`.
3. Open `http://localhost:3000`.

Both OpenAI and Gemini are supported. The API key remains server-side. The app accepts pasted material, PDF, `.txt`, or `.md` files for the resume, interview transcript, and detailed job description. PDF text is extracted in the browser before analysis. The job description is provided to every panel stage and is explicitly weighed in the final role-alignment decision.

When the Job Description or resume is added, Panelroom can suggest the Target Role and candidate name automatically. Those suggestions fill only blank fields and remain editable at all times.

## Test

Run `npm test` to verify source-material validation, four independent reviewer calls, debate-coverage repair, and multi-candidate slate selection. The tests use privacy-safe representative fixtures derived from the supported use cases; no candidate PDFs or API credentials are committed.

For a hiring slate, add multiple candidates, set the number of open roles, and convene the panel. Each candidate receives a complete independent panel and debate before a separate hiring-committee call compares the complete records and selects the evidence-backed shortlist.

For Gemini, the application retries temporary 500/503 capacity errors once, then automatically retries the same call with `GEMINI_FALLBACK_MODEL`. The default pair is `gemini-3.6-flash` and `gemini-3.1-flash-lite`.

## Deploy to Vercel

Import this GitHub repository into a Vercel Hobby project. The `api/analyze.js` Vercel Function runs the same server-side panel workflow used locally. In **Project Settings → Environment Variables**, add `GEMINI_API_KEY` and optionally set `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.6-flash`, and `GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite`. Never place the key in a `VITE_`, `NEXT_PUBLIC_`, or browser-exposed variable.

## Deliberation guarantee

`src/interview-engine.js` intentionally calls the four persona reviews with `Promise.all`. Each call receives only the shared profile plus the source material—never another persona's conclusion. Only after they finish does the debate call receive the collected opinions, followed by a separate hiring-chair decision call.

