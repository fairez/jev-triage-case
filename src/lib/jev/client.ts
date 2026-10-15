import { QUESTIONS, QuestionDef } from "../catalog";
import { getMode } from "../config";
import { mockCall } from "./mock";
import { normalizeResponse } from "./normalize";
import { JevCallResult, JevError, JevState } from "./types";

const DEFAULT_BASE_URL = "https://api.typesafe.ai";

// Request body of POST /v1/systemone: { model, state, questions }.
export interface JevRequestBody {
  model: string;
  state: JevState;
  questions: Record<string, QuestionDef>;
}

export function buildRequest(model: string, state: JevState): JevRequestBody {
  return { model, state, questions: QUESTIONS };
}

// Rough pre-run estimate (about 4 characters per token). Real cost always uses response usage.
export function estimateInputTokens(state: JevState): number {
  return Math.ceil(JSON.stringify(buildRequest("jev-latest", state)).length / 4);
}

export async function callJev(body: JevRequestBody, timeoutMs: number): Promise<JevCallResult> {
  if (getMode() === "mock") return mockCall(body, timeoutMs);

  const base = (process.env.JEV_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.JEV_API_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined;
      // 429 (rate limit) and 529 (overloaded) are the documented retryable errors.
      const kind = res.status === 429 ? "rate_limit" : res.status >= 500 ? "server" : "client";
      const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
      throw new JevError(`HTTP ${res.status}: ${text.slice(0, 300)}`, kind, retryable, res.status, retryAfterMs, latencyMs, text);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new JevError("Response was not valid JSON", "parse", false, res.status, undefined, latencyMs, text);
    }
    let response;
    try {
      response = normalizeResponse(parsed as never);
    } catch (e) {
      throw new JevError((e as Error).message, "parse", false, res.status, undefined, latencyMs, text);
    }
    return { response, raw: text, latencyMs, source: "live" };
  } catch (e) {
    if (e instanceof JevError) throw e;
    const latencyMs = Math.round(performance.now() - t0);
    if ((e as Error).name === "AbortError") {
      throw new JevError(`Timed out after ${timeoutMs} ms`, "timeout", true, undefined, undefined, latencyMs);
    }
    throw new JevError(`Network error: ${(e as Error).message}`, "network", true, undefined, undefined, latencyMs);
  } finally {
    clearTimeout(timer);
  }
}
