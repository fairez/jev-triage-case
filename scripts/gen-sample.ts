// Usage: npm run gen:sample -- 2000 data/sample-2000.csv
import fs from "node:fs";

const n = Number(process.argv[2] ?? 1000);
const out = process.argv[3] ?? `data/sample-${n}.csv`;
const T: [string, string, string, string, string][] = [
  ["Halo, saya mau buka rekening untuk usaha saya, syaratnya apa?", "Sales", "Business Banking", "Sales Follow-up", "chat"],
  ["Transfer saya gagal 3 hari, saldo terpotong! tolong segera", "Complaint", "Payment", "Complaint Ticket", "dm"],
  ["Aplikasinya error terus tiap login, kecewa banget", "Complaint", "App", "Complaint Ticket", "chat"],
  ["Ada OTP masuk padahal bukan saya, akun saya dibobol?", "Complaint", "Fraud", "Security Escalation", "email"],
  ["What is the daily transfer limit for savings accounts?", "Inquiry", "None", "FAQ", "chat"],
  ["Klik link ini untuk hadiah giveaway https://bit.ly/x", "Spam", "None", "No Action", "chat"],
  ["Terima kasih, CS-nya mantap!", "Feedback", "None", "No Action", "chat"],
  ["Interested in a deposito, what is the bunga rate?", "Sales", "Deposits", "Sales Follow-up", "dm"],
  ["Biaya admin bulan ini naik tanpa pemberitahuan", "Complaint", "Fees", "Complaint Ticket", "email"],
  ["Mau apply kredit UMKM, bunga berapa?", "Sales", "Financing", "Sales Follow-up", "dm"],
];
const channels = ["WhatsApp", "Instagram", "Email", "Twitter", "Google Review"];
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const lines = ["message_id,channel,message_text,message_type,conversation_context,customer_type,expected_intent,expected_category,expected_action"];
for (let i = 0; i < n; i++) {
  const [text, intent, cat, action, type] = T[i % T.length];
  const ch = channels[i % channels.length];
  const t = ch === "Google Review" || ch === "Twitter" ? "comment" : type;
  const act = t === "comment" && ["Sales Follow-up", "Complaint Ticket", "FAQ"].includes(action) ? "Public-to-Private" : action;
  lines.push([`M${String(i + 1).padStart(5, "0")}`, ch, q(`${text} (#${i + 1})`), t, "", "unknown", intent, cat, act].join(","));
}
fs.writeFileSync(out, "﻿" + lines.join("\n"));
console.log(`wrote ${n} rows to ${out}`);
