"use client";
import { USD_TO_IDR } from "@/lib/config";
import { Bars, Card, Kpi, Metrics, Table, dur, getCurrency, ms, num, pct, money } from "./ui";

type BD = Record<string, { n: number; inTok: number; outTok: number; cost: number }>;
function Breakdown({ title, data }: { title: string; data: BD }) {
  return (
    <Card title={title}>
      <Table head={["Group", "Msgs", "Tokens in", "Cost"]}>
        {Object.entries(data).sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => (
          <tr key={k}><td className="px-2 py-1">{k}</td><td className="px-2 py-1 tabular-nums">{num(v.n)}</td><td className="px-2 py-1 tabular-nums">{num(v.inTok)}</td><td className="px-2 py-1 tabular-nums">{money(v.cost)}</td></tr>
        ))}
      </Table>
    </Card>
  );
}

export function AnalyticsView({ m }: { m: Metrics }) {
  const k = m.cost, ev = m.evaluation, sim = m.job.mode === "mock";
  return (
    <div className="space-y-4">
      <Card title="Pricing">
        <p className="text-sm">Input {money(k.rate.input, 8)} / 1M tokens · Output {money(k.rate.output, 8)} / 1M tokens · rate set {new Date(k.rate.updatedAt).toLocaleString()}</p>
        {getCurrency() === "IDR" && <p className="text-xs text-slate-500">Converted at a fixed 1 USD = Rp{USD_TO_IDR.toLocaleString("id-ID")}. Billing is calculated in USD.</p>}
        <p className="mt-1 text-xs text-slate-500">Cost = input_tokens/1M × input price + output_tokens/1M × output price, from each response's <code>usage</code>. Rows without reported usage are billing-unknown, not zero.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Estimated before run" value={money(k.estimatedBeforeRun)} sub="~4 chars/token estimate" />
          <Kpi label={sim ? "Usage-based (SIMULATED)" : "Usage-based total"} value={money(k.total)} sub={`${num(m.tokens.input)} in / ${num(m.tokens.output)} out tokens`} warn={sim} />
          <Kpi label="Avg cost / message" value={money(k.avgPerMessage, 8)} sub={`${num(m.tokens.avgPerMessage, 1)} tokens/msg`} />
          <Kpi label="Cost / 1,000 messages" value={money(k.per1k)} sub={k.unknownBilling ? `${k.unknownBilling} rows billing unknown` : undefined} warn={k.unknownBilling > 0} />
        </div>
      </Card>

      <Card title="Projected cost at observed average usage">
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(k.projections).map(([n, v]) => <Kpi key={n} label={`${n} messages`} value={money(v as number | null)} />)}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Breakdown title="Cost by channel" data={k.byChannel} />
        <Breakdown title="Cost by intent" data={k.byIntent} />
        <Breakdown title="Cost by category" data={k.byCategory} />
      </div>

      <Card title="Latency & throughput (measured timestamps)">
        <Table head={["Phase", "Avg", "p50", "p95", "p99", "Max"]}>
          {([["Queue wait", m.queueWait], ["API inference", m.latency], ["End-to-end (incl. retries)", m.endToEnd]] as const).map(([n, s]) => (
            <tr key={n}><td className="px-2 py-1">{n}</td>{[s.avg, s.p50, s.p95, s.p99, s.max].map((v, i) => <td key={i} className="px-2 py-1 tabular-nums">{ms(v)}</td>)}</tr>
          ))}
        </Table>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Processing duration" value={dur(m.elapsedSec)} sub="active time, excludes pauses" />
          <Kpi label="Effective throughput" value={`${m.throughput.effective.toFixed(2)} msg/s`} />
          <Kpi label="API error rate" value={pct(m.reliability.errorRate)} sub={`${m.reliability.failedAttempts} of ${m.reliability.attempts} attempts`} />
          <Kpi label="Retry rate" value={pct(m.reliability.retryRate)} sub={`${m.reliability.retriedRows} rows retried`} />
        </div>
        {Object.keys(m.reliability.errorKinds).length > 0 && <div className="mt-3"><div className="mb-1 text-xs text-slate-500">Final failures by kind</div><Bars data={m.reliability.errorKinds} color="#e11d48" /></div>}
      </Card>

      <Card title="Quality vs ground truth">
        {!ev.hasGroundTruth ? <p className="text-sm text-slate-500">No expected_intent / expected_category / expected_action columns supplied, so accuracy metrics are not available.</p> : (
          <>
            {sim && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">These scores measure the local simulator, not Jev.</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Intent accuracy" value={pct(ev.intent.accuracy)} sub={`macro-F1 ${pct(ev.intent.macroF1)} · n=${ev.intent.n}`} />
              <Kpi label="Category accuracy" value={pct(ev.category.accuracy)} sub={`macro-F1 ${pct(ev.category.macroF1)} · n=${ev.category.n}`} />
              <Kpi label="Action accuracy" value={pct(ev.action.accuracy)} sub={`macro-F1 ${pct(ev.action.macroF1)} · n=${ev.action.n}`} />
              <Kpi label="Routing agreement" value={pct(ev.routingAgreement)} sub="final action = expected_action" />
              <Kpi label="Complaint recall" value={pct(ev.complaintRecall)} sub={`${ev.complaintSupport} expected complaints`} />
              <Kpi label="Security-warning recall" value={pct(ev.securityRecall)} sub={`${ev.securitySupport} expected escalations`} />
              <Kpi label="Routed correctly, no manual review" value={pct(ev.routedCorrectlyNoReview)} />
              <Kpi label="Human-review rate" value={pct(ev.humanReviewRate)} sub={`${ev.overrides} reviewer corrections`} />
            </div>
            <div className="mt-4"><div className="mb-1 text-xs font-medium text-slate-600">Intent per-class</div>
              <Table head={["Class", "Support", "Precision", "Recall", "F1"]}>
                {ev.intent.perClass.filter((c) => c.support > 0).map((c) => <tr key={c.label}><td className="px-2 py-1 capitalize">{c.label}</td><td className="px-2 py-1">{c.support}</td><td className="px-2 py-1">{pct(c.precision)}</td><td className="px-2 py-1">{pct(c.recall)}</td><td className="px-2 py-1">{pct(c.f1)}</td></tr>)}
              </Table></div>
          </>
        )}
      </Card>
    </div>
  );
}
