import ExcelJS from "exceljs";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { getJob } from "@/lib/jobs";
import { buildWhere, shapeRow } from "@/lib/rows";
import { fail, guard } from "@/lib/http";
import { USD_TO_IDR } from "@/lib/config";
export const dynamic = "force-dynamic";

const COLS = ["message_id", "channel", "message_text", "status", "intent", "category", "confidence", "urgency", "next_action", "jev_proposed_action", "reviewer_corrected",
  "latency_ms", "input_tokens", "output_tokens", "cost", "billing", "attempts", "source", "request_id", "model_version", "policy_notes", "error", "expected_intent", "expected_category", "expected_action"];

export const GET = guard((req: Request, { params }: { params: { id: string } }) => {
  const job = getJob(params.id);
  if (!job) return fail("Job not found", 404);
  const sp = new URL(req.url).searchParams;
  const { where, args } = buildWhere(params.id, sp);
  const idr = sp.get("currency") === "IDR";
  const cols = COLS.map((c) => (c === "cost" ? (idr ? "cost_idr" : "cost_usd") : c));
  const raw = db().prepare(`SELECT * FROM rows WHERE ${where} ORDER BY seq`).all(...args) as any[];
  const data = raw.map((r) => {
    const s = shapeRow(r, job.config);
    return [r.message_id, r.channel, r.message_text, s.status, s.intent, s.category, r.confidence, r.urgency, s.nextAction, r.jev_action, s.corrected ? "yes" : "",
      r.latency_ms, r.input_tokens, r.output_tokens, s.cost !== null && idr ? s.cost * USD_TO_IDR : s.cost, s.billingUnknown ? "unknown" : s.cost !== null ? (job.mode === "mock" ? "simulated" : "usage-based") : "",
      r.attempts, r.source ?? "", r.request_id, r.model_version, (r.policy_notes ? JSON.parse(r.policy_notes) : []).join(" | "), r.error,
      r.expected_intent, r.expected_category, r.expected_action];
  });
  const base = `jev-results-${job.id.slice(0, 8)}`;
  if (sp.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("results");
    ws.addRow(cols).font = { bold: true };
    data.forEach((r) => ws.addRow(r));
    return wb.xlsx.writeBuffer().then((buf) => new Response(buf as ArrayBuffer, { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${base}.xlsx"` } }));
  }
  const csv = "﻿" + Papa.unparse({ fields: cols, data });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` } });
});
