import { autoMap, parseFile } from "@/lib/ingest";
import { createDataset } from "@/lib/jobs";
import { fail, guard, json } from "@/lib/http";
export const dynamic = "force-dynamic";

export const POST = guard(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file uploaded");
  const { headers, rows } = await parseFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (!rows.length) return fail("File has no data rows");
  const id = createDataset(file.name, headers, rows);
  return json({ datasetId: id, name: file.name, headers, mapping: autoMap(headers), rowCount: rows.length, preview: rows.slice(0, 20) });
});
