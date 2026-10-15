# Jev Incoming Message Triage — Demo Specification

**Version:** 0.2  
**Industry:** Fintech / Digital Banking  
**Purpose:** Evaluate Jev's speed, classification accuracy, routing decisions, and actual API costs using a one-time uploaded dataset.

## 1. Demo workflow

**Upload File → Validate Rows → Start Replay → Process Each Row → Display Results → Calculate Costs**

- No live channel integration is required.
- All messages are uploaded once through CSV or XLSX.
- Each row represents one incoming message from a banking communication channel.
- Each row triggers **one independent Jev API request** containing all required classification questions.
- Multiple rows may run concurrently, but they must not be combined into one Jev request.
- The UI updates progressively as responses arrive.
- Processing can be paused, resumed, or retried without re-uploading the file.
- All results, timestamps, costs, and failures are retained for analysis.

## 2. Screen A — Dataset Upload

### UI components

- File upload: CSV / XLSX.
- Sample dataset download.
- Dataset preview: first 10–20 rows.
- Column mapping and validation.
- Summary of rows, channel distribution, and missing values.
- Estimated API cost before processing.
- **Start Processing** action.

### Input schema

| Column | Required | Description |
|---|---|---|
| `message_id` | Yes | Unique message ID |
| `channel` | Yes | WhatsApp, Instagram, email, etc. |
| `message_text` | Yes | Incoming message |
| `message_type` | No | Comment, DM, chat, review |
| `conversation_context` | No | Relevant preceding messages |
| `customer_type` | No | Prospect, existing, unknown |
| `expected_intent` | No | Ground-truth label for evaluation |
| `expected_category` | No | Expected complaint/sales category |
| `expected_action` | No | Expected next action |

Use UTF-8 text and preserve Indonesian and mixed-language characters. Invalid rows should be displayed and excluded without blocking valid rows.

## 3. Screen B — Processing Configuration

| Setting | Default |
|---|---|
| Model | `jev-latest` |
| Processing mode | One Jev request per row |
| Concurrent requests | 5 |
| Concurrency choices | 1, 5, 10, 20 |
| Confidence threshold | 0.80, configurable |
| Maximum retries | 3 for transient errors |
| API timeout | 10 seconds, configurable |
| Input token price | $0.042 / 1M tokens |
| Output token price | $0 |

The concurrency setting controls simultaneous independent requests. It must not change what each row sends to Jev.

Honor provider rate limits with bounded concurrency, exponential backoff, and jitter. Persist job and row states to support pause/resume.

## 4. Jev Classification

For each row, prepare a normalized state containing the message, channel metadata, and relevant conversation context.

Use one `/v1/systemone` request with these judgments:

| Judgment | Type | Values |
|---|---|---|
| Primary intent | Choice | Sales, Complaint, Inquiry, Feedback, Spam, Other |
| Sales opportunity | Noul | Probability 0–1 |
| Complaint indicator | Noul | Probability 0–1 |
| Complaint category | Choice | Payment, Account, App, Card, Fees, Lending, Fraud, Service, Other, None |
| Sales category | Choice | Account Opening, Deposits, Payments, Financing, Business Banking, Other, None |
| Urgency | Score | Routine, Medium, High, Critical |
| Security concern | Noul | Probability 0–1 |
| Proposed next action | Choice | Sales Follow-up, Complaint Ticket, Security Escalation, Request Information, FAQ, Public-to-Private, Human Review, No Action |

Sales and complaint judgments remain independent to support mixed-intent messages.

The decision engine applies routing policies after Jev returns, including security escalation and restrictions on responding to public comments.

## 5. Screen C — Live Processing Monitor

### Header KPI cards

- Total uploaded messages
- Processed / pending / failed
- Completion percentage
- Elapsed wall-clock time
- Average inference latency
- p50 / p95 / p99 inference latency
- Current throughput (messages/second)
- Accumulated input/output tokens
- Total Jev API cost

### Progress visualization

Show:

- Overall progress bar.
- Completed, processing, queued, and failed counts.
- Rolling requests/second chart.
- Latency trend.
- Cumulative API cost.
- Intent and complaint category distribution.

### Live results table

| Column | Description |
|---|---|
| ID | Original `message_id` |
| Channel | Message source |
| Message | Original message text |
| Intent | Jev primary classification |
| Category | Sales/complaint category |
| Confidence | Selected Choice confidence |
| Urgency | Jev urgency judgment |
| Next action | Final action after policy engine |
| Latency | Individual Jev request duration |
| Tokens | Billable input token count |
| Cost | Estimated USD cost from usage |
| Status | Pending / Running / Success / Failed |

Selecting a row opens a detail panel containing the original input, normalized context, all Jev judgments, confidence distributions, final routing decision, raw API response, and error details.

### Processing controls

- Start / Pause / Resume
- Stop remaining queue
- Retry failed rows
- Filter by category, channel, status, and confidence
- Export results to CSV / XLSX

No customer-facing actions are executed. Ticket creation, CRM routing, and escalations are simulated and logged.

## 6. Screen D — Cost & Performance Analytics

### Cost calculation

Use Jev's actual `usage.input_tokens` and `usage.output_tokens` from each API response.

**Jev request cost = (input_tokens / 1,000,000) × input_token_price + (output_tokens / 1,000,000) × output_token_price**

At published pricing:

- Input: $0.042 per million tokens.
- Output: $0.
- Currency: USD.

The dashboard must distinguish estimated cost before execution from usage-based cost after execution.

### Required cost analytics

- Total Jev API cost per run.
- Total input and output tokens.
- Average cost per message.
- Cost per 1,000 messages.
- Average tokens per message.
- Cost breakdown by channel, intent, and category.
- Projected cost for 10K / 100K / 1M messages at observed average usage.

Show the configured pricing rate and timestamp. Allow rate adjustment for account-specific pricing.

If a request fails without reported usage, mark its billing as unknown rather than assuming zero.

### Performance analytics

- Inference latency p50 / p95 / p99.
- Overall processing duration.
- Effective throughput.
- API error and retry rates.
- Accuracy and macro-F1 when ground-truth labels are supplied.
- Complaint recall and security-warning recall.
- Routing agreement against `expected_action`.

Separate queue waiting time, network/API inference time, and end-to-end row processing time.

## 7. Processing Logic

1. Upload and validate dataset.
2. Assign each row a persistent job status.
3. Add valid rows to processing queue.
4. Start configurable worker concurrency.
5. Each worker takes exactly one message row.
6. Build Jev state from that row and its available context.
7. Submit one Jev request containing all judgment questions.
8. Record timestamps, response, usage, and errors.
9. Apply deterministic action-routing policy.
10. Save processed result and update dashboard.
11. Continue until all rows reach a terminal state.
12. Generate summary and downloadable results.

Use unique request IDs, retry counters, and model/decision-catalog versions to make the experiment reproducible.

## 8. Acceptance Criteria

- Upload 1,000–10,000 messages in a single file.
- Process every valid row independently through Jev.
- Dashboard updates progressively without refreshing.
- Processing can pause and resume without losing completed results.
- Every completed request stores actual token usage and calculated cost.
- Failed requests can be retried individually.
- p50, p95, throughput, and total processing time are calculated from measured timestamps.
- Results can be filtered, inspected, corrected, and exported.
- No simulated response is counted as a real Jev response.
- The application remains usable if some API requests fail.

**Primary success metrics:** classification quality, inference latency, cost per 1,000 messages, and percentage of messages routed correctly without manual review.

## 9. Suggested Implementation

- **Frontend:** React / Next.js with Tailwind CSS.
- **Backend:** Node.js or Python, using the TypeSafe SDK or HTTP API.
- **Storage:** SQLite for a single-instance demo, or PostgreSQL if deploying with multiple workers.
- **Job orchestration:** Persistent queue with configurable worker concurrency.
- **Live updates:** Server-Sent Events or short-interval polling.
- **Secrets:** TypeSafe API key stored server-side only.

No customer authentication, CRM integration, core banking connectivity, or live social-media webhooks are necessary for this version.

Build it as a single demo application with Upload, Processing, Results, and Analytics views.
