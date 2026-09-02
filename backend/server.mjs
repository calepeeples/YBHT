import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { normalizeMeetingScores } from "./score-scale.mjs";

const port = Number(process.env.PORT || 8787);
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const testerCode = process.env.TESTER_CODE || "";
const metricsAdminKey = process.env.METRICS_ADMIN_KEY || "";
const rateLimitPerHour = Math.max(1, Number(process.env.RATE_LIMIT_PER_HOUR || 30));
const maxBodyBytes = 15 * 1024 * 1024;
const rateBuckets = new Map();
const metricsPool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 3,
}) : null;
const clientMetricEvents = new Set(["report_copied", "report_placed", "review_another"]);
let metricsReady;

async function prepareMetrics() {
  if (!metricsPool) return false;
  if (!metricsReady) metricsReady = metricsPool.query(`
      CREATE TABLE IF NOT EXISTS daily_metrics (
        metric_date date NOT NULL,
        event_name text NOT NULL,
        event_count bigint NOT NULL DEFAULT 0,
        value_sum bigint NOT NULL DEFAULT 0,
        PRIMARY KEY (metric_date, event_name)
      )
    `).then(() => metricsPool.query("DELETE FROM daily_metrics WHERE metric_date < CURRENT_DATE - 90"))
    .then(() => true).catch((error) => {
    console.error("Aggregate metrics unavailable:", error.message);
    metricsReady = undefined;
    return false;
  });
  return metricsReady;
}

async function recordMetric(eventName, value = 0) {
  if (!await prepareMetrics()) return;
  try {
    await metricsPool.query(`
      INSERT INTO daily_metrics (metric_date, event_name, event_count, value_sum)
      VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, $1, 1, $2)
      ON CONFLICT (metric_date, event_name)
      DO UPDATE SET event_count = daily_metrics.event_count + 1,
                    value_sum = daily_metrics.value_sum + EXCLUDED.value_sum
    `, [eventName, Number.isSafeInteger(value) ? value : 0]);
  } catch (error) {
    console.error("Aggregate metric was skipped:", error.message);
  }
}

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
- Every numeric state score uses a 0–100 whole-number scale. Never use a 0–10 scale.
- Treat 50 as a meaningful middle, not failure. Scores below 20 or above 90 should be rare and require strong evidence from the meeting.
- Ego meter: boss's need to control or be heard. Higher is harder.
- Bullshit detector: distance between designer confidence and evidence. Higher is worse.
- Design integrity: protection of the underlying rationale, not unchanged pixels. 90–100 means the rationale was protected and strengthened; 70–89 means it survived with reasonable compromises; 50–69 means it was weakened or remains unsupported; 25–49 means important decisions were conceded without evidence; 0–24 means the direction is mostly arbitrary or political. A justified design change can increase integrity.
- Stakeholder confidence: boss's trust in the designer.
- Decision quality: whether the product decision is improving.
- Chaos: likelihood of distraction or organizational randomness.
- Update state conservatively each turn. Keep claims, evidence, assumptions, open questions, fixations, and decisions compact.

REPORT
- Preserve initialState exactly after the first turn so the meeting can show meaningful before-and-after movement.
- Before the meeting ends, keep every report text field empty.
- When ended is true, complete the report. SURVIVED means the designer preserved enough trust and momentum to reach a better next decision; it does not mean the original pixels won.
- Make the final report perceptive, compact, and slightly funny. Credit the boss if the boss contributed a legitimately useful idea. Preserve one unresolved fixation for the closing joke.`;

const scoreProperty = (description) => ({ type: "integer", minimum: 0, maximum: 100, description: `${description} Use the 0–100 scale, never 0–10.` });
const stateProperties = {
  egoMeter: scoreProperty("Boss's need to control or be heard; higher is harder."),
  bullshitDetector: scoreProperty("Distance between designer confidence and evidence; higher is worse."),
  designIntegrity: scoreProperty("Protection of the underlying design rationale, not unchanged pixels."),
  stakeholderConfidence: scoreProperty("Boss's trust in the designer."),
  decisionQuality: scoreProperty("Whether the product decision is improving."),
  chaos: scoreProperty("Likelihood of distraction or organizational randomness."),
  designerClaims: { type: "array", items: { type: "string" }, maxItems: 8 },
  establishedEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
  assumptions: { type: "array", items: { type: "string" }, maxItems: 8 },
  openQuestions: { type: "array", items: { type: "string" }, maxItems: 8 },
  bossFixations: { type: "array", items: { type: "string" }, maxItems: 3 },
  decisions: { type: "array", items: { type: "string" }, maxItems: 8 },
};
const stateRequired = ["egoMeter", "bullshitDetector", "designIntegrity", "stakeholderConfidence", "decisionQuality", "chaos", "designerClaims", "establishedEvidence", "assumptions", "openQuestions", "bossFixations", "decisions"];
const stateSchema = { type: "object", additionalProperties: false, properties: stateProperties, required: stateRequired };

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bossResponse: { type: "string" },
    designSummary: { type: "string" },
    turn: { type: "integer" },
    ended: { type: "boolean" },
    outcome: { type: "string" },
    initialState: stateSchema,
    state: stateSchema,
    report: {
      type: "object",
      additionalProperties: false,
      properties: {
        survived: { type: "boolean" },
        outcome: { type: "string" },
        designChanged: { type: "string" },
        thinkingChanged: { type: "string" },
        momentumPreserved: { type: "string" },
        bossContribution: { type: "string" },
        unresolvedConcern: { type: "string" },
        summary: { type: "string" },
        closingLine: { type: "string" },
      },
      required: ["survived", "outcome", "designChanged", "thinkingChanged", "momentumPreserved", "bossContribution", "unresolvedConcern", "summary", "closingLine"],
    },
  },
  required: ["bossResponse", "designSummary", "turn", "ended", "outcome", "initialState", "state", "report"],
};

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-tester-code, x-metrics-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function sameSecret(received, expected) {
  const a = Buffer.from(received || "");
  const b = Buffer.from(expected || "");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function clientAddress(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0].trim();
}

function checkRateLimit(req) {
  const now = Date.now();
  const key = createHash("sha256")
    .update(`${clientAddress(req)}:${req.headers["x-tester-code"] || "local"}`)
    .digest("hex");
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= rateLimitPerHour) return false;
  current.count += 1;
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("The selected frame is too large. Try a smaller frame or export area.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.intent !== "string" || payload.intent.length < 1 || payload.intent.length > 2000) return false;
  if (payload.phase === "start") return typeof payload.imageBase64 === "string" && payload.imageBase64.length > 0;
  if (payload.phase === "respond") {
    return payload.session && typeof payload.session === "object" &&
      typeof payload.designerResponse === "string" && payload.designerResponse.length > 0 && payload.designerResponse.length <= 2000 &&
      Array.isArray(payload.history) && payload.history.length <= 20;
  }
  return false;
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
      ? `START THE MEETING\nFrame: ${payload.frameName || "Untitled"}\nDesigner intent: ${payload.intent}\nAnalyze the image once, create a compact design summary and hidden state, copy that state exactly into initialState, then open with one punchy objection that demands a response. The report is blank because the meeting has not ended.`
      : `CONTINUE THE MEETING\nDesign intent: ${payload.intent}\nDesign summary: ${payload.session.designSummary}\nInitial hidden state (preserve exactly): ${JSON.stringify(payload.session.initialState)}\nCurrent turn: ${payload.session.turn}\nCurrent hidden state: ${JSON.stringify(payload.session.state)}\nRecent dialogue: ${JSON.stringify(payload.history.slice(-8))}\nDesigner response: ${payload.designerResponse}\nUpdate the current state and respond in character. Set ended true only if the meeting reaches a decision, genuinely fails, or this is boss turn 8. When ended is true, complete the final report.`,
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
      max_output_tokens: 2200,
      store: false,
      safety_identifier: payload.safetyIdentifier,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "AI request failed.");
  const text = outputText(body);
  if (!text) throw new Error(`The boss returned no response (${body.incomplete_details?.reason || body.status || "unknown"}).`);
  if (body.status === "incomplete") {
    throw new Error("The boss got cut off mid-thought. Try that response again.");
  }
  try {
    const meeting = JSON.parse(text);
    if (normalizeMeetingScores(meeting)) void recordMetric("score_scale_normalized");
    return meeting;
  } catch {
    throw new Error("The boss's response arrived incomplete. Try that response again.");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && req.url === "/") return json(res, 200, { status: "ok", product: "Your Boss Has Thoughts", version: "anonymous-metrics-v1", storage: metricsPool ? "daily aggregate counters only" : "none" });
  if (req.method === "GET" && req.url === "/metrics") {
    if (!metricsAdminKey || !sameSecret(req.headers["x-metrics-key"], metricsAdminKey)) return json(res, 401, { error: "Not authorized." });
    if (!await prepareMetrics()) return json(res, 503, { error: "Aggregate metrics are not configured." });
    try {
      const result = await metricsPool.query("SELECT metric_date, event_name, event_count, value_sum FROM daily_metrics WHERE metric_date >= CURRENT_DATE - 30 ORDER BY metric_date DESC, event_name");
      return json(res, 200, { privacy: "Daily aggregate counters only; no event-level or user-level records.", metrics: result.rows });
    } catch {
      return json(res, 503, { error: "Aggregate metrics are temporarily unavailable." });
    }
  }
  if (req.method === "POST" && req.url === "/metrics") {
    if (testerCode && !sameSecret(req.headers["x-tester-code"], testerCode)) return json(res, 401, { error: "That tester access code is not valid." });
    try {
      const payload = await readJsonBody(req);
      if (!clientMetricEvents.has(payload?.event)) return json(res, 400, { error: "Unknown metric." });
      void recordMetric(payload.event);
      return json(res, 202, { accepted: true });
    } catch {
      return json(res, 400, { error: "Invalid metric." });
    }
  }
  if (req.method !== "POST" || req.url !== "/meeting") return json(res, 404, { error: "Not found" });
  if (!process.env.OPENAI_API_KEY) return json(res, 500, { error: "OPENAI_API_KEY is not configured." });
  if (testerCode && !sameSecret(req.headers["x-tester-code"], testerCode)) return json(res, 401, { error: "That tester access code is not valid." });
  if (!checkRateLimit(req)) {
    void recordMetric("rate_limited");
    return json(res, 429, { error: "This test has reached its hourly meeting limit. Try again later." });
  }
  try {
    const payload = await readJsonBody(req);
    if (!validPayload(payload)) {
      void recordMetric("invalid_request");
      return json(res, 400, { error: "The meeting request is invalid or too long." });
    }
    if (payload.phase === "start") void recordMetric("meeting_started");
    payload.safetyIdentifier = createHash("sha256")
      .update(`${clientAddress(req)}:${req.headers["x-tester-code"] || "local"}`)
      .digest("hex").slice(0, 64);
    const meeting = await createMeetingResponse(payload);
    if (meeting.ended) {
      void recordMetric("meeting_completed", meeting.turn);
      if (meeting.report?.survived) void recordMetric("meeting_survived");
    }
    return json(res, 200, meeting);
  } catch (error) {
    void recordMetric("meeting_error");
    return json(res, error?.status || 500, { error: error instanceof Error ? error.message : "Unexpected backend error." });
  }
});

server.listen(port, () => console.log(`Your Boss Has Thoughts backend listening on http://localhost:${port}`));
