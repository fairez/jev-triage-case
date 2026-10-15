import { db } from "@/lib/db";
import { getJob } from "@/lib/jobs";
import { buildWhere, shapeRow } from "@/lib/rows";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

const SORTS: Record<string, string> = { seq: "seq", latency: "latency_ms", confidence: "confidence", cost: "input_tokens", finished: "finished_at" };

export const GET = guard((req: Request, { params }: { params: { id: string } }) => {
  const job = getJob(params.id);
  if (!job) return fail("Job not found", 404);
  const sp = new URL(req.url).searchParams;
  const { where, args } = buildWhere(params.id, sp);
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const size = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 50)));
  const col = SORTS[sp.get("sort") ?? "seq"] ?? "seq";
  const dir = sp.get("dir") === "desc" ? "DESC" : "ASC";
  const d = db();
  const total = (d.prepare(`SELECT COUNT(*) c FROM rows WHERE ${where}`).get(...args) as { c: number }).c;
  const rows = d.prepare(`SELECT * FROM rows WHERE ${where} ORDER BY ${col} ${dir}, seq LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
  const facets = {
    channels: (d.prepare("SELECT DISTINCT channel c FROM rows WHERE job_id = ? ORDER BY c").all(params.id) as any[]).map((r) => r.c),
    categories: (d.prepare("SELECT DISTINCT category c FROM rows WHERE job_id = ? AND category IS NOT NULL ORDER BY c").all(params.id) as any[]).map((r) => r.c),
    intents: (d.prepare("SELECT DISTINCT intent c FROM rows WHERE job_id = ? AND intent IS NOT NULL ORDER BY c").all(params.id) as any[]).map((r) => r.c),
  };
  return json({ total, page, pageSize: size, rows: rows.map((r) => shapeRow(r, job.config)), facets });
});
