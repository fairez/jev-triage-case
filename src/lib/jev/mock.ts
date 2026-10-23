// Local simulator used only when no JEV_API_KEY is configured (or JEV_MODE=mock).
// Every row it produces is stored with source="mock" and the UI labels the whole run SIMULATED.
import { JevCallResult, JevError, TsAnswer, TsResponse } from "./types";
import { normalizeResponse } from "./normalize";
import type { JevRequestBody } from "./client";
import { ACTIONS, COMPLAINT_CATEGORIES, INTENTS, REQUEST_CATEGORIES, SALES_CATEGORIES, URGENCIES } from "../catalog";

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

function dist(labels: readonly string[], pick: string, conf: number): Record<string, number> {
  const rest = (1 - conf) / Math.max(1, labels.length - 1);
  return Object.fromEntries(labels.map((l) => [l, +(l === pick ? conf : rest).toFixed(4)]));
}

function classify(text: string) {
  const t = text.toLowerCase();
  const security = has(t, ["penipuan", "fraud", "phishing", "scam", "dibobol", "hack", "otp", "bukan saya", "unauthorized", "kartu hilang", "lost card", "curi", "stolen", "takeover"]);
  const complaint = has(t, ["kecewa", "komplain", "complain", "gagal", "error", "tidak bisa", "ga bisa", "gak bisa", "belum masuk", "potongan", "biaya", "lambat", "slow", "failed", "stuck", "refund", "worst", "buruk", "charged", "double"]);
  const sales = has(t, ["buka rekening", "open account", "mau daftar", "deposito", "pinjaman", "kredit", "kta", "loan", "interested", "tertarik", "promo", "bunga", "suku bunga", "apply", "bisnis", "umkm", "business account"]);
  const spam = has(t, ["http://", "https://", "klik link", "hadiah", "giveaway", "judi", "slot", "follow back", "subscribe"]);
  const request = has(t, ["tolong blokir", "blokir", "block my", "please block", "tolong tutup", "tutup rekening", "tutup akun", "close my", "please close", "nonaktifkan", "deactivate", "aktifkan kembali", "buka blokir", "unblock", "reactivate", "ganti nomor", "ubah data", "update data", "naikkan limit", "turunkan limit", "ubah limit", "increase my limit", "minta mutasi", "surat keterangan", "send statement"]);
  const feedback = has(t, ["saran", "suggest", "feedback", "terima kasih", "thanks", "great", "mantap", "bagus"]);
  let intent: string = "Inquiry";
  if (spam && !security) intent = "Spam";
  else if (request && !security) intent = "Request";
  else if (security || complaint) intent = "Complaint";
  else if (sales) intent = "Sales";
  else if (feedback) intent = "Feedback";
  else if (t.trim().length < 4) intent = "Other";

  let ccat = "None";
  if (security) ccat = "Fraud";
  else if (complaint) ccat = has(t, ["transfer", "payment", "bayar", "top up", "topup", "qris"]) ? "Payment" : has(t, ["kartu", "card", "atm"]) ? "Card" : has(t, ["aplikasi", "app", "login", "update"]) ? "App" : has(t, ["biaya", "fee", "potongan", "admin"]) ? "Fees" : has(t, ["rekening", "account", "saldo"]) ? "Account" : has(t, ["pinjaman", "kredit", "loan"]) ? "Financing" : "Service";
  let rcat = "None";
  if (request) rcat = has(t, ["buka blokir", "unblock", "aktifkan kembali", "reactivate"]) ? "Reactivation" : has(t, ["blokir", "block", "nonaktifkan", "deactivate"]) ? "Block" : has(t, ["tutup", "close"]) ? "Closure" : has(t, ["limit"]) ? "Limit Change" : has(t, ["mutasi", "surat", "statement"]) ? "Document" : has(t, ["ganti nomor", "ubah data", "update data"]) ? "Data Change" : "Other";
  let scat = "None";
  if (sales) scat = has(t, ["deposito", "tabungan"]) ? "Deposits" : has(t, ["pinjaman", "kredit", "loan", "kta"]) ? "Financing" : has(t, ["bisnis", "umkm", "business"]) ? "Business Banking" : has(t, ["rekening", "account"]) ? "Account Opening" : "Other";

  const urgency = security ? "Critical" : complaint ? (has(t, ["urgent", "segera", "hari ini", "sudah 3", "berhari"]) ? "High" : "Medium") : "Routine";
  const action = security ? "Security Escalation" : complaint ? "Complaint Ticket" : request ? "Admin Follow-up" : sales ? "Sales Follow-up" : spam ? "No Action" : intent === "Inquiry" ? "FAQ" : feedback ? "No Action" : "Human Review";
  return { intent, ccat, rcat, scat, urgency, action, security, complaint, sales, request };
}

export async function mockCall(body: JevRequestBody, timeoutMs: number): Promise<JevCallResult> {
  const latency = 120 + Math.random() * 450 + (Math.random() < 0.05 ? 1500 : 0);
  if (latency > timeoutMs) {
    await new Promise((r) => setTimeout(r, timeoutMs));
    throw new JevError(`Timed out after ${timeoutMs} ms`, "timeout", true, undefined, undefined, timeoutMs);
  }
  await new Promise((r) => setTimeout(r, latency));
  const roll = Math.random();
  if (roll < 0.02) throw new JevError("HTTP 429: rate limited (mock)", "rate_limit", true, 429, 400, Math.round(latency));
  if (roll < 0.035) throw new JevError("HTTP 503: unavailable (mock)", "server", true, 503, undefined, Math.round(latency));

  const text = body.state.message + " " + (body.state.conversation_context ?? "");
  const c = classify(text);
  const conf = +(0.62 + Math.random() * 0.36).toFixed(3);
  const prob = (on: boolean) => +(on ? 0.7 + Math.random() * 0.28 : Math.random() * 0.25).toFixed(3);
  // Emit the same wire shape as the real API, then normalize it the same way.
  const choice = (labels: readonly string[], pick: string): TsAnswer => ({ type: "choice", choice: pick, probabilities: dist(labels, pick, conf), confidence: conf });
  const noul = (on: boolean): TsAnswer => ({ type: "noul", noul: prob(on) });
  const urgencyProbs = dist(URGENCIES, c.urgency, conf);
  const raw: TsResponse = {
    model: "mock-simulator",
    answers: {
      primary_intent: choice(INTENTS, c.intent),
      sales_opportunity: noul(c.sales),
      complaint_indicator: noul(c.complaint || c.security),
      complaint_category: choice(COMPLAINT_CATEGORIES, c.ccat),
      request_category: choice(REQUEST_CATEGORIES, c.rcat),
      sales_category: choice(SALES_CATEGORIES, c.scat),
      urgency: {
        type: "score",
        score: URGENCIES.indexOf(c.urgency as (typeof URGENCIES)[number]) + 1,
        probabilities: Object.fromEntries(URGENCIES.map((u, i) => [String(i + 1), urgencyProbs[u]])),
        confidence: conf,
      },
      security_concern: noul(c.security),
      next_action: choice(ACTIONS, c.action),
    },
    usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: 0 },
  };
  return { response: normalizeResponse(raw), raw: JSON.stringify(raw), latencyMs: Math.round(latency), source: "mock" };
}
