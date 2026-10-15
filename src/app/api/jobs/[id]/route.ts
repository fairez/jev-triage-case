import { computeMetrics } from "@/lib/metrics";
import { updateConfig } from "@/lib/jobs";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

export const GET = guard((_: Request, { params }: { params: { id: string } }) => {
  const m = computeMetrics(params.id);
  return m ? json(m) : fail("Job not found", 404);
});

export const PATCH = guard(async (req: Request, { params }: { params: { id: string } }) => {
  try { return json(updateConfig(params.id, await req.json())); }
  catch (e) { return fail((e as Error).message); }
});
