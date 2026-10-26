/** Estatística simples usada pelas previsões: sem dependências e fácil de explicar ao gestor. */

export interface Regression {
  slope: number;
  intercept: number;
  /** Quanto da variação a reta explica (0 a 1). */
  r2: number;
  /** slope / erro padrão do slope: acima de ~2 a tendência dificilmente é acaso. */
  tStat: number;
  /** Valor da reta no último x. */
  last: number;
}

/** Regressão linear por mínimos quadrados. */
export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const residual = ys.reduce((sum, y, i) => sum + (y - (intercept + slope * xs[i])) ** 2, 0);
  const stderr = Math.sqrt(residual / Math.max(1, n - 2) / sxx);
  return {
    slope,
    intercept,
    r2: syy === 0 ? 0 : 1 - residual / syy,
    tStat: stderr === 0 ? (slope === 0 ? 0 : Infinity * Math.sign(slope)) : slope / stderr,
    last: intercept + slope * xs[n - 1],
  };
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Desvio robusto (MAD escalado): como o desvio padrão, mas não se deixa levar por dias atípicos,
 * que são justamente o que queremos detectar.
 */
export function robustSpread(values: number[]) {
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}
