import { JobConfig, requestCost } from "./config";
import { db } from "./db";
import { getJob } from "./jobs";
import { classMetrics, percentile, sortAsc } from "./stats";

const BUCKET_MS = 5000;
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function lat(values: number[]) {
  const s = sortAsc(values);
  return { n: s.length, avg: avg(s), p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s.length ? s[s.length - 1] : null };
}

export function computeMetrics(jobId: string) {
  const job = getJob(jobId);
  if (!job) return null;
  const d = db();
  const cfg: JobConfig = job.config;
  const now = Date.now();

  const counts = Object.fromEntries(
    (d.prepare("SELECT status, COUNT(*) c FROM rows WHERE job_id = ? GROUP BY status").all(jobId) as { status: string; c: number }[]).map((r) => [r.status, r.c]),
  ) as Record<string, number>;
  const get = (k: string) => counts[k] ?? 0;
  const total = Object.values(counts).reduce((s, x) => s + x, 0);
  const terminal = get("success") + get("failed") + get("cancelled");

  const ok = d.prepare(`SELECT message_id, channel, intent, category, final_action, jev_action, confidence, expected_intent, expected_category, expected_action,
    latency_ms, queue_ms, total_ms, input_tokens, output_tokens, finished_at, correction FROM rows WHERE job_id = ? AND status = 'success'`).all(jobId) as any[];
  const failedRows = d.prepare("SELECT input_tokens FROM rows WHERE job_id = ? AND status = 'failed'").all(jobId) as any[];

  const activeMs = job.active_ms + (job.resumed_at ? now - job.resumed_at : 0);
  const elapsedSec = activeMs / 1000;

  // Throughput
  const recent = ok.filter((r) => r.finished_at > now - 10_000).length;
  const win = Math.min(10, Math.max(1, elapsedSec));
  const currentThroughput = job.status === "running" ? recent / win : 0;
  const effectiveThroughput = elapsedSec > 0 ? ok.length / elapsedSec : 0;

  // Tokens & cost (rows without reported usage are billing-unknown, never zero)
  const billed = ok.filter((r) => r.input_tokens != null);
  const inTok = billed.reduce((s, r) => s + r.input_tokens, 0);
  const outTok = billed.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
  const cost = requestCost(inTok, outTok, cfg);
  const unknownBilling = ok.length - billed.length + failedRows.length;
  const avgCost = billed.length ? cost / billed.length : null;

  // Time series
  const t0 = job.started_at ?? now;
  const buckets = new Map<number, { n: number; lat: number[]; cost: number }>();
  for (const r of ok) {
    const b = Math.floor((r.finished_at - t0) / BUCKET_MS);
    const e = buckets.get(b) ?? { n: 0, lat: [], cost: 0 };
    e.n++; e.lat.push(r.latency_ms);
    if (r.input_tokens != null) e.cost += requestCost(r.input_tokens, r.output_tokens ?? 0, cfg);
    buckets.set(b, e);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  let cum = 0;
  const series = keys.length
    ? Array.from({ length: keys[keys.length - 1] - keys[0] + 1 }, (_, i) => {
        const k = keys[0] + i;
        const e = buckets.get(k);
        cum += e?.cost ?? 0;
        return { t: k * BUCKET_MS / 1000, rps: (e?.n ?? 0) / (BUCKET_MS / 1000), avgLatency: e ? avg(e.lat) : null, cumCost: cum };
      }).slice(-120)
    : [];

  // Distributions & breakdowns
  const tally = (key: (r: any) => string | null) => {
    const m: Record<string, number> = {};
    ok.forEach((r) => { const k = key(r); if (k) m[k] = (m[k] ?? 0) + 1; });
    return m;
  };
  const breakdown = (key: (r: any) => string | null) => {
    const m: Record<string, { n: number; inTok: number; outTok: number; cost: number }> = {};
    billed.forEach((r) => {
      const k = key(r) ?? "—";
      const e = (m[k] ??= { n: 0, inTok: 0, outTok: 0, cost: 0 });
      e.n++; e.inTok += r.input_tokens; e.outTok += r.output_tokens ?? 0;
    });
    Object.values(m).forEach((e) => (e.cost = requestCost(e.inTok, e.outTok, cfg)));
    return m;
  };

  // Attempts / errors
  const att = d.prepare("SELECT COUNT(*) n, SUM(ok) ok FROM attempts WHERE job_id = ?").get(jobId) as { n: number; ok: number | null };
  const errKinds = d.prepare("SELECT error_kind k, COUNT(*) c FROM rows WHERE job_id = ? AND status='failed' GROUP BY error_kind").all(jobId) as any[];
  const retriedRows = (d.prepare("SELECT COUNT(*) c FROM rows WHERE job_id = ? AND attempts > 1").get(jobId) as { c: number }).c;

  // Evaluation against ground truth
  const pairs = (exp: (r: any) => string | null, act: (r: any) => string | null) =>
    ok.filter((r) => exp(r)).map((r) => ({ expected: lc(exp(r)), actual: lc(act(r)) }));
  const intentPairs = pairs((r) => r.expected_intent, (r) => r.intent);
  const catPairs = pairs((r) => r.expected_category, (r) => r.category);
  const actionPairs = pairs((r) => r.expected_action, (r) => r.final_action);
  const complaintTruth = intentPairs.filter((p) => p.expected === "complaint");
  const securityTruth = actionPairs.filter((p) => p.expected === "security escalation");
  const routedOk = ok.filter((r) => r.expected_action && lc(r.expected_action) === lc(r.final_action) && lc(r.final_action) !== "human review").length;
  const withAction = ok.filter((r) => r.expected_action).length;
  const humanReview = ok.filter((r) => r.final_action === "Human Review").length;

  const proj = (n: number) => (avgCost === null ? null : avgCost * n);

  return {
    job: { id: job.id, name: job.name, mode: job.mode, status: job.status, config: cfg, catalogVersion: job.catalog_version, createdAt: job.created_at, startedAt: job.started_at, finishedAt: job.finished_at, estInputTokens: job.est_input_tokens },
    counts: { total, pending: get("pending"), running: get("running"), success: get("success"), failed: get("failed"), cancelled: get("cancelled"), terminal },
    completionPct: total ? (terminal / total) * 100 : 0,
    elapsedSec,
    latency: lat(ok.map((r) => r.latency_ms)),
    queueWait: lat(ok.map((r) => r.queue_ms ?? 0)),
    endToEnd: lat(ok.map((r) => r.total_ms)),
    throughput: { current: currentThroughput, effective: effectiveThroughput },
    tokens: { input: inTok, output: outTok, avgPerMessage: billed.length ? inTok / billed.length : null },
    cost: {
      total: cost, avgPerMessage: avgCost, per1k: avgCost === null ? null : avgCost * 1000,
      estimatedBeforeRun: (job.est_input_tokens / 1e6) * cfg.inputPricePerM,
      unknownBilling, projections: { "10K": proj(10_000), "100K": proj(100_000), "1M": proj(1_000_000) },
      rate: { input: cfg.inputPricePerM, output: cfg.outputPricePerM, updatedAt: cfg.pricingUpdatedAt, currency: "USD" },
      byChannel: breakdown((r) => r.channel), byIntent: breakdown((r) => r.intent), byCategory: breakdown((r) => r.category),
    },
    series,
    distributions: { intent: tally((r) => r.intent), category: tally((r) => (r.category && r.category !== "None" ? r.category : null)), action: tally((r) => r.final_action) },
    reliability: {
      attempts: att.n, failedAttempts: att.n - (att.ok ?? 0),
      errorRate: att.n ? (att.n - (att.ok ?? 0)) / att.n : 0,
      retriedRows, retryRate: total ? retriedRows / total : 0, errorKinds: Object.fromEntries(errKinds.map((e) => [e.k, e.c])),
    },
    evaluation: {
      hasGroundTruth: intentPairs.length + catPairs.length + actionPairs.length > 0,
      intent: classMetrics(intentPairs), category: classMetrics(catPairs), action: classMetrics(actionPairs),
      complaintRecall: complaintTruth.length ? complaintTruth.filter((p) => p.actual === "complaint").length / complaintTruth.length : null,
      complaintSupport: complaintTruth.length,
      securityRecall: securityTruth.length ? securityTruth.filter((p) => p.actual === "security escalation").length / securityTruth.length : null,
      securitySupport: securityTruth.length,
      routingAgreement: withAction ? actionPairs.filter((p) => p.expected === p.actual).length / actionPairs.length : null,
      routedCorrectlyNoReview: withAction ? routedOk / withAction : null,
      humanReviewRate: ok.length ? humanReview / ok.length : null,
      overrides: ok.filter((r) => r.correction).length,
    },
  };
}
