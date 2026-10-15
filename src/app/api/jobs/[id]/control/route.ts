import { control } from "@/lib/engine";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

export const POST = guard(async (req: Request, { params }: { params: { id: string } }) => {
  const { action, rowPk } = (await req.json()) as { action: string; rowPk?: number };
  try { control(params.id, action, rowPk); return json({ ok: true }); }
  catch (e) { return fail((e as Error).message); }
});
