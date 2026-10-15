"use client";
import { useEffect, useState } from "react";
import { AnalyticsView } from "./AnalyticsView";
import { ProcessingView } from "./ProcessingView";
import { ResultsView } from "./ResultsView";
import { UploadView } from "./UploadView";
import { USD_TO_IDR } from "@/lib/config";
import { Badge, Currency, api, setCurrency, useMetrics } from "./ui";

const TABS = ["Upload", "Processing", "Results", "Analytics"] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>("Upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [mode, setMode] = useState<"live" | "mock">("mock");
  const m = useMetrics(jobId);
  const [currency, setCur] = useState<Currency>("USD");
  setCurrency(currency); // module-level, read by money() while children render below
  useEffect(() => { try { const c = localStorage.getItem("jev.currency"); if (c === "IDR" || c === "USD") setCur(c); } catch {} }, []);
  const pick = (c: Currency) => { setCur(c); try { localStorage.setItem("jev.currency", c); } catch {} };

  useEffect(() => {
    api("/api/health").then((h) => setMode(h.mode)).catch(() => {});
    api("/api/jobs").then((j) => {
      setJobs(j);
      let saved: string | null = null;
      try { saved = localStorage.getItem("jev.jobId"); } catch {}
      const pick = j.find((x: any) => x.id === saved) ?? j[0];
      if (pick) { setJobId(pick.id); setTab("Processing"); }
    }).catch(() => {});
  }, []);
  useEffect(() => { try { if (jobId) localStorage.setItem("jev.jobId", jobId); } catch {} }, [jobId]);
  const refreshJobs = () => api("/api/jobs").then(setJobs).catch(() => {});
  const simRun = m?.job.mode === "mock";

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Jev Message Triage</h1>
        <span className="text-xs text-slate-500">Fintech / digital banking · one Jev request per message</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${mode === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{mode === "live" ? "LIVE Jev API" : "SIMULATOR (no API key)"}</span>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <div role="group" aria-label="Currency" title={`Fixed rate: 1 USD = Rp${USD_TO_IDR.toLocaleString("id-ID")}`} className="flex overflow-hidden rounded border border-slate-300 text-xs font-medium">
            {(["USD", "IDR"] as const).map((c) => (
              <button key={c} aria-pressed={currency === c} onClick={() => pick(c)} className={`px-2.5 py-1 ${currency === c ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{c}</button>
            ))}
          </div>
          {jobId && m && <Badge s={m.job.status} />}
          <select className="max-w-xs rounded border border-slate-300 px-2 py-1" value={jobId ?? ""} onFocus={refreshJobs}
            onChange={(e) => { setJobId(e.target.value || null); setTab("Processing"); }}>
            <option value="">{jobs.length ? "Select a run…" : "No runs yet"}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name} · {j.done}/{j.total} · {j.mode === "mock" ? "simulated · " : ""}{new Date(j.created_at).toLocaleString()}</option>)}
          </select>
        </div>
      </header>
      {simRun && <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This run used the built-in simulator. Responses, latency and costs below are SIMULATED and are not Jev results.</div>}
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Upload" && <UploadView mode={mode} onStarted={(id) => { setJobId(id); setTab("Processing"); refreshJobs(); }} />}
      {tab !== "Upload" && !jobId && <p className="text-sm text-slate-500">Upload a dataset to begin.</p>}
      {tab !== "Upload" && jobId && !m && <p className="text-sm text-slate-500">Loading…</p>}
      {tab === "Processing" && jobId && m && <ProcessingView m={m} jobId={jobId} />}
      {tab === "Results" && jobId && m && <ResultsView m={m} jobId={jobId} />}
      {tab === "Analytics" && jobId && m && <AnalyticsView m={m} />}
    </div>
  );
}
