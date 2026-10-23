// Usage: npx tsx --env-file=.env.local scripts/eval.ts <labeled.csv> [concurrency]
// Sends each row through the same request builder, client and policy as the app, then
// scores intent / category / final action against the expected_* columns (no DB writes).
import fs from "node:fs";
import Papa from "papaparse";
import { buildRequest, callJev } from "../src/lib/jev/client";
import { normalizeState } from "../src/lib/normalize";
import { applyPolicy } from "../src/lib/policy";
import { defaultConfig } from "../src/lib/config";

const file = process.argv[2];
const conc = Number(process.argv[3] ?? 10);
const rows = Papa.parse<Record<string, string>>(fs.readFileSync(file, "utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
const cfg = defaultConfig();
const lc = (s?: string | null) => (s ?? "").trim().toLowerCase();

async function main() {
  const out: { row: Record<string, string>; resp: Awaited<ReturnType<typeof callJev>>["response"] | null }[] = [];
  let next = 0, tokens = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < rows.length) {
      const row = rows[next++];
      const state = normalizeState({ ...row, message_text: row.message_text } as any);
      for (let a = 0; a < 4; a++) {
        try {
          const r = await callJev(buildRequest(cfg.model, state), cfg.timeoutMs);
          tokens += r.response.usage?.input_tokens ?? 0;
          out.push({ row, resp: r.response });
          break;
        } catch (e: any) {
          if (!e.retryable || a === 3) { out.push({ row, resp: null }); break; }
          await new Promise((r) => setTimeout(r, 800 * 2 ** a));
        }
      }
    }
  }));
  const ok = out.filter((o) => o.resp);
  console.log(`rows ${rows.length}, answered ${ok.length}, input tokens ${tokens} (~$${((tokens / 1e6) * 0.042).toFixed(5)})`);
  fs.writeFileSync(file.replace(/\.csv$/, "") + ".eval.json", JSON.stringify(out));

  for (const threshold of [0.8, 0.6, 0.5, 0.4, 0.3, 0]) {
    const res = ok.map((o) => ({ o, p: applyPolicy({ response: o.resp!, messageType: o.row.message_type, threshold }) }));
    const acc = (e: string, g: (x: (typeof res)[number]) => string) => {
      const l = res.filter((x) => x.o.row[e]);
      return ((l.filter((x) => lc(x.o.row[e]) === lc(g(x))).length / l.length) * 100).toFixed(1);
    };
    console.log(`threshold ${threshold}: intent ${acc("expected_intent", (x) => x.p.intent)}%  category ${acc("expected_category", (x) => x.p.category)}%  action ${acc("expected_action", (x) => x.p.finalAction)}%`);
  }
  const t = Number(process.env.EVAL_THRESHOLD ?? cfg.confidenceThreshold);
  console.log(`\nMismatches at threshold ${t}:`);
  for (const [e, g] of [["expected_intent", (p: any) => p.intent], ["expected_category", (p: any) => p.category], ["expected_action", (p: any) => p.finalAction]] as const) {
    const m: Record<string, number> = {};
    for (const o of ok) {
      const p = applyPolicy({ response: o.resp!, messageType: o.row.message_type, threshold: t });
      if (o.row[e] && lc(o.row[e]) !== lc(g(p))) m[`${o.row[e]} -> ${g(p)}`] = (m[`${o.row[e]} -> ${g(p)}`] ?? 0) + 1;
    }
    console.log(`\n${e}:`, Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} (${v})`).join("; "));
  }
}
main();
