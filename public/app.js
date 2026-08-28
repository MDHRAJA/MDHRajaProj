const $ = selector => document.querySelector(selector);
let latestReport = null;
const sample = {
  role: "Senior Product Designer",
  resume: `Alex Morgan\nProduct Designer | 7 years experience\n\nExperience\n• Lead Product Designer, Orbit Health (2021–present): Led the redesign of a clinician workflow used by 12,000 care providers. Partnered with engineering and research; reduced task completion time by 28%.\n• Product Designer, Ledgerline (2018–2021): Shipped invoicing and payment flows for small businesses.\n\nSkills\nFigma, prototyping, user research, design systems, accessibility, product strategy.\n\nEducation\nBDes, Interaction Design, 2018.`,
  transcript: `Interviewer: Tell me about the clinician workflow redesign.\nAlex: I led the project from discovery through launch. I ran six usability sessions, mapped the critical path with the PM, and worked with two engineers on a phased release. The old flow took about eight minutes; after launch it averaged just under six.\n\nInterviewer: What was difficult?\nAlex: Our first prototype assumed clinicians would review alerts one at a time. Testing showed that was wrong, so I pushed to change the information hierarchy. I was initially defensive because it meant reworking the system, but I documented the findings and brought engineering into the next sessions.\n\nInterviewer: How do you measure design quality?\nAlex: I look for successful completion, error rate, and whether people can explain why they made a choice. I use qualitative signals alongside product data.\n\nInterviewer: You list design systems. What did you own?\nAlex: I maintained the component inventory and wrote contribution guidance. I did not build the front-end components myself, but I paired with engineering on tokens and accessibility states.\n\nInterviewer: Why this role?\nAlex: I want a role where I can work on ambiguous workflows and coach designers while staying close to research.`,
  jobDescription: `Senior Product Designer\n\nYou will own end-to-end workflow design for a clinical operations product. You will partner with product managers, engineers, and researchers to simplify complex workflows, guide a scalable design system, and use qualitative and quantitative evidence to improve outcomes.\n\nMust have: 5+ years of product design experience, strong Figma and prototyping skills, research practice, accessibility knowledge, clear stakeholder communication, and experience shipping complex workflow products.\n\nNice to have: healthcare or regulated-domain experience; coaching other designers.`
};

const stageCopy = ["Building the shared evidence file…", "Four panelists are reviewing independently…", "Opening the evidence-based debate…", "The hiring chair is weighing the record…"];

$("#load-sample").addEventListener("click", () => {
  const candidate = document.querySelector("[data-candidate]");
  $("#role").value = sample.role; candidate.querySelector(".candidate-name").value = "Alex Morgan"; candidate.querySelector(".candidate-resume").value = sample.resume; candidate.querySelector(".candidate-transcript").value = sample.transcript; $("#job-description").value = sample.jobDescription;
  updateBriefStatus();
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.addEventListener("change", async event => {
  if (!event.target.matches(".file-input")) return;
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const label = input.parentElement.querySelector("b");
  try {
    label.textContent = file.name.endsWith(".pdf") ? "Extracting PDF text…" : "Reading file…";
    const content = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? await extractPdfText(file) : await file.text();
    if (!content.trim()) throw new Error("No readable text was found in this file.");
    const target = input.dataset.target ? $("#" + input.dataset.target) : input.closest("[data-candidate]").querySelector(`.candidate-${input.dataset.field}`);
    target.value = content;
    if (input.dataset.target === "job-description") autoFillRole(content);
    if (input.dataset.field === "resume") autoFillCandidateName(input.closest("[data-candidate]"), content);
    label.textContent = `${file.name} · ready`;
    updateBriefStatus();
  } catch (error) { label.textContent = "Could not read this file"; alert(error.message || "This file could not be read. Try copying its text into the field instead."); }
});
document.addEventListener("input", event => {
  if (event.target.matches("#job-description")) autoFillRole(event.target.value);
  if (event.target.matches(".candidate-resume")) autoFillCandidateName(event.target.closest("[data-candidate]"), event.target.value);
  if (event.target.matches("#role, #job-description, #hiring-count, .candidate-name, .candidate-resume, .candidate-transcript")) updateBriefStatus();
});

$("#add-candidate").addEventListener("click", () => {
  const count = document.querySelectorAll("[data-candidate]").length + 1;
  const card = document.createElement("article"); card.className = "candidate-card"; card.dataset.candidate = "";
  card.innerHTML = `<header><span>Candidate ${String(count).padStart(2, "0")}</span><div><div class="name-entry"><input class="candidate-name" placeholder="Candidate name (optional)" autocomplete="off" /><small class="name-autofill">Auto-detected from resume when available</small></div><button type="button" class="remove-candidate">Remove</button></div></header><div class="materials-grid"><label class="field material"><span>Resume <small>paste text or load PDF/text</small></span><textarea class="candidate-resume" placeholder="Paste the candidate's resume…"></textarea><span class="upload-control"><input class="file-input" data-field="resume" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" /><b>Attach PDF or text file</b></span></label><label class="field material"><span>Interview transcript <small>paste text or load PDF/text</small></span><textarea class="candidate-transcript" placeholder="Paste the interview transcript…"></textarea><span class="upload-control"><input class="file-input" data-field="transcript" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" /><b>Attach PDF or text file</b></span></label></div>`;
  $("#candidate-stack").append(card); updateBriefStatus(); card.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.addEventListener("click", event => { if (event.target.matches(".remove-candidate")) { event.target.closest("[data-candidate]").remove(); renumberCandidates(); updateBriefStatus(); } });

$("#run-panel").addEventListener("click", async () => {
  const candidates = [...document.querySelectorAll("[data-candidate]")].map((card, index) => ({ name: card.querySelector(".candidate-name").value.trim() || `Candidate ${index + 1}`, resume: card.querySelector(".candidate-resume").value.trim(), transcript: card.querySelector(".candidate-transcript").value.trim() }));
  const payload = { role: $("#role").value.trim(), jobDescription: $("#job-description").value.trim(), hiringCount: Number($("#hiring-count").value), candidates };
  if (!payload.role || !payload.jobDescription || candidates.some(candidate => !candidate.resume || !candidate.transcript)) { alert("Add the target role, detailed job description, and resume + transcript for every candidate first."); return; }
  const results = $("#results"), button = $("#run-panel"), status = $("#status"), timeline = $("#run-timeline");
  results.classList.remove("hidden"); results.scrollIntoView({ behavior: "smooth", block: "start" }); button.disabled = true; $("#report").innerHTML = "";
  timeline.classList.remove("hidden"); let stage = 0; setTimeline(stage); status.innerHTML = `<span class="pulse"></span><span>${stageCopy[stage]}</span>`;
  const timer = setInterval(() => { stage = Math.min(stage + 1, stageCopy.length - 1); setTimeline(stage); status.innerHTML = `<span class="pulse"></span><span>${stageCopy[stage]}</span>`; }, 5000);
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "The panel could not complete this review.");
    latestReport = data; renderReport(data); setTimeline(3, true); status.classList.add("complete"); status.innerHTML = `<span>✓</span><span>Panel completed. Independent reviews, debate, and decision are recorded below.</span>`;
  } catch (error) { status.classList.add("error"); status.innerHTML = `<span>!</span><span>${escapeHtml(error.message)}</span>`; }
  finally { clearInterval(timer); button.disabled = false; }
});

function renderReport(data) {
  if (data.mode === "slate") { renderSlate(data); return; }
  const fragment = $("#report-template").content.cloneNode(true), decision = data.decision, profile = data.profile;
  const label = decision.recommendation.replaceAll("_", " ");
  fragment.querySelector(".decision-label").textContent = label; fragment.querySelector(".decision-rationale").textContent = decision.rationale;
  fragment.querySelector(".role-fit").textContent = `Role alignment: ${decision.role_alignment || "assessed"}${decision.role_fit_summary ? ` · ${decision.role_fit_summary}` : ""}`;
  fragment.querySelector(".confidence strong").textContent = `${decision.confidence}%`; fragment.querySelector(".confidence i").style.width = `${decision.confidence}%`;
  fragment.querySelector(".candidate-name").textContent = profile.candidate_name || "Candidate"; fragment.querySelector(".headline").textContent = profile.headline || "Evidence profile";
  fillEvidence(fragment.querySelector(".skills-list"), profile.skills, "name"); fillEvidence(fragment.querySelector(".requirements-list"), profile.role_requirements, "requirement"); fillEvidence(fragment.querySelector(".claims-list"), profile.claims, "claim");
  const grid = fragment.querySelector(".opinion-grid"); data.opinions.forEach(opinion => {
    const persona = data.meta.personas.find(item => item.id === opinion.persona) || {}; const card = document.createElement("article");
    card.className = `opinion-card ${persona.color || ""}`; card.innerHTML = `<div class="opinion-top"><div><span class="persona-dot"></span><p>${escapeHtml(persona.role || opinion.persona)}</p><h4>${escapeHtml(persona.name || opinion.persona)}</h4></div><b>${escapeHtml(opinion.recommendation.replaceAll("_", " "))}</b></div><p class="opinion-summary">${escapeHtml(opinion.summary)}</p><div class="evidence-group"><span>Evidence</span>${(opinion.strengths || []).slice(0,1).map(item => `<p><b>${escapeHtml(item.point)}</b><q>${escapeHtml(item.evidence)}</q></p>`).join("")}${(opinion.concerns || []).slice(0,1).map(item => `<p><b>${escapeHtml(item.point)}</b><q>${escapeHtml(item.evidence)}</q></p>`).join("")}</div><p class="confidence-small">Confidence ${opinion.confidence}%</p>`; grid.append(card);
  });
  fragment.querySelector(".debate-summary").textContent = data.debate.summary;
  const exchanges = fragment.querySelector(".exchange-list"); data.debate.exchanges.forEach(item => { const row = document.createElement("article"); row.innerHTML = `<p><b>${escapeHtml(nameFor(item.speaker, data))}</b> <span>${escapeHtml(item.position)}</span> <b>${escapeHtml(nameFor(item.responding_to, data))}</b></p><p>${escapeHtml(item.response)}</p><q>${escapeHtml(item.evidence)}</q>`; exchanges.append(row); });
  list(fragment.querySelector(".unresolved-box ul"), data.debate.unresolved); list(fragment.querySelector(".strengths-list"), decision.strengths); list(fragment.querySelector(".concerns-list"), decision.concerns);
  fragment.querySelector(".next-step").textContent = decision.next_step; const factors = fragment.querySelector(".factors"); (decision.decision_factors || []).forEach(item => { const chip = document.createElement("p"); chip.innerHTML = `<b>${escapeHtml(item.weight)} weight</b> ${escapeHtml(item.factor)} — ${escapeHtml(item.reason)}`; factors.append(chip); });
  $("#report").replaceChildren(fragment);
}

document.addEventListener("click", event => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "voice") playDebate();
  if (action === "export") exportReport();
});

function autoFillRole(text) {
  const field = $("#role");
  if (field.value.trim()) return;
  const value = detectJobRole(text);
  if (!value) return;
  field.value = value;
  field.classList.add("auto-filled");
  $("#role-autofill").textContent = "Auto-filled from Job Description · edit anytime";
  $("#role-autofill").classList.add("auto-detected");
}

function autoFillCandidateName(card, text) {
  const field = card?.querySelector(".candidate-name");
  if (!field || field.value.trim()) return;
  const value = detectCandidateName(text);
  if (!value) return;
  field.value = value;
  field.classList.add("auto-filled");
  const note = card.querySelector(".name-autofill");
  if (note) {
    note.textContent = "Auto-filled from resume · edit anytime";
    note.classList.add("auto-detected");
  }
}

function detectJobRole(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 20);
  const direct = lines.find(line => /^(job description|position|role|job title)\s*:/i.test(line));
  if (direct) {
    const value = direct.replace(/^(job description|position|role|job title)\s*:\s*/i, "").trim();
    if (value && value.length < 110) return value;
  }
  return lines.find(line => /\b(engineer|designer|manager|developer|analyst|specialist|scientist|architect|lead|director)\b/i.test(line) && line.length < 110) || "";
}

function detectCandidateName(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 12);
  return lines.find(line => {
    const value = line.replace(/[|•·]/g, " ").trim();
    const words = value.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && /^[A-Za-z][A-Za-z .'-]+$/.test(value)
      && !/(resume|curriculum|experience|skills|education|summary|profile|engineer|designer|developer|manager|analyst|email|phone)/i.test(value);
  }) || "";
}

function updateBriefStatus() {
  const candidates = [...document.querySelectorAll("[data-candidate]")]; const ready = candidates.filter(card => card.querySelector(".candidate-resume").value.trim() && card.querySelector(".candidate-transcript").value.trim()).length;
  const baseReady = $("#role").value.trim() && $("#job-description").value.trim();
  $("#brief-status").textContent = baseReady && ready === candidates.length ? `${ready} candidate${ready === 1 ? "" : "s"} ready · ${$("#hiring-count").value} opening${Number($("#hiring-count").value) === 1 ? "" : "s"}` : `${ready}/${candidates.length} candidates ready`;
}

function renumberCandidates() { document.querySelectorAll("[data-candidate]").forEach((card, index) => card.querySelector("header > span").textContent = `Candidate ${String(index + 1).padStart(2, "0")}`); }

function renderSlate(data) {
  const fragment = $("#slate-template").content.cloneNode(true), slate = data.selection;
  fragment.querySelector(".selected-count").textContent = slate.selected_candidates.length; fragment.querySelector(".slate-summary").textContent = slate.rationale; fragment.querySelector(".slate-seats strong").textContent = data.hiring_count;
  const chart = fragment.querySelector(".comparison-chart");
  (slate.comparison || []).forEach(item => { const row = document.createElement("article"); row.innerHTML = `<div><b>${escapeHtml(item.candidate_name)}</b><span>Rank #${item.rank}</span></div><div class="score-bars"><p><span>Readiness</span><i style="width:${item.readiness}%"></i><b>${item.readiness}</b></p><p><span>Role fit</span><i style="width:${item.role_fit}%"></i><b>${item.role_fit}</b></p><p class="risk"><span>Risk</span><i style="width:${item.risk}%"></i><b>${item.risk}</b></p></div><small>${escapeHtml(item.summary)}</small>`; chart.append(row); });
  const shortlist = fragment.querySelector(".shortlist-grid"); (slate.selected_candidates || []).forEach(item => { const card = document.createElement("article"); card.innerHTML = `<span>Hire-ready · rank #${item.rank}</span><h4>${escapeHtml(item.candidate_name)}</h4><p>${escapeHtml(item.rationale)}</p><b>Suggested next step</b><p>${escapeHtml(item.next_step)}</p>`; shortlist.append(card); });
  list(fragment.querySelector(".slate-risk ul"), slate.unresolved_tradeoffs); $("#report").replaceChildren(fragment);
  const verdicts = $("#report .panel-verdicts tbody"), records = $("#report .record-list");
  data.candidates.forEach(report => {
    const row = document.createElement("tr"), opinions = Object.fromEntries((report.opinions || []).map(item => [item.persona, item]));
    row.innerHTML = `<td><b>${escapeHtml(report.candidate_name)}</b><small>${escapeHtml(report.decision.role_alignment || "role fit assessed")}</small></td>${["technical", "culture", "manager", "skeptic"].map(persona => `<td>${voteMarkup(opinions[persona]?.recommendation)}</td>`).join("")}<td>${voteMarkup(report.decision.recommendation)}</td>`;
    verdicts.append(row);
    const detail = document.createElement("details"); detail.className = "interview-record";
    detail.innerHTML = `<summary><span><b>Detailed Interview Record</b><small>${escapeHtml(report.candidate_name)} · evidence, debate, and decision</small></span><i>+</i></summary><div class="record-body"><div class="record-overview"><div><p class="eyebrow">Candidate profile</p><h4>${escapeHtml(report.profile.candidate_name || report.candidate_name)}</h4><p>${escapeHtml(report.profile.headline || "")}</p></div><div><p class="eyebrow">Final chair decision</p><h4>${escapeHtml((report.decision.recommendation || "").replaceAll("_", " "))}</h4><p>${escapeHtml(report.decision.rationale || "")}</p></div></div><div class="record-opinions"><p class="eyebrow">Independent panel opinions</p>${(report.opinions || []).map(opinion => `<article><div><b>${escapeHtml(personaName(opinion.persona))}</b><span>${escapeHtml((opinion.recommendation || "").replaceAll("_", " "))} · ${escapeHtml(String(opinion.confidence || "—"))}% confidence</span></div><p>${escapeHtml(opinion.summary || "")}</p><dl><dt>Strength evidence</dt><dd>${escapeHtml(opinion.strengths?.[0]?.evidence || "No evidence recorded")}</dd><dt>Concern evidence</dt><dd>${escapeHtml(opinion.concerns?.[0]?.evidence || "No concern recorded")}</dd></dl></article>`).join("")}</div><div class="record-debate"><p class="eyebrow">Agreement &amp; disagreement in debate</p><h4>${escapeHtml(report.debate.summary || "")}</h4>${(report.debate.exchanges || []).map(item => `<article><b>${escapeHtml(personaName(item.speaker))}</b><span>${escapeHtml(item.position)}</span><b>${escapeHtml(personaName(item.responding_to))}</b><p>${escapeHtml(item.response || "")}</p><q>${escapeHtml(item.evidence || "")}</q></article>`).join("")}<div class="record-unresolved"><b>Unresolved</b><ul>${(report.debate.unresolved || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></div></div>`;
    records.append(detail);
  });
}

function personaName(id) { return { technical: "Ari Chen · Technical", culture: "Maya Patel · Culture", manager: "Jon Bell · Manager", skeptic: "Noor Khan · Skeptic" }[id] || id || "Panelist"; }
function voteMarkup(value = "") { const label = value.replaceAll("_", " ") || "not recorded"; const tone = /strong_hire|strong_yes|^hire$|^yes$/.test(value) ? "yes" : /no|do_not_hire/.test(value) ? "no" : "mixed"; return `<span class="vote ${tone}">${escapeHtml(label)}</span>`; }

function setTimeline(stage, complete = false) {
  document.querySelectorAll(".run-timeline article").forEach((item, index) => item.classList.toggle("active", complete || index <= stage));
  document.querySelectorAll(".run-timeline i").forEach((item, index) => item.classList.toggle("active", complete || index < stage));
}

function playDebate() {
  if (!latestReport || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const button = document.querySelector('[data-action="voice"]');
  const lines = latestReport.debate.exchanges.map(item => `${nameFor(item.speaker, latestReport)} says: ${item.response}`).join(" ");
  const utterance = new SpeechSynthesisUtterance(`Panel debate. ${lines}`);
  utterance.rate = .96; utterance.pitch = 1.05; utterance.onend = () => { if (button) button.textContent = "♬ Play debate"; };
  if (button) button.textContent = "■ Stop playback";
  window.speechSynthesis.speak(utterance);
}

function exportReport() {
  if (!latestReport) return;
  const d = latestReport.decision, p = latestReport.profile;
  const markdown = `# Panelroom interview record\n\n## ${p.candidate_name || "Candidate"}\n${p.headline || ""}\n\n## Final recommendation\n**${d.recommendation.replaceAll("_", " ")}** · ${d.confidence}% confidence\n\n**Role alignment:** ${d.role_alignment || "assessed"}\n${d.role_fit_summary || ""}\n\n${d.rationale}\n\n## Strengths\n${(d.strengths || []).map(item => `- ${item}`).join("\n")}\n\n## Concerns\n${(d.concerns || []).map(item => `- ${item}`).join("\n")}\n\n## Unresolved disagreement\n${(d.unresolved_disagreements || []).map(item => `- ${item}`).join("\n")}\n\n## Next step\n${d.next_step}\n\n## Panel debate\n${latestReport.debate.exchanges.map(item => `- **${nameFor(item.speaker, latestReport)}** (${item.position} ${nameFor(item.responding_to, latestReport)}): ${item.response}`).join("\n")}`;
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" })); const link = document.createElement("a");
  link.href = url; link.download = "panelroom-interview-record.md"; link.click(); URL.revokeObjectURL(url);
}

async function extractPdfText(file) {
  const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(" "));
  }
  return pages.join("\n\n");
}

function fillEvidence(node, items = [], key) { items.slice(0, 4).forEach(item => { const li = document.createElement("li"); li.innerHTML = `<b>${escapeHtml(item[key])}</b><q>${escapeHtml(item.evidence)}</q>`; node.append(li); }); }
function list(node, items = []) { (items || []).forEach(item => { const li = document.createElement("li"); li.textContent = item; node.append(li); }); }
function nameFor(id, data) { return data.meta.personas.find(item => item.id === id)?.name || id; }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

