const PERSONAS = [
  { id: "technical", name: "Ari Chen", role: "Technical interviewer", focus: "technical depth, practical skill, architecture choices, and the ability to explain trade-offs", color: "violet" },
  { id: "culture", name: "Maya Patel", role: "People & culture interviewer", focus: "communication, collaboration, accountability, and values alignment", color: "sky" },
  { id: "manager", name: "Jon Bell", role: "Hiring manager", focus: "role fit, business impact, ramp-up risk, and whether to hire", color: "amber" },
  { id: "skeptic", name: "Noor Khan", role: "Evidence skeptic", focus: "contradictions, unsupported claims, gaps, exaggeration, and unanswered risks", color: "coral" }
];

const evidenceRule = `Every substantive observation must cite an exact quote or a concrete fact from the provided resume or transcript. Do not invent experience. If evidence is missing, say so explicitly.`;

function clean(value, limit = 50000) {
  return String(value || "").trim().slice(0, limit);
}

function parseJson(text) {
  const candidate = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(candidate); } catch { throw new Error("The model returned an invalid structured response. Please run the panel again."); }
}

function textFromResponse(response) {
  if (response.output_text) return response.output_text;
  return response.output?.flatMap(item => item.content || []).filter(part => part.type === "output_text").map(part => part.text).join("\n") || "";
}

async function callModel({ apiKey, model }, instructions, input) {
  if (!apiKey) throw new Error("Add OPENAI_API_KEY to a local .env file before running a live panel review.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, store: false, instructions, input, temperature: 0.2 })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "OpenAI could not complete this review.");
  return parseJson(textFromResponse(body));
}

function commonInput({ role, resume, transcript }) {
  return `Target role: ${role}\n\nRESUME:\n${resume}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`;
}

async function buildProfile(input, config) {
  const prompt = commonInput(input);
  return callModel(config,
    `You are a careful candidate-profile analyst. Extract only supported facts from the candidate material. ${evidenceRule} Return valid JSON only: {"candidate_name":"string","headline":"string","skills":[{"name":"string","evidence":"quote or fact"}],"experience":[{"summary":"string","evidence":"quote or fact"}],"claims":[{"claim":"string","evidence":"quote or fact"}],"open_questions":["string"]}.`,
    prompt
  );
}

async function independentOpinion(persona, input, profile, config) {
  // This call deliberately receives no peer opinions. Promise.all below makes the isolation explicit.
  return callModel(config,
    `You are ${persona.name}, the ${persona.role} on an AI interview panel. Assess ${persona.focus}. You are working independently: you cannot see any other panelist's view and must not speculate about it. ${evidenceRule} Give a calibrated recommendation, not just a score. Return valid JSON only: {"persona":"${persona.id}","recommendation":"strong_yes|yes|mixed|no","confidence":0-100,"summary":"string","strengths":[{"point":"string","evidence":"exact quote or fact"}],"concerns":[{"point":"string","evidence":"exact quote or fact"}],"follow_up":"string"}.`,
    `${commonInput(input)}\n\nSHARED CANDIDATE PROFILE:\n${JSON.stringify(profile)}`
  );
}

async function debate(input, profile, opinions, config) {
  return callModel(config,
    `You facilitate a disciplined hiring-panel debate. The independent assessments below are now visible to the group. Force at least one named panelist to directly respond to a named colleague by agreeing, disagreeing, or revising a view. Preserve unresolved disagreement; do not flatten it. ${evidenceRule} Return valid JSON only: {"summary":"string","exchanges":[{"speaker":"persona id","responding_to":"persona id","position":"agree|disagree|revise","response":"string","evidence":"quote or fact"}],"unresolved":["string"]}.`,
    `${commonInput(input)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nINDEPENDENT OPINIONS (only now shared):\n${JSON.stringify(opinions)}`
  );
}

async function finalDecision(input, profile, opinions, panelDebate, config) {
  return callModel(config,
    `You are the hiring chair. Make the final decision using the evidence, not a mathematical average. Explicitly weigh evidence quality, relevance to the target role, confidence, and unresolved risks. A skeptical concern with strong source support may outweigh several weak positives. ${evidenceRule} Return valid JSON only: {"recommendation":"strong_hire|hire|hold|do_not_hire","confidence":0-100,"rationale":"string","strengths":["string"],"concerns":["string"],"unresolved_disagreements":["string"],"next_step":"string","decision_factors":[{"factor":"string","weight":"high|medium|low","reason":"string"}]}.`,
    `${commonInput(input)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nINDEPENDENT OPINIONS:\n${JSON.stringify(opinions)}\n\nDEBATE:\n${JSON.stringify(panelDebate)}`
  );
}

export async function runPanel(payload, config) {
  const input = { role: clean(payload.role, 300), resume: clean(payload.resume), transcript: clean(payload.transcript) };
  if (!input.role || !input.resume || !input.transcript) throw new Error("Add a target role, resume, and interview transcript before starting the panel.");
  const profile = await buildProfile(input, config);
  const opinions = await Promise.all(PERSONAS.map(persona => independentOpinion(persona, input, profile, config)));
  const panelDebate = await debate(input, profile, opinions, config);
  const decision = await finalDecision(input, profile, opinions, panelDebate, config);
  return { meta: { personas: PERSONAS, independence: "Each panelist completed a separate call without access to peer conclusions.", generated_at: new Date().toISOString() }, profile, opinions, debate: panelDebate, decision };
}

export { PERSONAS };

