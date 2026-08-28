import test from "node:test";
import assert from "node:assert/strict";
import { runHiringSlate, runPanel } from "../src/interview-engine.js";

const config = { provider: "gemini", geminiApiKey: "test-key", model: "test-primary", fallbackModel: "test-fallback" };
const input = {
  role: "AI Engineer - Agentic Systems",
  jobDescription: "Build and operate Python services, production AI agents, RAG, basic React screens, MongoDB, OCR, and reliability improvements.",
  resume: "Candidate: Backend engineer. Skills: Python, FastAPI, RAG, vector search, MongoDB, React, OCR, Docker.",
  transcript: "Candidate: I owned a production incident, wrote the retro, and added a pre-deploy evaluation checklist. I have shipped a RAG system but have not shipped multi-agent orchestration in production."
};

const profile = {
  candidate_name: "Test Candidate",
  headline: "Backend engineer moving into applied AI",
  skills: [{ name: "Python", evidence: "Resume lists Python" }, { name: "RAG", evidence: "Resume lists RAG and vector search" }],
  experience: [{ summary: "Maintained production services", evidence: "Transcript describes owning an incident" }],
  claims: [{ claim: "Production ownership", evidence: "Candidate wrote the incident retro" }],
  role_requirements: [{ requirement: "Python services", evidence: "Job description requires Python services" }],
  open_questions: ["Depth of production multi-agent experience"]
};

const opinions = {
  "Vikramaditya Motwane": { persona: "technical", recommendation: "mixed", confidence: 74, summary: "Strong Python and RAG evidence; multi-agent production depth is unproven.", strengths: [{ point: "Backend foundation", evidence: "Resume lists Python and FastAPI" }], concerns: [{ point: "Agent orchestration", evidence: "Transcript says multi-agent work was not shipped in production" }], follow_up: "Ask about agent failure recovery." },
  "Manasvi Kamble": { persona: "culture", recommendation: "yes", confidence: 86, summary: "Candidate took accountability for a production incident.", strengths: [{ point: "Ownership", evidence: "Candidate wrote the incident retro" }], concerns: [{ point: "New domain", evidence: "Freight experience is not demonstrated" }], follow_up: "Ask about startup collaboration." },
  "Anirudh Ravichander": { persona: "manager", recommendation: "mixed", confidence: 78, summary: "Good reliability instincts but needs ramp-up on agent systems.", strengths: [{ point: "Operational mindset", evidence: "Candidate added a pre-deploy evaluation checklist" }], concerns: [{ point: "Immediate role fit", evidence: "Job requires existing multi-agent work" }], follow_up: "Discuss a 90-day ramp plan." },
  "Kalyani Iyer": { persona: "skeptic", recommendation: "mixed", confidence: 82, summary: "Candidate is appropriately candid about the production orchestration gap.", strengths: [{ point: "Honesty", evidence: "Transcript explicitly acknowledges the gap" }], concerns: [{ point: "Evidence gap", evidence: "No shipped multi-agent system is cited" }], follow_up: "Validate hands-on orchestration experience." }
};

const completeDebate = {
  summary: "The panel agrees on production ownership and RAG foundations, while retaining concern about unproven multi-agent delivery.",
  agreements: [{ topic: "Production ownership", panelists: ["technical", "culture", "manager", "skeptic"], evidence: "Candidate owned an incident retro and added a pre-deploy evaluation checklist." }],
  disagreements: [{ topic: "Ramp-up risk", panelists: ["technical", "manager", "skeptic"], status: "unresolved", evidence: "Candidate has not shipped multi-agent orchestration in production." }],
  exchanges: [
    { speaker: "technical", responding_to: "manager", position: "agree", response: "The Python and RAG base is credible, but the orchestration gap matters.", evidence: "Resume lists Python, FastAPI, and RAG." },
    { speaker: "culture", responding_to: "skeptic", position: "agree", response: "I agree that the candidate's candid acknowledgement is a positive signal, not proof of depth.", evidence: "Transcript explicitly acknowledges the gap." },
    { speaker: "manager", responding_to: "technical", position: "revise", response: "I would hire only with a structured ramp plan rather than assume immediate readiness.", evidence: "Job requires existing multi-agent work." },
    { speaker: "skeptic", responding_to: "culture", position: "agree", response: "Ownership is well supported, but it does not resolve the implementation gap.", evidence: "Candidate owned an incident retro and checklist." }
  ],
  unresolved: ["Whether the candidate can deliver production multi-agent improvements on day one."]
};

function modelResponse(value) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
}

function installMock({ incompleteFirstDebate = false } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  let debateCount = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const instructions = request.systemInstruction.parts[0].text;
    calls.push({ instructions, input: request.contents[0].parts[0].text });
    if (instructions.includes("candidate-profile analyst")) return modelResponse(profile);
    const persona = Object.keys(opinions).find(name => instructions.includes(`You are ${name}`));
    if (persona) return modelResponse(opinions[persona]);
    if (instructions.includes("facilitate a complete")) {
      debateCount += 1;
      return modelResponse(incompleteFirstDebate ? { summary: "Incomplete", exchanges: [completeDebate.exchanges[0]] } : completeDebate);
    }
    if (instructions.includes("debate-record auditor")) return modelResponse(completeDebate);
    if (instructions.includes("hiring committee chair selecting")) return modelResponse({ rationale: "Choose the strongest evidence-backed match.", selected_candidates: [{ candidate_name: "Candidate One", rank: 1, rationale: "Best role evidence.", next_step: "Reference check" }], comparison: [{ candidate_name: "Candidate One", rank: 1, readiness: 80, role_fit: 78, risk: 34, summary: "Good production foundation." }, { candidate_name: "Candidate Two", rank: 2, readiness: 70, role_fit: 68, risk: 45, summary: "Needs more ramp-up." }], unresolved_tradeoffs: ["Direct orchestration experience remains a differentiator."] });
    if (instructions.includes("hiring chair")) return modelResponse({ recommendation: "hold", confidence: 79, role_alignment: "partial", role_fit_summary: "Strong backend and ownership evidence with an orchestration gap.", rationale: "The chair weighs the documented production ownership more heavily than unsupported claims, but does not ignore the multi-agent gap.", strengths: ["Python and RAG experience", "Production accountability"], concerns: ["No shipped multi-agent orchestration"], unresolved_disagreements: completeDebate.unresolved, next_step: "Run a focused technical exercise.", decision_factors: [{ factor: "Production reliability", weight: "high", reason: "Supported by the incident response." }] });
    throw new Error(`Unexpected model request: ${instructions.slice(0, 80)}`);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("panel calls all four reviewers independently before debate", async () => {
  const mock = installMock();
  try {
    const report = await runPanel(input, config);
    assert.equal(report.opinions.length, 4);
    assert.equal(report.debate.exchanges.length, 4);
    const independent = mock.calls.filter(call => call.instructions.includes("working independently"));
    assert.equal(independent.length, 4);
    for (const call of independent) assert.equal(call.input.includes("INDEPENDENT OPINIONS"), false);
    assert.equal(report.decision.recommendation, "hold");
  } finally { mock.restore(); }
});

test("incomplete debate triggers an evidence-led coverage audit", async () => {
  const mock = installMock({ incompleteFirstDebate: true });
  try {
    const report = await runPanel(input, config);
    assert.equal(report.debate.exchanges.length, 4);
    assert.equal(report.debate.agreements.length, 1);
    assert.ok(mock.calls.some(call => call.instructions.includes("debate-record auditor")));
  } finally { mock.restore(); }
});

test("required source material is validated before model calls", async () => {
  const mock = installMock();
  try {
    await assert.rejects(() => runPanel({ ...input, transcript: "" }, config), /resume, and interview transcript/);
    assert.equal(mock.calls.length, 0);
  } finally { mock.restore(); }
});

test("hiring slate produces a comparative selection after complete candidate panels", async () => {
  const mock = installMock();
  try {
    const slate = await runHiringSlate({ role: input.role, jobDescription: input.jobDescription, hiringCount: 1, candidates: [{ name: "Candidate One", resume: input.resume, transcript: input.transcript }, { name: "Candidate Two", resume: input.resume, transcript: input.transcript }] }, config);
    assert.equal(slate.candidates.length, 2);
    assert.equal(slate.selection.selected_candidates.length, 1);
    assert.equal(slate.selection.selected_candidates[0].candidate_name, "Candidate One");
  } finally { mock.restore(); }
});

