import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

let server: http.Server;
let mode: "ok" | "429" | "529" | "422" | "slow" | "html" = "ok";
let lastReq: { url?: string; auth?: string; body?: any } = {};

const answers = {
  primary_intent: { type: "choice", choice: "Complaint", probabilities: { Complaint: 0.9, Inquiry: 0.1 }, confidence: 0.9 },
  sales_opportunity: { type: "noul", noul: 0.05 },
  complaint_indicator: { type: "noul", noul: 0.95 },
  urgency: { type: "score", score: 2.8, legend: { "1": "Routine" }, probabilities: { "1": 0.05, "2": 0.15, "3": 0.7, "4": 0.1 }, confidence: 0.7 },
};

test.before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastReq = { url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined };
      if (mode === "429") { res.writeHead(429, { "retry-after": "2" }); return res.end("slow down"); }
      if (mode === "529") { res.writeHead(529); return res.end("overloaded"); }
      if (mode === "422") { res.writeHead(422); return res.end('{"error":"missing field"}'); }
      if (mode === "html") { res.writeHead(200); return res.end("<html>"); }
      if (mode === "slow") return;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 321, output_tokens: 0 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.JEV_API_KEY = "test-key";
  process.env.JEV_MODE = "live";
  process.env.JEV_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.after(() => server.close());

const call = async () => {
  const { callJev, buildRequest } = await import("../src/lib/jev/client");
  return callJev(buildRequest("jev-latest", { message: "halo", channel: "WhatsApp" }), 500);
};

test("request matches the TypeSafe contract", async () => {
  mode = "ok";
  await call();
  assert.equal(lastReq.url, "/v1/systemone");
  assert.equal(lastReq.auth, "Bearer test-key");
  const b = lastReq.body;
  assert.deepEqual(Object.keys(b).sort(), ["model", "questions", "state"]);
  assert.equal(b.model, "jev-latest");
  assert.deepEqual(b.state, { message: "halo", channel: "WhatsApp" });
  for (const [k, q] of Object.entries<any>(b.questions)) {
    assert.ok(["noul", "choice", "score"].includes(q.type), k);
    assert.ok(typeof q.instructions === "string" && q.instructions.length > 0, k);
    if (q.type === "choice") assert.ok(q.criteria && Object.keys(q.criteria).length >= 2 && Object.keys(q.criteria).length <= 255, k);
    if (q.type === "score") assert.ok(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10, k);
  }
  assert.equal(b.questions.urgency.criteria.length, 4);
});

test("answers are normalized and usage is real", async () => {
  mode = "ok";
  const r = await call();
  assert.equal(r.source, "live");
  assert.equal(r.response.usage?.input_tokens, 321);
  assert.equal(r.response.judgments.primary_intent.value, "Complaint");
  assert.equal(r.response.judgments.primary_intent.confidence, 0.9);
  assert.equal(r.response.judgments.complaint_indicator.probability, 0.95);
  assert.equal(r.response.judgments.urgency.value, "High");
});

test("429 and 529 are retryable, 422 is not", async () => {
  mode = "429";
  await assert.rejects(call, (e: any) => e.kind === "rate_limit" && e.retryable && e.retryAfterMs === 2000);
  mode = "529";
  await assert.rejects(call, (e: any) => e.status === 529 && e.retryable);
  mode = "422";
  await assert.rejects(call, (e: any) => e.status === 422 && !e.retryable);
});

test("malformed body is not retryable", async () => {
  mode = "html";
  await assert.rejects(call, (e: any) => e.kind === "parse" && !e.retryable);
});

test("timeout is retryable", async () => {
  mode = "slow";
  await assert.rejects(call, (e: any) => e.kind === "timeout" && e.retryable);
});
