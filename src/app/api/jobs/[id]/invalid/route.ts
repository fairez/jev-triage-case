import { db } from "@/lib/db";
import { guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = guard((_: Request, { params }: { params: { id: string } }) =>
  json((db().prepare("SELECT line, reason, data FROM invalid_rows WHERE job_id = ? ORDER BY line").all(params.id) as any[]).map((r) => ({ ...r, data: JSON.parse(r.data) }))));
