import Papa from "papaparse";
import { ALL_COLUMNS } from "./catalog";

const rows: Record<string, string>[] = [
  ["1001", "WhatsApp", "Halo, saya mau buka rekening tabungan untuk usaha kecil saya. Syaratnya apa saja?", "chat", "", "prospect", "Sales", "Business Banking", "Sales Follow-up"],
  ["1002", "Instagram", "Transfer saya gagal sudah 3 hari tapi saldo terpotong!! tolong segera diproses", "dm", "", "existing", "Complaint", "Payment", "Complaint Ticket"],
  ["1003", "Instagram", "Kecewa banget sama aplikasinya, login terus error", "comment", "", "unknown", "Complaint", "App", "Public-to-Private"],
  ["1004", "Email", "Saya menerima OTP padahal tidak melakukan login. Sepertinya akun saya dibobol.", "email", "", "existing", "Complaint", "Fraud", "Security Escalation"],
  ["1005", "WhatsApp", "What are the daily transfer limits for savings accounts?", "chat", "", "existing", "Inquiry", "None", "FAQ"],
  ["1006", "Twitter", "Klik link ini untuk hadiah giveaway https://bit.ly/xxxx", "comment", "", "unknown", "Spam", "None", "No Action"],
  ["1007", "WhatsApp", "Terima kasih, layanan CS-nya mantap!", "chat", "", "existing", "Feedback", "None", "No Action"],
  ["1008", "Email", "Saya tertarik deposito, tapi biaya admin rekening saya bulan lalu naik tanpa pemberitahuan. Kenapa?", "email", "", "existing", "Complaint", "Fees", "Complaint Ticket"],
  ["1009", "Google Review", "Mau apply kredit UMKM, bunga berapa ya?", "review", "", "prospect", "Sales", "Financing", "Public-to-Private"],
  ["1010", "WhatsApp", "kartu debit saya hilang, tolong blokir sekarang", "chat", "Customer: halo\nAgent: ada yang bisa dibantu?", "existing", "Complaint", "Card", "Security Escalation"],
  ["1011", "WhatsApp", "ok", "chat", "", "unknown", "Other", "None", "Human Review"],
  ["1012", "Instagram", "Is there a promo for new account opening this month?", "dm", "", "prospect", "Sales", "Account Opening", "Sales Follow-up"],
].map((r) => Object.fromEntries(ALL_COLUMNS.map((c, i) => [c, r[i] ?? ""])));

export function sampleCsv() {
  return "﻿" + Papa.unparse({ fields: [...ALL_COLUMNS], data: rows.map((r) => ALL_COLUMNS.map((c) => r[c])) });
}
