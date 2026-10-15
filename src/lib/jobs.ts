import { randomUUID } from "node:crypto";
import { CATALOG_VERSION } from "./catalog";
import { JobConfig, defaultConfig, getMode } from "./config";
import { db } from "./db";
import { Mapping, ValidRow, InvalidRow } from "./ingest";

export interface JobRow {
  id: string; dataset_id: string; name: string; mode: "live" | "mock"; status: string;
  config: JobConfig; mapping: Mapping; catalog_version: string;
  created_at: string; started_at: number | null; finished_at: number | null;
  active_ms: number; resumed_at: number | null; est_input_tokens: number;
}

export function getJob(id: string): JobRow | null {
  const r = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...(r as unknown as JobRow), config: JSON.parse(r.config as string), mapping: JSON.parse(r.mapping as string) };
}

export function listJobs() {
  const rows = db().prepare(`
    SELECT j.id, j.name, j.mode, j.status, j.created_at,
      (SELECT COUNT(*) FROM rows r WHERE r.job_id = j.id) AS total,
      (SELECT COUNT(*) FROM rows r WHERE r.job_id = j.id AND r.status = 'success') AS done
    FROM jobs j ORDER BY j.created_at DESC LIMIT 50`).all();
  return rows;
}

export function updateConfig(id: string, patch: Partial<JobConfig>) {
  const job = getJob(id);
  if (!job) throw new Error("Job not found");
  const next: JobConfig = { ...job.config };
  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`Value ${v} out of range ${lo}-${hi}`);
    return n;
  };
  if (patch.concurrency !== undefined) next.concurrency = num(patch.concurrency, 1, 20);
  if (patch.confidenceThreshold !== undefined) next.confidenceThreshold = num(patch.confidenceThreshold, 0, 1);
  if (patch.maxRetries !== undefined) next.maxRetries = num(patch.maxRetries, 0, 10);
  if (patch.timeoutMs !== undefined) next.timeoutMs = num(patch.timeoutMs, 1000, 120_000);
  if (patch.model !== undefined && String(patch.model).trim()) next.model = String(patch.model).trim();
  if (patch.inputPricePerM !== undefined || patch.outputPricePerM !== undefined) {
    if (patch.inputPricePerM !== undefined) next.inputPricePerM = num(patch.inputPricePerM, 0, 1e6);
    if (patch.outputPricePerM !== undefined) next.outputPricePerM = num(patch.outputPricePerM, 0, 1e6);
    next.pricingUpdatedAt = new Date().toISOString();
  }
  db().prepare("UPDATE jobs SET config = ? WHERE id = ?").run(JSON.stringify(next), id);
  return next;
}

export function createDataset(name: string, headers: string[], rows: unknown[]) {
  const id = randomUUID();
  db().prepare("INSERT INTO datasets (id, name, created_at, headers, raw) VALUES (?,?,?,?,?)")
    .run(id, name, new Date().toISOString(), JSON.stringify(headers), JSON.stringify(rows));
  return id;
}

export function getDataset(id: string) {
  const r = db().prepare("SELECT * FROM datasets WHERE id = ?").get(id) as { id: string; name: string; headers: string; raw: string } | undefined;
  if (!r) return null;
  return { id: r.id, name: r.name, headers: JSON.parse(r.headers) as string[], rows: JSON.parse(r.raw) as Record<string, string>[] };
}

export function createJob(opts: {
  datasetId: string; name: string; mapping: Mapping; config?: Partial<JobConfig>;
  valid: ValidRow[]; invalid: InvalidRow[]; estInputTokens: number;
}) {
  const id = randomUUID();
  const config = { ...defaultConfig(), ...opts.config };
  const d = db();
  const tx = d.transaction(() => {
    d.prepare(`INSERT INTO jobs (id, dataset_id, name, mode, status, config, mapping, catalog_version, created_at, est_input_tokens)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, opts.datasetId, opts.name, getMode(), "draft", JSON.stringify(config),
      JSON.stringify(opts.mapping), CATALOG_VERSION, new Date().toISOString(), opts.estInputTokens);
    const ins = d.prepare(`INSERT INTO rows (job_id, seq, message_id, channel, message_text, message_type, conversation_context,
      customer_type, expected_intent, expected_category, expected_action, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')`);
    opts.valid.forEach((v, i) => ins.run(id, i, v.message_id, v.channel, v.message_text, v.message_type, v.conversation_context,
      v.customer_type, v.expected_intent, v.expected_category, v.expected_action));
    const bad = d.prepare("INSERT INTO invalid_rows (job_id, line, reason, data) VALUES (?,?,?,?)");
    opts.invalid.forEach((b) => bad.run(id, b.line, b.reason, JSON.stringify(b.data)));
  });
  tx();
  return id;
}
