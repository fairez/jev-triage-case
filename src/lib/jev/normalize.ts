import { QUESTIONS } from "../catalog";
import { JevError, JevResponse, TsResponse } from "./types";

// Convert TypeSafe `answers` into the normalized judgments the app uses.
export function normalizeResponse(r: TsResponse): JevResponse {
  if (!r || typeof r !== "object" || !r.answers || typeof r.answers !== "object") {
    throw new JevError("Malformed response: missing answers", "parse", false);
  }
  const judgments: JevResponse["judgments"] = {};
  for (const key of Object.keys(QUESTIONS)) {
    const a = r.answers[key];
    if (!a) continue;
    if (a.type === "noul") judgments[key] = { probability: a.noul };
    else if (a.type === "choice") judgments[key] = { value: a.choice, confidence: a.confidence, distribution: a.probabilities };
    else if (a.type === "score") {
      // Score levels come back as ordered numeric keys; map each level to the name in our criteria.
      const q = QUESTIONS[key];
      const levels = q.type === "score" ? q.criteria : [];
      const keys = Object.keys(a.probabilities).sort((x, y) => Number(x) - Number(y));
      const top = keys.reduce((b, k) => (a.probabilities[k] > a.probabilities[b] ? k : b), keys[0]);
      const name = (i: number) => levels[i]?.split(":")[0] ?? String(i);
      const distribution = Object.fromEntries(keys.map((k, i) => [name(i), a.probabilities[k]]));
      judgments[key] = { value: name(keys.indexOf(top)), confidence: a.confidence, distribution };
    }
  }
  return { model: r.model, model_version: r.model, judgments, usage: r.usage };
}
