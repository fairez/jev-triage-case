"use client";
import { useEffect, useState } from "react";
import { USD_TO_IDR } from "@/lib/config";
import type { computeMetrics } from "@/lib/metrics";

export type Metrics = NonNullable<ReturnType<typeof computeMetrics>>;

export type Currency = "USD" | "IDR";
let currency: Currency = "USD";
export const setCurrency = (c: Currency) => { currency = c; };
export const getCurrency = () => currency;
export const currencyRate = () => (currency === "IDR" ? USD_TO_IDR : 1);
// USD amount -> display amount in the selected currency (rounded to hide float noise).
export const toDisplay = (usdValue: number) => +(usdValue * currencyRate()).toFixed(8);
export const fromDisplay = (value: number) => value / currencyRate();

export function money(n: number | null | undefined, d = 6): string {
  if (n == null) return "—";
  if (currency === "IDR") {
    const v = n * USD_TO_IDR;
    const digits = v === 0 || Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.01 ? 4 : 6;
    return "Rp" + v.toLocaleString("id-ID", { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits });
  }
  return "$" + n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? d : 4);
}
export const ms = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? (n / 1000).toFixed(2) + " s" : Math.round(n) + " ms");
export const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : (n * 100).toFixed(d) + "%");
export const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d }));
export function dur(sec: number) {
  const s = Math.round(sec);
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
export const post = (url: string, body: unknown) => api(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const patch = (url: string, body: unknown) => api(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function useMetrics(jobId: string | null): Metrics | null {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    setM(null);
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => setM(JSON.parse(e.data));
    return () => es.close();
  }, [jobId]);
  return m;
}

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, warn }: { label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Btn({ children, onClick, disabled, kind = "default", title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: "default" | "primary" | "danger"; title?: string }) {
  const k = kind === "primary" ? "bg-indigo-600 text-white hover:bg-indigo-700" : kind === "danger" ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50" : "bg-white text-slate-700 hover:bg-slate-50";
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${k}`}>
      {children}
    </button>
  );
}

const STATUS: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800", failed: "bg-rose-100 text-rose-800", running: "bg-sky-100 text-sky-800",
  pending: "bg-slate-100 text-slate-600", cancelled: "bg-amber-100 text-amber-800", completed: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800", stopped: "bg-amber-100 text-amber-800", draft: "bg-slate-100 text-slate-600",
};
export const Badge = ({ s }: { s: string }) => <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS[s] ?? STATUS.pending}`}>{s}</span>;

export function LineChart({ data, color = "#4f46e5", format = (v: number) => v.toFixed(2), height = 110 }: { data: { x: number; y: number | null }[]; color?: string; format?: (v: number) => string; height?: number }) {
  const pts = data.filter((d) => d.y != null) as { x: number; y: number }[];
  if (pts.length < 2) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>Waiting for data…</div>;
  const W = 400, H = height, P = 4;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys) || 1;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${(P + ((p.x - x0) / (x1 - x0 || 1)) * (W - 2 * P)).toFixed(1)},${(H - P - (p.y / y1) * (H - 2 * P)).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img">
        <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-slate-500"><span>0</span><span>max {format(y1)}</span><span>latest {format(pts[pts.length - 1].y)}</span></div>
    </div>
  );
}

export function Bars({ data, color = "#4f46e5" }: { data: Record<string, number>; color?: string }) {
  const e = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...e.map(([, v]) => v));
  if (!e.length) return <div className="text-xs text-slate-400">No data yet</div>;
  return (
    <div className="space-y-1">
      {e.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <div className="w-32 shrink-0 truncate text-slate-600" title={k}>{k}</div>
          <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded" style={{ width: `${(v / max) * 100}%`, background: color }} /></div>
          <div className="w-10 text-right tabular-nums">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
