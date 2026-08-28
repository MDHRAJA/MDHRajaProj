const $ = selector => document.querySelector(selector);
const sample = {
  role: "Senior Product Designer",
  resume: `Alex Morgan\nProduct Designer | 7 years experience\n\nExperience\n• Lead Product Designer, Orbit Health (2021–present): Led the redesign of a clinician workflow used by 12,000 care providers. Partnered with engineering and research; reduced task completion time by 28%.\n• Product Designer, Ledgerline (2018–2021): Shipped invoicing and payment flows for small businesses.\n\nSkills\nFigma, prototyping, user research, design systems, accessibility, product strategy.\n\nEducation\nBDes, Interaction Design, 2018.`,
  transcript: `Interviewer: Tell me about the clinician workflow redesign.\nAlex: I led the project from discovery through launch. I ran six usability sessions, mapped the critical path with the PM, and worked with two engineers on a phased release. The old flow took about eight minutes; after launch it averaged just under six.\n\nInterviewer: What was difficult?\nAlex: Our first prototype assumed clinicians would review alerts one at a time. Testing showed that was wrong, so I pushed to change the information hierarchy. I was initially defensive because it meant reworking the system, but I documented the findings and brought engineering into the next sessions.\n\nInterviewer: How do you measure design quality?\nAlex: I look for successful completion, error rate, and whether people can explain why they made a choice. I use qualitative signals alongside product data.\n\nInterviewer: You list design systems. What did you own?\nAlex: I maintained the component inventory and wrote contribution guidance. I did not build the front-end components myself, but I paired with engineering on tokens and accessibility states.\n\nInterviewer: Why this role?\nAlex: I want a role where I can work on ambiguous workflows and coach designers while staying close to research.`
};

const stageCopy = ["Building the shared evidence file…", "Four panelists are reviewing independently…", "Opening the evidence-based debate…", "The hiring chair is weighing the record…"];

$("#load-sample").addEventListener("click", () => {
  $("#role").value = sample.role; $("#resume").value = sample.resume; $("#transcript").value = sample.transcript;
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelectorAll(".file-input").forEach(input => input.addEventListener("change", async event => {
  const file = event.target.files?.[0]; if (file) $("#" + event.target.dataset.target).value = await file.text();
}));

$("#run-panel").addEventListener("click", async () => {
  const payload = { role: $("#role").value.trim(), resume: $("#resume").value.trim(), transcript: $("#transcript").value.trim() };
  if (!payload.role || !payload.resume || !payload.transcript) { alert("Add the target role, resume, and interview transcript first."); return; }
  const results = $("#results"), button = $("#run-panel"), status = $("#status");
  results.classList.remove("hidden"); results.scrollIntoView({ behavior: "smooth", block: "start" }); button.disabled = true; $("#report").innerHTML = "";
  let stage = 0; status.innerHTML = `<span class="pulse"></span><span>${stageCopy[stage]}</span>`;
  const timer = setInterval(() => { stage = Math.min(stage + 1, stageCopy.length - 1); status.innerHTML = `<span class="pulse"></span><span>${stageCopy[stage]}</span>`; }, 5000);
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "The panel could not complete this review.");
    renderReport(data); status.classList.add("complete"); status.innerHTML = `<span>✓</span><span>Panel completed. Independent reviews, debate, and decision are recorded below.</span>`;
  } catch (error) { status.classList.add("error"); status.innerHTML = `<span>!</span><span>${escapeHtml(error.message)}</span>`; }
  finally { clearInterval(timer); button.disabled = false; }
});

function renderReport(data) {
  const fragment = $("#report-template").content.cloneNode(true), decision = data.decision, profile = data.profile;
  const label = decision.recommendation.replaceAll("_", " ");
  fragment.querySelector(".decision-label").textContent = label; fragment.querySelector(".decision-rationale").textContent = decision.rationale;
  fragment.querySelector(".confidence strong").textContent = `${decision.confidence}%`; fragment.querySelector(".confidence i").style.width = `${decision.confidence}%`;
  fragment.querySelector(".candidate-name").textContent = profile.candidate_name || "Candidate"; fragment.querySelector(".headline").textContent = profile.headline || "Evidence profile";
  fillEvidence(fragment.querySelector(".skills-list"), profile.skills, "name"); fillEvidence(fragment.querySelector(".claims-list"), profile.claims, "claim");
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

function fillEvidence(node, items = [], key) { items.slice(0, 4).forEach(item => { const li = document.createElement("li"); li.innerHTML = `<b>${escapeHtml(item[key])}</b><q>${escapeHtml(item.evidence)}</q>`; node.append(li); }); }
function list(node, items = []) { (items || []).forEach(item => { const li = document.createElement("li"); li.textContent = item; node.append(li); }); }
function nameFor(id, data) { return data.meta.personas.find(item => item.id === id)?.name || id; }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

