import { computeMetrics } from "@/lib/metrics";
import { init } from "@/lib/http";
export const dynamic = "force-dynamic";

// Server-Sent Events: pushes a metrics snapshot once a second while the client is connected.
export function GET(req: Request, { params }: { params: { id: string } }) {
  init();
  const enc = new TextEncoder();
  let timer: NodeJS.Timeout;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = () => {
        try {
          const m = computeMetrics(params.id);
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch { /* client gone */ }
      };
      send();
      timer = setInterval(send, 1000);
      req.signal.addEventListener("abort", () => { clearInterval(timer); try { ctrl.close(); } catch {} });
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
