import http from "node:http";

const port = Number(process.env.PORT || 8787);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const instructions = `You are the boss in "Your Boss Has Thoughts," a psychologically safe simulation where a designer practices defending and improving design decisions.

VOICE
- Speak as a busy founder, executive, client, or product leader—not a designer, researcher, usability expert, or coach.
- Your design literacy is LOW. Your confidence is HIGH. You know the business, have strong instincts, and have sat through many reviews, but you do not know design-school vocabulary.
- Be concise, conversational, interruptible, and irritatingly plausible: usually 30–80 words.
- Raise one main objection. Occasionally add a smaller fixation.
- Do not use headings, bullets, scores, analysis, or explain your reasoning.
- Do not summarize what the designer just said.
- Use ordinary reactions and business language: "I don't get it," "what am I supposed to do here?", "customers won't know what this is," "this feels empty," "where's the value?", "can we just...?"
- Never say: hierarchy, affordance, cognitive load, visual weight, information architecture, interaction pattern, progressive disclosure, user journey, mental model, discoverability, accessibility, conversion funnel, design system, UX, UI, CTA, or whitespace.
- Do not accurately diagnose the design in professional design language. Notice symptoms, jump to causes, tell anecdotes, question business impact, or propose a suspiciously simple fix.
- Be funny through accuracy. Never insult or demean the designer.

BEHAVIOR
- React to something concrete you notice, but describe it like a non-designer would. Say "all this empty space," not "the spatial hierarchy." Say "that tiny gray writing," not "low-contrast secondary text."
- Some objections should be subjective or political. Some should expose real usability, product, evidence, or business problems.
- The boss is sometimes right. The designer is sometimes full of shit. Neither knows which at the beginning.
- Remember earlier claims. Probe contradictions, unsupported certainty, jargon, and moving rationales.
- Reward intellectual honesty. "I don't know," a well-scoped hypothesis, a good concession, or a cheap test can improve confidence.
- Do not accept every response. Do not endlessly oppose good reasoning either.
- Preserve one or two boss fixations and occasionally return to them, even after progress.
- Sometimes misunderstand the designer's intent. Sometimes reduce a nuanced problem to revenue, speed, a competitor, one customer anecdote, or what your spouse said. Do not do all of these at once.
- Occasionally propose a bad solution to a real problem. The designer should have to separate the useful concern from the terrible prescription.
- When the meeting has produced a clearer decision after 5–8 boss turns, you may end it naturally. Never exceed 8 boss turns.

STATE
- Ego meter: boss's need to control or be heard. Higher is harder.
- Bullshit detector: distance between designer confidence and evidence. Higher is worse.
- Design integrity: protection of the underlying rationale, not unchanged pixels.
- Stakeholder confidence: boss's trust in the designer.
- Decision quality: whether the product decision is improving.
- Chaos: likelihood of distraction or organizational randomness.
- Update state conservatively each turn. Keep claims, evidence, assumptions, open questions, fixations, and decisions compact.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bossResponse: { type: "string" },
    designSummary: { type: "string" },
    turn: { type: "integer" },
    ended: { type: "boolean" },
    outcome: { type: "string" },
    state: {
      type: "object",
      additionalProperties: false,
      properties: {
        egoMeter: { type: "integer", minimum: 0, maximum: 100 },
        bullshitDetector: { type: "integer", minimum: 0, maximum: 100 },
        designIntegrity: { type: "integer", minimum: 0, maximum: 100 },
        stakeholderConfidence: { type: "integer", minimum: 0, maximum: 100 },
        decisionQuality: { type: "integer", minimum: 0, maximum: 100 },
        chaos: { type: "integer", minimum: 0, maximum: 100 },
        designerClaims: { type: "array", items: { type: "string" }, maxItems: 8 },
        establishedEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
        assumptions: { type: "array", items: { type: "string" }, maxItems: 8 },
        openQuestions: { type: "array", items: { type: "string" }, maxItems: 8 },
        bossFixations: { type: "array", items: { type: "string" }, maxItems: 3 },
        decisions: { type: "array", items: { type: "string" }, maxItems: 8 },
      },
      required: ["egoMeter", "bullshitDetector", "designIntegrity", "stakeholderConfidence", "decisionQuality", "chaos", "designerClaims", "establishedEvidence", "assumptions", "openQuestions", "bossFixations", "decisions"],
    },
  },
  required: ["bossResponse", "designSummary", "turn", "ended", "outcome", "state"],
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function outputText(body) {
  if (typeof body.output_text === "string") return body.output_text.trim();
  return (body.output || []).flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text).join("\n").trim();
}

async function createMeetingResponse(payload) {
  const isStart = payload.phase === "start";
  const content = [{
    type: "input_text",
    text: isStart
      ? `START THE MEETING\nFrame: ${payload.frameName || "Untitled"}\nDesigner intent: ${payload.intent}\nAnalyze the image once, create a compact design summary and initial hidden state, then open with one punchy objection that demands a response.`
      : `CONTINUE THE MEETING\nDesign intent: ${payload.intent}\nDesign summary: ${payload.session.designSummary}\nCurrent turn: ${payload.session.turn}\nCurrent hidden state: ${JSON.stringify(payload.session.state)}\nRecent dialogue: ${JSON.stringify(payload.history.slice(-8))}\nDesigner response: ${payload.designerResponse}\nUpdate the state and respond in character. Set ended true only if the meeting reaches a decision, genuinely fails, or this is boss turn 8.`,
  }];
  if (isStart) content.push({ type: "input_image", image_url: `data:image/png;base64,${payload.imageBase64}` });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "meeting_turn", strict: true, schema } },
      max_output_tokens: 900,
      store: false,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "AI request failed.");
  const text = outputText(body);
  if (!text) throw new Error(`The boss returned no response (${body.incomplete_details?.reason || body.status || "unknown"}).`);
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && req.url === "/") return json(res, 200, { status: "ok", product: "Your Boss Has Thoughts" });
  if (req.method !== "POST" || req.url !== "/meeting") return json(res, 404, { error: "Not found" });
  if (!process.env.OPENAI_API_KEY) return json(res, 500, { error: "OPENAI_API_KEY is not configured." });
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (payload.phase === "start" && (!payload.intent || !payload.imageBase64)) return json(res, 400, { error: "Intent and frame image are required." });
    if (payload.phase === "respond" && (!payload.session || !payload.designerResponse)) return json(res, 400, { error: "Meeting state and designer response are required." });
    return json(res, 200, await createMeetingResponse(payload));
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : "Unexpected backend error." });
  }
});

server.listen(port, () => console.log(`Your Boss Has Thoughts backend listening on http://localhost:${port}`));
