import { getMode } from "@/lib/config";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export function GET() {
  return json({ mode: getMode(), baseUrl: getMode() === "live" ? process.env.JEV_BASE_URL ?? null : null });
}
