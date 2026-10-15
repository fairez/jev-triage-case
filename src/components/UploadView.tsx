"use client";
import { useState } from "react";
import { ALL_COLUMNS, REQUIRED_COLUMNS } from "@/lib/catalog";
import { CONCURRENCY_CHOICES, defaultConfig } from "@/lib/config";
import { Btn, Card, Table, api, post, money, num, getCurrency, toDisplay, fromDisplay } from "./ui";

export function UploadView({ mode, onStarted }: { mode: "live" | "mock"; onStarted: (jobId: string) => void }) {
  const [ds, setDs] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [summary, setSummary] = useState<any>(null);
  const [cfg, setCfg] = useState(defaultConfig());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function revalidate(id: string, m: Record<string, string | null>) {
    setSummary(await post(`/api/datasets/${id}/validate`, { mapping: m }));
  }
  async function upload(f: File) {
    setErr(""); setBusy(true); setSummary(null);
    try {
      const fd = new FormData(); fd.append("file", f);
      const d = await api("/api/datasets", { method: "POST", body: fd });
      setDs(d); setMapping(d.mapping); await revalidate(d.datasetId, d.mapping);
    } catch (e) { setErr((e as Error).message); setDs(null); }
    setBusy(false);
  }
  async function start() {
    setBusy(true); setErr("");
    try {
      const { jobId } = await post("/api/jobs", { datasetId: ds.datasetId, mapping, config: cfg, name: ds.name });
      await post(`/api/jobs/${jobId}/control`, { action: "start" });
      onStarted(jobId);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const estCost = summary ? (summary.estInputTokens / 1e6) * cfg.inputPricePerM : 0;
  const canStart = summary && summary.validCount > 0 && !summary.missingCols.length && !busy;
  const field = "w-full rounded border border-slate-300 px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      <Card title="1. Dataset">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,.xlsx,.tsv,.txt,text/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/csv"onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} className="text-sm" />
          <a href="/api/sample" className="text-sm text-indigo-600 underline">Download sample dataset</a>
          {busy && <span className="text-sm text-slate-500">Working…</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">CSV or XLSX, UTF-8. Required: {REQUIRED_COLUMNS.join(", ")}. Up to 10,000 rows.</p>
        {err && <p role="alert" className="mt-2 rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">Upload failed: {err}</p>}
      </Card>

      {ds && summary && (
        <>
          <Card title="2. Column mapping">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ALL_COLUMNS.map((c) => (
                <label key={c} className="text-xs text-slate-600">
                  {c}{(REQUIRED_COLUMNS as readonly string[]).includes(c) && <span className="text-rose-500"> *</span>}
                  <select className={field} value={mapping[c] ?? ""} onChange={(e) => { const m = { ...mapping, [c]: e.target.value || null }; setMapping(m); revalidate(ds.datasetId, m); }}>
                    <option value="">— none —</option>
                    {ds.headers.map((h: string) => <option key={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {summary.missingCols.length > 0 && <p className="mt-2 text-sm text-rose-600">Map required columns: {summary.missingCols.join(", ")}</p>}
          </Card>

          <Card title="3. Validation summary">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="text-sm">
                <div><b>{num(summary.total)}</b> rows · <b className="text-emerald-700">{num(summary.validCount)}</b> valid · <b className={summary.invalidCount ? "text-rose-700" : ""}>{num(summary.invalidCount)}</b> invalid</div>
                <div className="mt-2 text-xs text-slate-500">Estimated input tokens: {num(summary.estInputTokens)}</div>
                <div className="text-sm">Estimated cost: <b>{money(estCost)}</b> <span className="text-xs text-slate-500">(estimate, ~4 chars/token)</span></div>
              </div>
              <div className="text-xs">
                <div className="mb-1 font-medium text-slate-600">Channels</div>
                {Object.entries(summary.channels).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{v as number}</span></div>)}
              </div>
              <div className="text-xs">
                <div className="mb-1 font-medium text-slate-600">Missing values</div>
                {Object.keys(summary.missingValues).length === 0 ? "None" : Object.entries(summary.missingValues).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{v as number}</span></div>)}
              </div>
            </div>
            {summary.invalid.length > 0 && (
              <details className="mt-3" open>
                <summary className="cursor-pointer text-sm font-medium text-rose-700">Invalid rows (excluded, {summary.invalidCount})</summary>
                <Table head={["Line", "Reason"]}>
                  {summary.invalid.slice(0, 50).map((r: any) => <tr key={r.line}><td className="px-2 py-1">{r.line}</td><td className="px-2 py-1">{r.reason}</td></tr>)}
                </Table>
              </details>
            )}
          </Card>

          <Card title="4. Preview (first 20 rows)">
            <Table head={ds.headers}>
              {ds.preview.map((r: any, i: number) => (
                <tr key={i}>{ds.headers.map((h: string) => <td key={h} className="max-w-xs truncate px-2 py-1" title={r[h]}>{r[h]}</td>)}</tr>
              ))}
            </Table>
          </Card>

          <Card title="5. Processing configuration">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs text-slate-600">Model<input className={field} value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} /></label>
              <label className="text-xs text-slate-600">Concurrent requests
                <select className={field} value={cfg.concurrency} onChange={(e) => setCfg({ ...cfg, concurrency: +e.target.value })}>{CONCURRENCY_CHOICES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="text-xs text-slate-600">Confidence threshold<input type="number" step="0.01" min="0" max="1" className={field} value={cfg.confidenceThreshold} onChange={(e) => setCfg({ ...cfg, confidenceThreshold: +e.target.value })} /></label>
              <label className="text-xs text-slate-600">Max retries<input type="number" min="0" max="10" className={field} value={cfg.maxRetries} onChange={(e) => setCfg({ ...cfg, maxRetries: +e.target.value })} /></label>
              <label className="text-xs text-slate-600">API timeout (ms)<input type="number" step="500" className={field} value={cfg.timeoutMs} onChange={(e) => setCfg({ ...cfg, timeoutMs: +e.target.value })} /></label>
              <label className="text-xs text-slate-600">Input price / 1M tokens ({getCurrency()})<input key={getCurrency()} type="number" step="any" min="0" className={field} defaultValue={toDisplay(cfg.inputPricePerM)} onChange={(e) => setCfg({ ...cfg, inputPricePerM: fromDisplay(+e.target.value), pricingUpdatedAt: new Date().toISOString() })} /></label>
              <label className="text-xs text-slate-600">Output price / 1M tokens ({getCurrency()})<input key={getCurrency()} type="number" step="any" min="0" className={field} defaultValue={toDisplay(cfg.outputPricePerM)} onChange={(e) => setCfg({ ...cfg, outputPricePerM: fromDisplay(+e.target.value), pricingUpdatedAt: new Date().toISOString() })} /></label>
              <div className="text-xs text-slate-600">Mode<div className="mt-1 text-sm font-medium">One Jev request per row</div></div>
            </div>
            {mode === "mock" && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">No JEV_API_KEY configured. This run will use the built-in simulator. Results are labeled SIMULATED and are not real Jev responses.</p>}
            <div className="mt-4"><Btn kind="primary" disabled={!canStart} onClick={start}>Start Processing ({num(summary.validCount)} messages)</Btn></div>
          </Card>
        </>
      )}
    </div>
  );
}
