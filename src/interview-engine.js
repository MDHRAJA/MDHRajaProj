const PERSONAS = [
  { id: "technical", name: "Vikramaditya Motwane", role: "Technical interviewer", focus: "technical depth, practical skill, architecture choices, and the ability to explain trade-offs", color: "violet" },
  { id: "culture", name: "Manasvi Kamble", role: "People & culture interviewer", focus: "communication, collaboration, accountability, and values alignment", color: "sky" },
  { id: "manager", name: "Anirudh Ravichander", role: "Hiring manager", focus: "role fit, business impact, ramp-up risk, and whether to hire", color: "amber" },
  { id: "skeptic", name: "Kalyani Iyer", role: "Evidence skeptic", focus: "contradictions, unsupported claims, gaps, exaggeration, and unanswered risks", color: "coral" }
];

const evidenceRule = `Every statement about the candidate must cite an exact quote or concrete fact from the provided resume or transcript. Every statement about role fit must cite a specific job-description requirement. Do not invent experience or requirements. If evidence is missing, say so explicitly.`;

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

async function requestWithTimeout(url, options, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`${provider} did not respond within 25 seconds. The provider may be under high demand; please run the panel again.`);
      timeoutError.retryable = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function callModel(config, instructions, input) {
  if (config.provider === "gemini") {
    if (!config.geminiApiKey) throw new Error("Add GEMINI_API_KEY to a local .env file before running a Gemini panel review.");
    const models = [...new Set([config.model, config.fallbackModel].filter(Boolean))];
    let lastError;
    for (const model of models) {
      for (let attempt = 0; attempt < 1; attempt += 1) {
        try { return await requestGemini(config, model, instructions, input); }
        catch (error) {
          lastError = error;
          if (!error.retryable || attempt === 1) break;
          await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  if (!config.openaiApiKey) throw new Error("Add OPENAI_API_KEY to a local .env file before running an OpenAI panel review.");
  const response = await requestWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({ model: config.model, store: false, instructions, input, temperature: 0.2 })
  }, "OpenAI");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "OpenAI could not complete this review.");
  return parseJson(textFromResponse(body));
}

async function requestGemini(config, model, instructions, input) {
  const response = await requestWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": config.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    })
  }, "Gemini");
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message || "Gemini could not complete this review.");
    error.retryable = response.status === 500 || response.status === 503;
    throw error;
  }
  const text = body.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n") || "";
  return parseJson(text);
}

function commonInput({ role, resume, transcript, jobDescription }) {
  return `Target role: ${role}\n\nDETAILED JOB DESCRIPTION:\n${jobDescription}\n\nRESUME:\n${resume}\n\nINTERVIEW TRANSCRIPT:\n${transcript}`;
}

async function buildProfile(input, config) {
  const prompt = commonInput(input);
  return callModel(config,
    `You are a careful candidate-profile analyst. Extract only supported candidate facts and the role requirements from the job description. ${evidenceRule} Return valid JSON only: {"candidate_name":"string","headline":"string","skills":[{"name":"string","evidence":"quote or fact"}],"experience":[{"summary":"string","evidence":"quote or fact"}],"claims":[{"claim":"string","evidence":"quote or fact"}],"role_requirements":[{"requirement":"string","evidence":"job-description quote or fact"}],"open_questions":["string"]}.`,
    prompt
  );
}

async function independentOpinion(persona, input, profile, config) {
  // This call deliberately receives no peer opinions. Promise.all below makes the isolation explicit.
  return callModel(config,
    `You are ${persona.name}, the ${persona.role} on an AI interview panel. Assess ${persona.focus} against the detailed job description. You are working independently: you cannot see any other panelist's view and must not speculate about it. ${evidenceRule} Give a calibrated recommendation, not just a score. Return valid JSON only: {"persona":"${persona.id}","recommendation":"strong_yes|yes|mixed|no","confidence":0-100,"summary":"string","strengths":[{"point":"string","evidence":"candidate quote/fact + requirement"}],"concerns":[{"point":"string","evidence":"candidate quote/fact + requirement"}],"follow_up":"string"}.`,
    `${commonInput(input)}\n\nSHARED CANDIDATE PROFILE:\n${JSON.stringify(profile)}`
  );
}

async function debate(input, profile, opinions, config) {
  const initial = await callModel(config,
    `You facilitate a complete, disciplined hiring-panel debate. The independent assessments below are now visible to the group. First reconcile every material strength and concern raised by the four panelists: do not silently omit a point merely because several reviewers agree. Then produce a debate record where every material agreement and disagreement is stated with its source evidence. Each listed panelist must directly respond to a named colleague; use agree, disagree, or revise. Include at least 4 substantive exchanges and enough additional exchanges to cover every material point. If the panel has no substantive disagreement on a point, record that as an agreement rather than inventing conflict. Preserve unresolved disagreement; do not flatten it. ${evidenceRule} Return valid JSON only: {"summary":"string","agreements":[{"topic":"string","panelists":["persona id"],"evidence":"candidate quote/fact + requirement"}],"disagreements":[{"topic":"string","panelists":["persona id"],"status":"resolved|unresolved","evidence":"candidate quote/fact + requirement"}],"exchanges":[{"speaker":"persona id","responding_to":"persona id","position":"agree|disagree|revise","response":"string","evidence":"quote or fact"}],"unresolved":["string"]}.`,
    `${commonInput(input)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nINDEPENDENT OPINIONS (only now shared):\n${JSON.stringify(opinions)}`
  );
  if (hasCompleteDebateCoverage(initial, opinions)) return initial;
  return callModel(config,
    `You are the debate-record auditor. Repair the incomplete panel debate below. Return a complete evidence-led record, not commentary. Requirements: every one of the four personas must speak directly to a named colleague; include at least 4 substantive exchanges; enumerate every material agreement in agreements; enumerate every material difference of view in disagreements with status resolved or unresolved; every item must cite resume/transcript or job-description evidence. Do not invent agreement or conflict unsupported by the independent opinions. ${evidenceRule} Return valid JSON only: {"summary":"string","agreements":[{"topic":"string","panelists":["persona id"],"evidence":"candidate quote/fact + requirement"}],"disagreements":[{"topic":"string","panelists":["persona id"],"status":"resolved|unresolved","evidence":"candidate quote/fact + requirement"}],"exchanges":[{"speaker":"persona id","responding_to":"persona id","position":"agree|disagree|revise","response":"string","evidence":"quote or fact"}],"unresolved":["string"]}.`,
    `${commonInput(input)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nINDEPENDENT OPINIONS:\n${JSON.stringify(opinions)}\n\nINCOMPLETE DEBATE TO REPAIR:\n${JSON.stringify(initial)}`
  );
}

function hasCompleteDebateCoverage(debate, opinions) {
  const exchanges = Array.isArray(debate?.exchanges) ? debate.exchanges : [];
  const speakers = new Set(exchanges.map(item => item?.speaker).filter(Boolean));
  const personaIds = opinions.map(opinion => opinion.persona).filter(Boolean);
  const hasAllSpeakers = personaIds.every(id => speakers.has(id));
  const hasAgreement = Array.isArray(debate?.agreements) && debate.agreements.length > 0;
  const opinionSplit = new Set(opinions.map(opinion => opinion.recommendation)).size > 1;
  const hasRequiredDifference = !opinionSplit || (Array.isArray(debate?.disagreements) && debate.disagreements.length > 0);
  return exchanges.length >= 4 && hasAllSpeakers && hasAgreement && hasRequiredDifference;
}

async function finalDecision(input, profile, opinions, panelDebate, config) {
  return callModel(config,
    `You are the hiring chair. Make the final decision using the evidence, not a mathematical average. Explicitly weigh evidence quality, match against the detailed job description, relevance to the target role, confidence, and unresolved risks. A skeptical concern with strong source support may outweigh several weak positives. ${evidenceRule} Return valid JSON only: {"recommendation":"strong_hire|hire|hold|do_not_hire","confidence":0-100,"role_alignment":"strong|partial|weak","role_fit_summary":"string","rationale":"string","strengths":["string"],"concerns":["string"],"unresolved_disagreements":["string"],"next_step":"string","decision_factors":[{"factor":"string","weight":"high|medium|low","reason":"string"}]}.`,
    `${commonInput(input)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nINDEPENDENT OPINIONS:\n${JSON.stringify(opinions)}\n\nDEBATE:\n${JSON.stringify(panelDebate)}`
  );
}

export async function runPanel(payload, config) {
  const input = { role: clean(payload.role, 300), resume: clean(payload.resume), transcript: clean(payload.transcript), jobDescription: clean(payload.jobDescription) };
  if (!input.role || !input.resume || !input.transcript || !input.jobDescription) throw new Error("Add a target role, detailed job description, resume, and interview transcript before starting the panel.");
  const profile = await buildProfile(input, config);
  const opinions = await Promise.all(PERSONAS.map(persona => independentOpinion(persona, input, profile, config)));
  const panelDebate = await debate(input, profile, opinions, config);
  const decision = await finalDecision(input, profile, opinions, panelDebate, config);
  return { meta: { personas: PERSONAS, independence: "Each panelist completed a separate call without access to peer conclusions.", generated_at: new Date().toISOString() }, profile, opinions, debate: panelDebate, decision };
}

export async function runHiringSlate(payload, config) {
  const role = clean(payload.role, 300), jobDescription = clean(payload.jobDescription), hiringCount = Math.max(1, Math.floor(Number(payload.hiringCount) || 1));
  const candidates = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 12) : [];
  if (!role || !jobDescription || !candidates.length) throw new Error("Add a target role, detailed job description, and at least one candidate before building a hiring slate.");
  if (candidates.some(candidate => !clean(candidate.resume) || !clean(candidate.transcript))) throw new Error("Every candidate needs both a resume and interview transcript.");
  if (hiringCount > candidates.length) throw new Error("The number of openings cannot exceed the number of candidates.");

  // Each candidate gets a complete independent panel before any cross-candidate comparison begins.
  const reports = await Promise.all(candidates.map(async (candidate, index) => {
    const report = await runPanel({ role, jobDescription, resume: clean(candidate.resume), transcript: clean(candidate.transcript) }, config);
    return { candidate_name: clean(candidate.name, 200) || report.profile.candidate_name || `Candidate ${index + 1}`, source_material: { resume: clean(candidate.resume), transcript: clean(candidate.transcript) }, ...report };
  }));
  const selection = await callModel(config,
    `You are the final hiring committee chair selecting a slate for ${hiringCount} open role(s). You receive the detailed job description, every candidate's resume and transcript, and their complete independent panel record including debate. Select exactly ${hiringCount} candidates only when evidence supports it; never average scores mechanically. Rank candidates based on demonstrated role requirements, evidence quality, production readiness, risks, and unresolved disagreements. Return valid JSON only: {"rationale":"string","selected_candidates":[{"candidate_name":"string","rank":1,"rationale":"string","next_step":"string"}],"comparison":[{"candidate_name":"string","rank":1,"readiness":0-100,"role_fit":0-100,"risk":0-100,"summary":"string"}],"unresolved_tradeoffs":["string"]}.`,
    JSON.stringify({ target_role: role, detailed_job_description: jobDescription, hiring_count: hiringCount, candidates: reports })
  );
  return { mode: "slate", hiring_count: hiringCount, candidates: reports, selection };
}

export { PERSONAS };

