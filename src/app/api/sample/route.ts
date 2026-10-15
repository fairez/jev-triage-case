import { sampleCsv } from "@/lib/sample";
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(sampleCsv(), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="jev-sample-messages.csv"' } });
}
