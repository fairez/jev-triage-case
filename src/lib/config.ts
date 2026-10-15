// Fixed reference rate for the IDR display toggle. Costs are always computed and stored in USD.
export const USD_TO_IDR = 18000;

export interface JobConfig {
  model: string;
  concurrency: number;
  confidenceThreshold: number;
  maxRetries: number;
  timeoutMs: number;
  inputPricePerM: number;
  outputPricePerM: number;
  pricingUpdatedAt: string;
}

export const CONCURRENCY_CHOICES = [1, 5, 10, 20];

export function defaultConfig(): JobConfig {
  return {
    model: "jev-latest",
    concurrency: 5,
    confidenceThreshold: 0.8,
    maxRetries: 3,
    timeoutMs: 10_000,
    inputPricePerM: 0.042,
    outputPricePerM: 0,
    pricingUpdatedAt: new Date().toISOString(),
  };
}

export function requestCost(inTok: number, outTok: number, c: Pick<JobConfig, "inputPricePerM" | "outputPricePerM">) {
  return (inTok / 1_000_000) * c.inputPricePerM + (outTok / 1_000_000) * c.outputPricePerM;
}

export function getMode(): "live" | "mock" {
  if (!process.env.JEV_API_KEY) return "mock";
  return process.env.JEV_MODE === "mock" ? "mock" : "live";
}
