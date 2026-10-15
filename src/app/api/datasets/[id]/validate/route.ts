import { Mapping, validate } from "@/lib/ingest";
import { getDataset } from "@/lib/jobs";
import { defaultConfig } from "@/lib/config";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

export const POST = guard(async (req: Request, { params }: { params: { id: string } }) => {
  const ds = getDataset(params.id);
  if (!ds) return fail("Dataset not found", 404);
  const { mapping } = (await req.json()) as { mapping: Mapping };
  const v = validate(ds.rows, mapping);
  const cfg = defaultConfig();
  return json({
    total: ds.rows.length, validCount: v.valid.length, invalidCount: v.invalid.length,
    invalid: v.invalid.slice(0, 200), channels: v.channels, missingValues: v.missingValues, missingCols: v.missingCols,
    estInputTokens: v.estInputTokens, estCostUsd: (v.estInputTokens / 1e6) * cfg.inputPricePerM,
    estimateNote: "Estimate assumes ~4 characters per token. Actual cost uses usage returned by Jev.",
  });
});
