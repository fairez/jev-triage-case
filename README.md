# Jev Incoming Message Triage — Demo

Upload a CSV/XLSX of banking messages, send each row as one independent Jev `/v1/systemone` request, watch results stream in, and get usage-based cost and performance analytics. Full requirements: [SPEC.md](SPEC.md).

## Run

```bash
npm install
cp .env.example .env.local   # add JEV_API_KEY and JEV_BASE_URL
npm run dev                  # http://localhost:3000
npm test
npm run gen:sample -- 3000 data/sample-3000.csv   # large test dataset
```

Without `JEV_API_KEY` the app runs a **local simulator**. Every simulated row is stored with `source = "mock"`, the UI shows a SIMULATED banner, and exports label billing as `simulated`. Simulated output is never presented as a Jev response.

## Stack

Next.js 14 (App Router) + Tailwind, SQLite (`better-sqlite3`), in-process persistent worker queue, SSE for live updates. The API key is read server-side only.

## Layout

| Path | Purpose |
|---|---|
| `src/lib/catalog.ts` | The 8 judgments sent per request, label sets, catalog version |
| `src/lib/jev/client.ts` | **Jev HTTP adapter**. Request/response contract lives here |
| `src/lib/jev/mock.ts` | Simulator (only when no API key) |
| `src/lib/engine.ts` | Worker pool: bounded concurrency, retries with exponential backoff + jitter, shared 429 cooldown, pause/resume/stop/retry, crash recovery |
| `src/lib/policy.ts` | Deterministic post-Jev routing (security escalation, public-comment rule, low confidence, mixed intent) |
| `src/lib/metrics.ts` | KPIs, percentiles, throughput, cost, projections, accuracy/macro-F1/recall |
| `src/lib/ingest.ts` | CSV/XLSX parsing, column mapping, row validation |
| `src/app/api/**` | REST + SSE endpoints |
| `src/components/**` | Upload, Processing, Results, Analytics views |

## Jev API contract

Follows https://docs.typesafe.ai/api. Code: `src/lib/jev/client.ts`, `normalize.ts`, `types.ts`; questions in `src/lib/catalog.ts`.

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $JEV_API_KEY
{ "model": "jev-latest",
  "state": { "message", "channel", "message_type?", "customer_type?", "conversation_context?" },
  "questions": { "<key>": { "type": "choice|noul|score", "instructions": "...", "criteria": ... } } }

200 { "model": "jev-1.13.0",
      "answers": { "<key>": { "type": "noul", "noul": 0..1 }
                 | { "type": "choice", "choice", "probabilities", "confidence" }
                 | { "type": "score", "score", "legend", "probabilities", "confidence" } },
      "usage": { "input_tokens", "output_tokens" } }
```

Eight questions per row (intent, sales/complaint probability, complaint/sales category, urgency score, security probability, next action). Retryable: 429, 529/5xx, 408, timeouts, network errors. Not retryable: other 4xx (400/401/413/415/422), unparseable body.

## Behavior notes

- One request per row; concurrency only changes how many run at once.
- Cost = tokens from each response's `usage` × the job's price. Price is editable per run; cost is recomputed from stored tokens. Rows with no reported usage are *billing unknown*, never $0.
- Pre-run cost is an estimate (~4 chars/token) and is labeled as such.
- Pause stops new requests (in-flight ones finish). Elapsed time excludes paused time. After a server restart, interrupted jobs come back as **paused** and resume from the queue.
- Reviewer corrections are stored beside the original output; accuracy metrics always score the original Jev output.
- Ticket creation / CRM / escalations are only recorded as simulated side effects.
- Single-instance design (one Node process owns the queue). For multiple workers, move to PostgreSQL and a shared queue.
