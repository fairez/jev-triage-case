import Papa from "papaparse";
import ExcelJS from "exceljs";
import { ALL_COLUMNS, REQUIRED_COLUMNS } from "./catalog";
import { estimateInputTokens } from "./jev/client";
import { normalizeState } from "./normalize";

export type RawRow = Record<string, string>;
export type Mapping = Record<string, string | null>; // canonical column -> source header

const ALIASES: Record<string, string[]> = {
  message_id: ["message_id", "id", "msg_id", "messageid"],
  channel: ["channel", "source", "platform"],
  message_text: ["message_text", "message", "text", "body", "content"],
  message_type: ["message_type", "type"],
  conversation_context: ["conversation_context", "context", "history"],
  customer_type: ["customer_type", "customer"],
  expected_intent: ["expected_intent", "intent", "label"],
  expected_category: ["expected_category", "category"],
  expected_action: ["expected_action", "action"],
};

export function autoMap(headers: string[]): Mapping {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const m: Mapping = {};
  for (const col of ALL_COLUMNS) {
    m[col] = headers.find((h) => norm(h) === col) ?? headers.find((h) => ALIASES[col].includes(norm(h))) ?? null;
  }
  return m;
}

export async function parseFile(name: string, buf: Buffer): Promise<{ headers: string[]; rows: RawRow[] }> {
  if (/\.xlsx$/i.test(name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Workbook has no sheets");
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => (headers[i - 1] = cellText(c.value)));
    const rows: RawRow[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const r: RawRow = {};
      headers.forEach((h, i) => (r[h] = cellText(row.getCell(i + 1).value)));
      if (Object.values(r).some((v) => v !== "")) rows.push(r);
    });
    return { headers: headers.filter(Boolean), rows };
  }
  if (/\.xls$/i.test(name)) throw new Error("Old .xls format is not supported. Save as .xlsx or .csv");
  if (!/\.(csv|tsv|txt)$/i.test(name)) throw new Error("Unsupported file type. Upload .csv or .xlsx");
  const text = decodeText(buf).replace(/^﻿/, "");
  const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"], transformHeader: (h) => h.trim() });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  if (!headers.length) throw new Error("Could not read a header row. Is the file empty or not a CSV?");
  return { headers, rows: res.data };
}

// Excel can save CSV as UTF-16 ("Unicode Text") or Windows-1252; plain UTF-8 is the default.
function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return String(o.text);
    if (o.result != null) return String(o.result);
  }
  return String(v);
}

export interface ValidRow {
  line: number;
  message_id: string;
  channel: string;
  message_text: string;
  message_type: string | null;
  conversation_context: string | null;
  customer_type: string | null;
  expected_intent: string | null;
  expected_category: string | null;
  expected_action: string | null;
}
export interface InvalidRow { line: number; reason: string; data: RawRow }

const MAX_TEXT = 10_000;

export function validate(rows: RawRow[], mapping: Mapping) {
  const missingCols = REQUIRED_COLUMNS.filter((c) => !mapping[c]);
  const valid: ValidRow[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  const get = (r: RawRow, c: string) => {
    const h = mapping[c];
    const v = h ? r[h] : undefined;
    return v == null || String(v).trim() === "" ? null : String(v).trim();
  };
  rows.forEach((r, i) => {
    const line = i + 2;
    const id = get(r, "message_id"), channel = get(r, "channel"), text = get(r, "message_text");
    const reasons: string[] = [];
    if (!id) reasons.push("missing message_id");
    else if (seen.has(id)) reasons.push(`duplicate message_id "${id}"`);
    if (!channel) reasons.push("missing channel");
    if (!text) reasons.push("missing message_text");
    else if (text.length > MAX_TEXT) reasons.push(`message_text longer than ${MAX_TEXT} characters`);
    if (reasons.length) return invalid.push({ line, reason: reasons.join("; "), data: r });
    seen.add(id!);
    valid.push({
      line, message_id: id!, channel: channel!, message_text: text!,
      message_type: get(r, "message_type"), conversation_context: get(r, "conversation_context"),
      customer_type: get(r, "customer_type"), expected_intent: get(r, "expected_intent"),
      expected_category: get(r, "expected_category"), expected_action: get(r, "expected_action"),
    });
  });

  const channels: Record<string, number> = {};
  valid.forEach((v) => (channels[v.channel] = (channels[v.channel] ?? 0) + 1));
  const missingValues: Record<string, number> = {};
  for (const c of ALL_COLUMNS) {
    if (!mapping[c]) { missingValues[c] = rows.length; continue; }
    const n = rows.filter((r) => get(r, c) === null).length;
    if (n) missingValues[c] = n;
  }
  const estInputTokens = valid.reduce((s, v) => s + estimateInputTokens(normalizeState(v)), 0);
  return { valid, invalid, channels, missingValues, missingCols, estInputTokens };
}
