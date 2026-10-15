"use client";
import { useCallback, useEffect, useState } from "react";
import { ACTIONS, COMPLAINT_CATEGORIES, INTENTS, SALES_CATEGORIES } from "@/lib/catalog";
import { Badge, Btn, Card, Metrics, Table, api, ms, patch, post, money, getCurrency } from "./ui";

const STATUSES = ["pending", "running", "success", "failed", "cancelled"];

export function ResultsView({ jobId, m }: { jobId: string; m: Metrics }) {
  const [f, setF] = useState({ status: "", channel: "", category: "", intent: "", minConf: "", maxConf: "", q: "" });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ sort: "seq", dir: "asc" });
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<number | null>(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    return p;
  }, [f]);
  const done = m.counts.terminal;
  useEffect(() => {
    const p = qs(); p.set("page", String(page)); p.set("sort", sort.sort); p.set("dir", sort.dir);
    api(`/api/jobs/${jobId}/rows?${p}`).then(setData).catch(() => {});
  }, [jobId, qs, page, sort, done, m.counts.running]);

  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(1); };
  const sel_ = "rounded border border-slate-300 px-1.5 py-1 text-sm";
  const th = (label: string, key: string) => (
    <button className="font-medium" onClick={() => setSort({ sort: key, dir: sort.sort === key && sort.dir === "asc" ? "desc" : "asc" })}>{label}{sort.sort === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sim = m.job.mode === "mock";

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input placeholder="Search id / text" className={sel_ + " w-44"} value={f.q} onChange={(e) => set("q", e.target.value)} />
          <select className={sel_} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">Status: all</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className={sel_} value={f.channel} onChange={(e) => set("channel", e.target.value)}><option value="">Channel: all</option>{data?.facets.channels.map((s: string) => <option key={s}>{s}</option>)}</select>
          <select className={sel_} value={f.intent} onChange={(e) => set("intent", e.target.value)}><option value="">Intent: all</option>{data?.facets.intents.map((s: string) => <option key={s}>{s}</option>)}</select>
          <select className={sel_} value={f.category} onChange={(e) => set("category", e.target.value)}><option value="">Category: all</option>{data?.facets.categories.map((s: string) => <option key={s}>{s}</option>)}</select>
          <label className="text-sm text-slate-600">Confidence
            <input type="number" step="0.05" min="0" max="1" placeholder="min" className={sel_ + " ml-1 w-16"} value={f.minConf} onChange={(e) => set("minConf", e.target.value)} />
            <input type="number" step="0.05" min="0" max="1" placeholder="max" className={sel_ + " ml-1 w-16"} value={f.maxConf} onChange={(e) => set("maxConf", e.target.value)} /></label>
          <span className="ml-auto flex gap-2">
            <a className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" href={`/api/jobs/${jobId}/export?format=csv&currency=${getCurrency()}&${qs()}`}>Export CSV</a>
            <a className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50" href={`/api/jobs/${jobId}/export?format=xlsx&currency=${getCurrency()}&${qs()}`}>Export XLSX</a>
          </span>
        </div>
      </Card>

      <Card>
        <Table head={["ID", "Channel", "Message", "Intent", "Category", "Conf.", "Urgency", "Next action", "Latency", "Tokens", sim ? "Cost (sim.)" : "Cost", "Status"]}>
          {data?.rows.map((r: any) => (
            <tr key={r.pk} className="cursor-pointer hover:bg-indigo-50" onClick={() => setSel(r.pk)}>
              <td className="whitespace-nowrap px-2 py-1">{r.id}</td>
              <td className="px-2 py-1">{r.channel}</td>
              <td className="max-w-xs truncate px-2 py-1" title={r.message}>{r.message}</td>
              <td className="px-2 py-1">{r.intent ?? "—"}</td>
              <td className="px-2 py-1">{r.category && r.category !== "None" ? r.category : "—"}</td>
              <td className={`px-2 py-1 tabular-nums ${r.confidence != null && r.confidence < m.job.config.confidenceThreshold ? "text-amber-600" : ""}`}>{r.confidence?.toFixed(2) ?? "—"}</td>
              <td className="px-2 py-1">{r.urgency ?? "—"}</td>
              <td className="whitespace-nowrap px-2 py-1">{r.nextAction ?? "—"}{r.corrected && <span title="Reviewer corrected" className="ml-1 text-indigo-600">✎</span>}</td>
              <td className="px-2 py-1 tabular-nums">{ms(r.latencyMs)}</td>
              <td className="px-2 py-1 tabular-nums">{r.inputTokens ?? (r.billingUnknown ? "unknown" : "—")}</td>
              <td className="px-2 py-1 tabular-nums">{r.cost != null ? money(r.cost, 8) : r.billingUnknown ? "unknown" : "—"}</td>
              <td className="px-2 py-1"><Badge s={r.status} /></td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
          <span>{data?.total ?? 0} rows</span>
          <span className="ml-auto flex items-center gap-2">
            <Btn disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn>
            <span>Page {page} / {pages}</span>
            <Btn disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn>
          </span>
        </div>
        <div className="mt-1 flex gap-3 text-xs text-slate-400">Sort: {th("ID", "seq")} {th("Latency", "latency")} {th("Confidence", "confidence")} {th("Tokens", "cost")} {th("Finished", "finished")}</div>
      </Card>

      {sel != null && <Detail jobId={jobId} pk={sel} sim={sim} onClose={() => setSel(null)} />}
    </div>
  );
}

function Detail({ jobId, pk, sim, onClose }: { jobId: string; pk: number; sim: boolean; onClose: () => void }) {
  const [r, setR] = useState<any>(null);
  const [c, setC] = useState({ intent: "", category: "", action: "" });
  const load = useCallback(() => api(`/api/jobs/${jobId}/rows/${pk}`).then(setR), [jobId, pk]);
  useEffect(() => { load(); }, [load]);
  if (!r) return null;
  const J = r.judgments ?? {};
  const field = "rounded border border-slate-300 px-1.5 py-1 text-sm";
  const save = async () => { await patch(`/api/jobs/${jobId}/rows/${pk}`, c); setC({ intent: "", category: "", action: "" }); load(); };

  return (
    <div className="fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-l border-slate-300 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Message {r.id} <Badge s={r.status} /> {r.source === "mock" && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">SIMULATED</span>}</h2>
        <Btn onClick={onClose}>Close</Btn>
      </div>
      <Sec title="Original input"><pre className="whitespace-pre-wrap text-sm">{JSON.stringify(r.input, null, 2)}</pre></Sec>
      <Sec title="Normalized Jev state"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(r.normalized, null, 2)}</pre></Sec>
      {r.status === "success" && (
        <>
          <Sec title="Jev judgments">
            <div className="space-y-2">
              {Object.entries(J).map(([k, v]: [string, any]) => (
                <div key={k} className="text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">{k}</span><b>{v.value ?? (v.probability != null ? v.probability.toFixed(3) : "—")}{v.confidence != null && <span className="ml-1 font-normal text-slate-500">({v.confidence.toFixed(2)})</span>}</b></div>
                  {v.distribution && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {Object.entries(v.distribution).sort((a: any, b: any) => b[1] - a[1]).slice(0, 4).map(([l, p]: any) => <span key={l}>{l} {p.toFixed(2)}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Sec>
          <Sec title="Final routing decision">
            <div className="text-sm">Jev proposed: <b>{r.jevAction}</b> → final: <b>{r.originalAction}</b></div>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{r.policyNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}{!r.policyNotes.length && <li>No policy override</li>}</ul>
            <div className="mt-2 text-xs text-slate-500">Simulated side effects (not executed):</div>
            <ul className="list-disc pl-5 text-xs text-slate-600">{r.simulatedActions.map((a: any, i: number) => <li key={i}>{a.detail}</li>)}</ul>
          </Sec>
          <Sec title="Timing & billing">
            <div className="text-sm">Queue {ms(r.timing.queueMs)} · Inference {ms(r.timing.inferenceMs)} · End-to-end {ms(r.timing.endToEndMs)}</div>
            <div className="text-sm">Tokens in/out: {r.inputTokens ?? "unknown"} / {r.outputTokens ?? "unknown"} · {sim ? "Simulated cost" : "Cost"}: {r.cost != null ? money(r.cost, 8) : "unknown"}</div>
            <div className="text-xs text-slate-500">internal request id {r.requestId} · model {r.modelVersion ?? "—"}</div>
          </Sec>
          <Sec title="Reviewer correction">
            {r.correction && <div className="mb-2 text-xs text-indigo-700">Current: {JSON.stringify({ ...r.correction, at: undefined })} <button className="underline" onClick={async () => { await patch(`/api/jobs/${jobId}/rows/${pk}`, { clear: true }); load(); }}>clear</button></div>}
            <div className="flex flex-wrap gap-2">
              <select className={field} value={c.intent} onChange={(e) => setC({ ...c, intent: e.target.value })}><option value="">Intent…</option>{INTENTS.map((x) => <option key={x}>{x}</option>)}</select>
              <select className={field} value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}><option value="">Category…</option>{[...new Set([...COMPLAINT_CATEGORIES, ...SALES_CATEGORIES])].map((x) => <option key={x}>{x}</option>)}</select>
              <select className={field} value={c.action} onChange={(e) => setC({ ...c, action: e.target.value })}><option value="">Action…</option>{ACTIONS.map((x) => <option key={x}>{x}</option>)}</select>
              <Btn disabled={!c.intent && !c.category && !c.action} onClick={save}>Save</Btn>
            </div>
            <p className="mt-1 text-xs text-slate-500">The original Jev output is kept; accuracy metrics always score the original output.</p>
          </Sec>
        </>
      )}
      {(r.status === "failed" || r.status === "cancelled") && (
        <Sec title="Error"><p className="text-sm text-rose-700">{r.error}</p><p className="text-xs text-slate-500">kind: {r.errorKind} · attempts: {r.attempts}</p>
          <div className="mt-2"><Btn onClick={async () => { await post(`/api/jobs/${jobId}/control`, { action: "retry_row", rowPk: pk }); onClose(); }}>Retry this row</Btn></div></Sec>
      )}
      {r.attemptLog.length > 0 && <Sec title="Attempts"><ul className="text-xs">{r.attemptLog.map((a: any) => <li key={a.attempt}>#{a.attempt} {a.ok ? "ok" : "failed"} {a.latencyMs != null && `· ${a.latencyMs} ms`} {a.error && `· ${a.error}`}</li>)}</ul></Sec>}
      {r.rawResponse && <Sec title="Raw API response"><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{r.rawResponse}</pre></Sec>}
    </div>
  );
}
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4"><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>{children}</div>
);
