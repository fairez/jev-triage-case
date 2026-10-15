import { randomUUID } from "node:crypto";
import { buildRequest, callJev } from "./jev/client";
import { JevError } from "./jev/types";
import { normalizeState } from "./normalize";
import { applyPolicy } from "./policy";
import { db } from "./db";
import { getJob } from "./jobs";

interface Runtime {
  active: boolean;        // claiming new rows
  inFlight: number;
  cooldownUntil: number;  // shared rate-limit cooldown
  wake?: NodeJS.Timeout;
}
const g = globalThis as unknown as { __jevRt?: Map<string, Runtime>; __jevRecovered?: boolean };
const runtimes = (g.__jevRt ??= new Map());

function rt(id: string): Runtime {
  let r = runtimes.get(id);
  if (!r) runtimes.set(id, (r = { active: false, inFlight: 0, cooldownUntil: 0 }));
  return r;
}

// After a process restart nothing is actually running: park interrupted jobs as paused.
export function recover() {
  if (g.__jevRecovered) return;
  g.__jevRecovered = true;
  const d = db();
  d.prepare("UPDATE rows SET status = 'pending', started_at = NULL WHERE status = 'running'").run();
  d.prepare("UPDATE jobs SET status = 'paused', resumed_at = NULL, active_ms = active_ms WHERE status = 'running'").run();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function closeActiveWindow(jobId: string) {
  const now = Date.now();
  db().prepare("UPDATE jobs SET active_ms = active_ms + (? - resumed_at), resumed_at = NULL WHERE id = ? AND resumed_at IS NOT NULL").run(now, jobId);
}

export function control(jobId: string, action: string, rowPk?: number) {
  recover();
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  const d = db();
  const now = Date.now();
  const r = rt(jobId);

  switch (action) {
    case "start":
    case "resume": {
      if (job.status === "completed") return;
      if (job.status === "draft") {
        d.prepare("UPDATE rows SET enqueued_at = ? WHERE job_id = ? AND status = 'pending'").run(now, jobId);
        d.prepare("UPDATE jobs SET started_at = ? WHERE id = ?").run(now, jobId);
      }
      d.prepare("UPDATE jobs SET status = 'running', resumed_at = ?, finished_at = NULL WHERE id = ?").run(now, jobId);
      r.active = true;
      pump(jobId);
      return;
    }
    case "pause": {
      r.active = false;
      closeActiveWindow(jobId);
      d.prepare("UPDATE jobs SET status = 'paused' WHERE id = ? AND status = 'running'").run(jobId);
      return;
    }
    case "stop": {
      r.active = false;
      closeActiveWindow(jobId);
      d.prepare("UPDATE rows SET status = 'cancelled', error = 'Stopped by user', error_kind = 'cancelled' WHERE job_id = ? AND status = 'pending'").run(jobId);
      d.prepare("UPDATE jobs SET status = 'stopped', finished_at = ? WHERE id = ?").run(now, jobId);
      return;
    }
    case "retry_failed": {
      d.prepare(`UPDATE rows SET status = 'pending', error = NULL, error_kind = NULL, enqueued_at = ?, attempts = 0
        WHERE job_id = ? AND status IN ('failed','cancelled')`).run(now, jobId);
      reopen(jobId);
      return;
    }
    case "retry_row": {
      d.prepare(`UPDATE rows SET status = 'pending', error = NULL, error_kind = NULL, enqueued_at = ?, attempts = 0
        WHERE job_id = ? AND pk = ? AND status IN ('failed','cancelled')`).run(now, jobId, rowPk);
      reopen(jobId);
      return;
    }
    default:
      throw new Error(`Unknown action ${action}`);
  }
}

// Make retried rows runnable: a finished/stopped job goes back to running.
function reopen(jobId: string) {
  const job = getJob(jobId)!;
  if (job.status === "completed" || job.status === "stopped") {
    db().prepare("UPDATE jobs SET status = 'running', resumed_at = ?, finished_at = NULL WHERE id = ?").run(Date.now(), jobId);
    rt(jobId).active = true;
  }
  if (job.status !== "paused" && job.status !== "draft") pump(jobId);
}

function pump(jobId: string) {
  const r = rt(jobId);
  if (!r.active) return;
  const job = getJob(jobId);
  if (!job) return;
  const d = db();

  const wait = r.cooldownUntil - Date.now();
  if (wait > 0) {
    clearTimeout(r.wake);
    r.wake = setTimeout(() => pump(jobId), wait + 5);
    return;
  }

  while (r.active && r.inFlight < job.config.concurrency) {
    const next = d.prepare("SELECT pk FROM rows WHERE job_id = ? AND status = 'pending' ORDER BY seq LIMIT 1").get(jobId) as { pk: number } | undefined;
    if (!next) break;
    d.prepare("UPDATE rows SET status = 'running', started_at = ? WHERE pk = ?").run(Date.now(), next.pk);
    r.inFlight++;
    processRow(jobId, next.pk)
      .catch((e) => console.error("worker crashed", e))
      .finally(() => {
        r.inFlight--;
        pump(jobId);
      });
  }

  if (r.inFlight === 0) {
    const left = d.prepare("SELECT COUNT(*) c FROM rows WHERE job_id = ? AND status IN ('pending','running')").get(jobId) as { c: number };
    if (left.c === 0 && r.active) {
      r.active = false;
      closeActiveWindow(jobId);
      d.prepare("UPDATE jobs SET status = 'completed', finished_at = ? WHERE id = ?").run(Date.now(), jobId);
    }
  }
}

function backoffMs(attempt: number, err: JevError) {
  const exp = Math.min(30_000, 500 * 2 ** attempt);
  const jittered = exp * (0.5 + Math.random() * 0.5);
  return Math.max(jittered, err.retryAfterMs ?? 0);
}

async function processRow(jobId: string, pk: number) {
  const d = db();
  const job = getJob(jobId)!;
  const row = d.prepare("SELECT * FROM rows WHERE pk = ?").get(pk) as Record<string, any>;
  const startedAt = row.started_at as number;
  const queueMs = row.enqueued_at ? Math.max(0, startedAt - row.enqueued_at) : 0;
  const requestId = randomUUID();
  const state = normalizeState(row as any);
  const body = buildRequest(job.config.model, state);
  const maxAttempts = job.config.maxRetries + 1;
  let attempt = row.attempts as number;
  let lastErr: JevError | null = null;

  d.prepare("UPDATE rows SET request_id = ?, normalized = ?, queue_ms = ? WHERE pk = ?").run(requestId, JSON.stringify(state), queueMs, pk);

  for (let i = 0; i < maxAttempts; i++) {
    attempt++;
    const t = Date.now();
    try {
      const res = await callJev(body, job.config.timeoutMs);
      d.prepare("INSERT INTO attempts (job_id,row_pk,attempt,at,ok,retryable,latency_ms) VALUES (?,?,?,?,1,0,?)").run(jobId, pk, attempt, t, res.latencyMs);
      const out = applyPolicy({ response: res.response, messageType: row.message_type, threshold: job.config.confidenceThreshold });
      const u = res.response.usage;
      const known = typeof u?.input_tokens === "number";
      const done = Date.now();
      d.prepare(`UPDATE rows SET status='success', attempts=?, finished_at=?, latency_ms=?, total_ms=?,
        input_tokens=?, output_tokens=?, intent=?, category=?, confidence=?, urgency=?, jev_action=?, final_action=?,
        judgments=?, policy_notes=?, simulated_actions=?, raw_response=?, error=NULL, error_kind=NULL, source=?, model_version=?
        WHERE pk=?`).run(
        attempt, done, res.latencyMs, done - startedAt,
        known ? u!.input_tokens : null, known ? (u!.output_tokens ?? 0) : null,
        out.intent, out.category, out.confidence, out.urgency, out.jevAction, out.finalAction,
        JSON.stringify(res.response.judgments), JSON.stringify(out.notes), JSON.stringify(out.simulated), res.raw,
        res.source, res.response.model_version ?? res.response.model ?? null, pk);
      return;
    } catch (e) {
      const err = e instanceof JevError ? e : new JevError(String((e as Error)?.message ?? e), "network", true);
      lastErr = err;
      d.prepare("INSERT INTO attempts (job_id,row_pk,attempt,at,ok,retryable,latency_ms,error) VALUES (?,?,?,?,0,?,?,?)")
        .run(jobId, pk, attempt, t, err.retryable ? 1 : 0, err.latencyMs ?? null, err.message);
      if (!err.retryable || i === maxAttempts - 1) break;
      const delay = backoffMs(i, err);
      if (err.kind === "rate_limit") rt(jobId).cooldownUntil = Math.max(rt(jobId).cooldownUntil, Date.now() + delay);
      await sleep(delay);
    }
  }

  const done = Date.now();
  d.prepare(`UPDATE rows SET status='failed', attempts=?, finished_at=?, total_ms=?, error=?, error_kind=?, raw_response=?,
    input_tokens=NULL, output_tokens=NULL WHERE pk=?`).run(attempt, done, done - startedAt, lastErr?.message ?? "Unknown error", lastErr?.kind ?? "network", lastErr?.raw ?? null, pk);
}
