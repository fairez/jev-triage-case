import { validate, Mapping } from "@/lib/ingest";
import { createJob, getDataset, listJobs } from "@/lib/jobs";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

export const GET = guard(() => json(listJobs()));

export const POST = guard(async (req: Request) => {
  const b = (await req.json()) as { datasetId: string; mapping: Mapping; config?: object; name?: string };
  const ds = getDataset(b.datasetId);
  if (!ds) return fail("Dataset not found", 404);
  const v = validate(ds.rows, b.mapping);
  if (v.missingCols.length) return fail(`Required columns not mapped: ${v.missingCols.join(", ")}`);
  if (!v.valid.length) return fail("No valid rows to process");
  const id = createJob({ datasetId: ds.id, name: b.name || ds.name, mapping: b.mapping, config: b.config, valid: v.valid, invalid: v.invalid, estInputTokens: v.estInputTokens });
  return json({ jobId: id, valid: v.valid.length, invalid: v.invalid.length });
});
