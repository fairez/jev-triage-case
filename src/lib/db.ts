import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const g = globalThis as unknown as { __jevDb?: Database.Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY, name TEXT, created_at TEXT, headers TEXT, raw TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, dataset_id TEXT, name TEXT, mode TEXT, status TEXT,
  config TEXT, mapping TEXT, catalog_version TEXT,
  created_at TEXT, started_at INTEGER, finished_at INTEGER, active_ms INTEGER DEFAULT 0, resumed_at INTEGER,
  est_input_tokens INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rows (
  pk INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, seq INTEGER,
  message_id TEXT, channel TEXT, message_text TEXT, message_type TEXT, conversation_context TEXT,
  customer_type TEXT, expected_intent TEXT, expected_category TEXT, expected_action TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0, request_id TEXT,
  enqueued_at INTEGER, started_at INTEGER, finished_at INTEGER,
  queue_ms INTEGER, latency_ms INTEGER, total_ms INTEGER,
  input_tokens INTEGER, output_tokens INTEGER,
  intent TEXT, category TEXT, confidence REAL, urgency TEXT, jev_action TEXT, final_action TEXT,
  judgments TEXT, policy_notes TEXT, normalized TEXT, raw_response TEXT, error TEXT, error_kind TEXT,
  source TEXT, model_version TEXT, correction TEXT, simulated_actions TEXT
);
CREATE INDEX IF NOT EXISTS idx_rows_job_status ON rows(job_id, status);
CREATE INDEX IF NOT EXISTS idx_rows_job_seq ON rows(job_id, seq);
CREATE TABLE IF NOT EXISTS invalid_rows (
  pk INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, line INTEGER, reason TEXT, data TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  pk INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, row_pk INTEGER, attempt INTEGER,
  at INTEGER, ok INTEGER, retryable INTEGER, latency_ms INTEGER, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_job ON attempts(job_id);
`;

export function db(): Database.Database {
  if (g.__jevDb) return g.__jevDb;
  const file = process.env.DATABASE_PATH || "./data/jev-triage.db";
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.exec(SCHEMA);
  g.__jevDb = d;
  return d;
}
