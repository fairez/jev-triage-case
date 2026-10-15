export interface JevState {
  message: string;
  channel: string;
  message_type?: string;
  customer_type?: string;
  conversation_context?: string;
}

// Wire format of POST /v1/systemone (https://docs.typesafe.ai/api).
export type TsAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend?: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface TsResponse {
  model?: string;
  answers: Record<string, TsAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// Normalized view used by the policy engine and UI.
export interface JevJudgmentResult {
  value?: string;
  confidence?: number;
  probability?: number;
  distribution?: Record<string, number>;
}

export interface JevResponse {
  model?: string;
  model_version?: string;
  judgments: Record<string, JevJudgmentResult>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface JevCallResult {
  response: JevResponse;
  raw: string;
  latencyMs: number;
  source: "live" | "mock";
}

export class JevError extends Error {
  constructor(
    message: string,
    public kind: "timeout" | "rate_limit" | "server" | "network" | "client" | "parse",
    public retryable: boolean,
    public status?: number,
    public retryAfterMs?: number,
    public latencyMs?: number,
    public raw?: string,
  ) {
    super(message);
  }
}
