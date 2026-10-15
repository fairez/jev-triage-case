"use client";
import { useState } from "react";
import { CONCURRENCY_CHOICES } from "@/lib/config";
import { Badge, Bars, Btn, Card, Kpi, LineChart, Metrics, dur, ms, num, patch, post, money, getCurrency } from "./ui";

export function ProcessingView({ m, jobId }: { m: Metrics; jobId: string }) {
  const [err, setErr] = useState("");
  const s = m.job.status, c = m.counts;
  const act = async (action: string) => { setErr(""); try { await post(`/api/jobs/${jobId}/control`, { action }); } catch (e) { setErr((e as Error).message); } };
  const cfg = (p: object) => patch(`/api/jobs/${jobId}`, p).catch((e) => setErr(e.message));
  const sim = m.job.mode === "mock";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge s={s} />
          <span className="text-sm text-slate-600">{m.job.name}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            {(s === "draft") && <Btn kind="primary" onClick={() => act("start")}>Start</Btn>}
            {s === "running" && <Btn onClick={() => act("pause")}>Pause</Btn>}
            {s === "paused" && <Btn kind="primary" onClick={() => act("resume")}>Resume</Btn>}
            <Btn kind="danger" disabled={!(s === "running" || s === "paused") || c.pending === 0} onClick={() => confirm("Cancel all queued rows?") && act("stop")}>Stop remaining queue</Btn>
            <Btn disabled={c.failed + c.cancelled === 0} onClick={() => act("retry_failed")}>Retry failed ({c.failed + c.cancelled})</Btn>
            <label className="flex items-center gap-1 text-sm text-slate-600">Concurrency
              <select className="rounded border border-slate-300 px-1 py-1" value={m.job.config.concurrency} onChange={(e) => cfg({ concurrency: +e.target.value })}>
                {CONCURRENCY_CHOICES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </span>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-3">
          <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
            <div className="flex h-3">
              <div className="bg-emerald-500" style={{ width: `${(c.success / c.total) * 100}%` }} />
              <div className="bg-rose-500" style={{ width: `${((c.failed + c.cancelled) / c.total) * 100}%` }} />
              <div className="bg-sky-400" style={{ width: `${(c.running / c.total) * 100}%` }} />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
            <span>Completed {num(c.success)}</span><span>Processing {num(c.running)}</span><span>Queued {num(c.pending)}</span>
            <span className={c.failed ? "text-rose-600" : ""}>Failed {num(c.failed)}</span>{c.cancelled > 0 && <span>Cancelled {num(c.cancelled)}</span>}
            <span className="ml-auto font-medium">{m.completionPct.toFixed(1)}%</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        <Kpi label="Total uploaded" value={num(c.total)} />
        <Kpi label="Processed / pending / failed" value={`${num(c.success)} / ${num(c.pending + c.running)} / ${num(c.failed)}`} />
        <Kpi label="Elapsed (active)" value={dur(m.elapsedSec)} />
        <Kpi label="Avg inference latency" value={ms(m.latency.avg)} />
        <Kpi label="p50 / p95 / p99" value={`${ms(m.latency.p50)} / ${ms(m.latency.p95)} / ${ms(m.latency.p99)}`} />
        <Kpi label="Throughput now" value={`${m.throughput.current.toFixed(2)} /s`} sub={`effective ${m.throughput.effective.toFixed(2)} /s`} />
        <Kpi label="Input tokens" value={num(m.tokens.input)} />
        <Kpi label="Output tokens" value={num(m.tokens.output)} />
        <Kpi label={sim ? "Cost (SIMULATED)" : "Total Jev API cost"} value={money(m.cost.total)} sub={m.cost.unknownBilling ? `${m.cost.unknownBilling} rows billing unknown` : "usage-based"} warn={sim || m.cost.unknownBilling > 0} />
        <Kpi label="Error rate (attempts)" value={`${(m.reliability.errorRate * 100).toFixed(1)}%`} sub={`${m.reliability.retriedRows} rows retried`} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Requests / second"><LineChart data={m.series.map((p) => ({ x: p.t, y: p.rps }))} color="#4f46e5" /></Card>
        <Card title="Avg latency (ms) per 5 s"><LineChart data={m.series.map((p) => ({ x: p.t, y: p.avgLatency }))} color="#0891b2" format={(v) => Math.round(v) + " ms"} /></Card>
        <Card title={`Cumulative cost (${getCurrency()})`}><LineChart data={m.series.map((p) => ({ x: p.t, y: p.cumCost }))} color="#059669" format={(v) => money(v)} /></Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Intent distribution"><Bars data={m.distributions.intent} /></Card>
        <Card title="Category distribution"><Bars data={m.distributions.category} color="#d97706" /></Card>
        <Card title="Final routing (after policy)"><Bars data={m.distributions.action} color="#7c3aed" /></Card>
      </div>
    </div>
  );
}
