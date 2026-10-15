import { requestCost, JobConfig } from "./config";

export function shapeRow(r: any, cfg: JobConfig, full = false) {
  const corr = r.correction ? JSON.parse(r.correction) : null;
  const known = r.input_tokens != null;
  const base = {
    pk: r.pk, id: r.message_id, channel: r.channel, message: r.message_text, messageType: r.message_type,
    status: r.status,
    intent: corr?.intent ?? r.intent, category: corr?.category ?? r.category, confidence: r.confidence, urgency: r.urgency,
    nextAction: corr?.action ?? r.final_action, corrected: !!corr,
    latencyMs: r.latency_ms, inputTokens: r.input_tokens, outputTokens: r.output_tokens,
    cost: known ? requestCost(r.input_tokens, r.output_tokens ?? 0, cfg) : null,
    billingUnknown: r.status !== "pending" && r.status !== "running" && !known && r.status !== "cancelled",
    attempts: r.attempts, error: r.error, source: r.source,
  };
  if (!full) return base;
  const j = (s: string | null) => (s ? JSON.parse(s) : null);
  return {
    ...base,
    input: { message_id: r.message_id, channel: r.channel, message_text: r.message_text, message_type: r.message_type, conversation_context: r.conversation_context, customer_type: r.customer_type },
    expected: { intent: r.expected_intent, category: r.expected_category, action: r.expected_action },
    normalized: j(r.normalized), judgments: j(r.judgments), jevAction: r.jev_action, originalIntent: r.intent, originalCategory: r.category, originalAction: r.final_action,
    policyNotes: j(r.policy_notes) ?? [], simulatedActions: j(r.simulated_actions) ?? [], correction: corr,
    rawResponse: r.raw_response, errorKind: r.error_kind, requestId: r.request_id, modelVersion: r.model_version,
    timing: { queueMs: r.queue_ms, inferenceMs: r.latency_ms, endToEndMs: r.total_ms },
    attemptLog: [] as unknown[],
  };
}

export function buildWhere(jobId: string, sp: URLSearchParams) {
  const w = ["job_id = ?"]; const a: unknown[] = [jobId];
  const eq = (col: string, key: string) => { const v = sp.get(key); if (v) { w.push(`${col} = ?`); a.push(v); } };
  eq("status", "status"); eq("channel", "channel"); eq("intent", "intent"); eq("category", "category");
  const min = sp.get("minConf"), max = sp.get("maxConf");
  if (min) { w.push("confidence >= ?"); a.push(Number(min)); }
  if (max) { w.push("confidence <= ?"); a.push(Number(max)); }
  const q = sp.get("q");
  if (q) { w.push("(message_text LIKE ? OR message_id LIKE ?)"); a.push(`%${q}%`, `%${q}%`); }
  return { where: w.join(" AND "), args: a };
}

