import { db } from "@/lib/db";
import { ACTIONS, COMPLAINT_CATEGORIES, INTENTS, REQUEST_CATEGORIES, SALES_CATEGORIES } from "@/lib/catalog";
import { getJob } from "@/lib/jobs";
import { shapeRow } from "@/lib/rows";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

function load(id: string, pk: string) {
  return db().prepare("SELECT * FROM rows WHERE job_id = ? AND pk = ?").get(id, Number(pk)) as any;
}

export const GET = guard((_: Request, { params }: { params: { id: string; pk: string } }) => {
  const job = getJob(params.id), r = load(params.id, params.pk);
  if (!job || !r) return fail("Row not found", 404);
  const out: any = shapeRow(r, job.config, true);
  out.attemptLog = db().prepare("SELECT attempt, at, ok, retryable, latency_ms AS latencyMs, error FROM attempts WHERE job_id = ? AND row_pk = ? ORDER BY attempt").all(params.id, r.pk);
  return json(out);
});

// Reviewer correction. The original Jev output is kept; the correction is stored beside it.
export const PATCH = guard(async (req: Request, { params }: { params: { id: string; pk: string } }) => {
  const r = load(params.id, params.pk);
  if (!r) return fail("Row not found", 404);
  const b = (await req.json()) as { intent?: string; category?: string; action?: string; clear?: boolean };
  if (b.clear) { db().prepare("UPDATE rows SET correction = NULL WHERE pk = ?").run(r.pk); return json({ ok: true }); }
  const cats: readonly string[] = [...COMPLAINT_CATEGORIES, ...REQUEST_CATEGORIES, ...SALES_CATEGORIES];
  if (b.intent && !(INTENTS as readonly string[]).includes(b.intent)) return fail("Invalid intent");
  if (b.category && !cats.includes(b.category)) return fail("Invalid category");
  if (b.action && !(ACTIONS as readonly string[]).includes(b.action)) return fail("Invalid action");
  const prev = r.correction ? JSON.parse(r.correction) : {};
  const next = { ...prev, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v)), at: new Date().toISOString() };
  db().prepare("UPDATE rows SET correction = ? WHERE pk = ?").run(JSON.stringify(next), r.pk);
  return json({ ok: true, correction: next });
});
