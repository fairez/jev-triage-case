export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
export const sortAsc = (a: number[]) => [...a].sort((x, y) => x - y);

export function classMetrics(pairs: { expected: string; actual: string }[]) {
  const labels = [...new Set(pairs.flatMap((p) => [p.expected, p.actual]))];
  const per = labels.map((l) => {
    const tp = pairs.filter((p) => p.expected === l && p.actual === l).length;
    const fp = pairs.filter((p) => p.expected !== l && p.actual === l).length;
    const fn = pairs.filter((p) => p.expected === l && p.actual !== l).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label: l, support: tp + fn, precision, recall, f1 };
  });
  const supported = per.filter((p) => p.support > 0);
  return {
    n: pairs.length,
    accuracy: pairs.length ? pairs.filter((p) => p.expected === p.actual).length / pairs.length : null,
    macroF1: supported.length ? supported.reduce((s, p) => s + p.f1, 0) / supported.length : null,
    perClass: per,
  };
}
