// Pure statistics helpers for the center-and-spread visualization (no DOM).
export const TRUE_MU = 5, TRUE_SIGMA = 1.5;
export const MAD_TO_SIGMA = 1.4826;     // 1 / Phi^-1(3/4)
export const IQR_TO_SIGMA = 1.34898;    // 2 * Phi^-1(3/4)

// ---------- random numbers ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randn(rng) {
  let u = 0; while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
export const rcauchy = (rng, loc, scale) => loc + scale * Math.tan(Math.PI * (rng() - 0.5));

// ---------- normal helpers ----------
export const phi = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
export function Phi(z) { // Abramowitz-Stegun 7.1.26 erf
  const s = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}
// sd of a standard normal truncated to [-k, k]; sigma_clipped_sd / this = sigma estimate
export const truncSdFactor = (k) => Math.sqrt(Math.max(1e-12, 1 - 2 * k * phi(k) / (2 * Phi(k) - 1)));

// ---------- data generation ----------
// Mixture: with prob 1-f, N(5, 1.5^2); with prob f, Cauchy(location 5, scale gamma).
export function makeSample({ n, f, gamma, seed }) {
  const rng = mulberry32(seed);
  const x = new Float64Array(n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rng() < f) { out[i] = 1; x[i] = rcauchy(rng, TRUE_MU, gamma); }
    else x[i] = TRUE_MU + TRUE_SIGMA * randn(rng);
  }
  return { x, out };
}
// Measurements with a per-sample error bar s_i (log-normal around 1.5). Every
// sample measures the same true value 5: x_i = 5 + s_i z_i. Contaminated samples
// are Cauchy(5, s_i). If `honest`, a contaminated sample's quoted error is
// inflated to its actual miss |x_i - 5| (when that is bigger).
export function makeMeasured({ n, f, honest, seed }) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const x = new Float64Array(n), s = new Float64Array(n), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    s[i] = TRUE_SIGMA * Math.exp(0.6 * randn(rng));
    if (rng() < f) {
      out[i] = 1; x[i] = rcauchy(rng, TRUE_MU, s[i]);
      if (honest) s[i] = Math.max(s[i], Math.abs(x[i] - TRUE_MU));
    } else x[i] = TRUE_MU + s[i] * randn(rng);
  }
  return { x, s, out };
}

// ---------- basic estimators ----------
export const sum = (a) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t; };
export const mean = (a) => sum(a) / a.length;
export function sd(a) {
  if (a.length < 2) return NaN;
  const m = mean(a); let t = 0;
  for (let i = 0; i < a.length; i++) t += (a[i] - m) ** 2;
  return Math.sqrt(t / (a.length - 1));
}
export const sorted = (a) => Float64Array.from(a).sort();
// quantile of an ALREADY SORTED array (linear interpolation, "type 7")
export function quantileSorted(s, p) {
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const quantile = (a, p) => quantileSorted(sorted(a), p);
export const median = (a) => quantile(a, 0.5);
export function mad(a) { const m = median(a); return median(Float64Array.from(a, (v) => Math.abs(v - m))); }
export function trimmedMean(a, frac) {
  const s = sorted(a), k = Math.min(Math.floor(frac * s.length), Math.floor((s.length - 1) / 2));
  let t = 0; for (let i = k; i < s.length - k; i++) t += s[i];
  return t / (s.length - 2 * k);
}
// bundle of quantile-based summaries
export function robust(a) {
  const s = sorted(a), med = quantileSorted(s, 0.5);
  const q1 = quantileSorted(s, 0.25), q3 = quantileSorted(s, 0.75);
  const q16 = quantileSorted(s, 0.1587), q84 = quantileSorted(s, 0.8413);
  return { median: med, q1, q3, q16, q84,
    madSigma: MAD_TO_SIGMA * mad(a), iqrSigma: (q3 - q1) / IQR_TO_SIGMA, pctSigma: (q84 - q16) / 2 };
}

// ---------- sigma clipping ----------
// opts: k, cen 'mean'|'median', dev 'std'|'mad', maxIter
// returns steps[]: step 0 = all data; step i = after i clipping passes.
// each step: {mask, n, mu, sd, lo, hi}  (lo/hi = the cut that PRODUCED this mask; null at step 0)
export function sigmaClip(x, { k = 3, cen = 'mean', dev = 'std', maxIter = 10 } = {}) {
  const N = x.length;
  const stats = (mask) => {
    const v = []; for (let i = 0; i < N; i++) if (mask[i]) v.push(x[i]);
    const a = Float64Array.from(v);
    return { n: a.length, mu: mean(a), sd: sd(a),
      center: cen === 'median' ? median(a) : mean(a),
      scale: dev === 'mad' ? MAD_TO_SIGMA * mad(a) : sd(a) };
  };
  let mask = new Uint8Array(N).fill(1);
  let st = stats(mask);
  const steps = [{ mask, n: st.n, mu: st.mu, sd: st.sd, lo: null, hi: null, center: st.center, scale: st.scale }];
  for (let it = 0; it < maxIter; it++) {
    const lo = st.center - k * st.scale, hi = st.center + k * st.scale;
    const next = new Uint8Array(N); let changed = false;
    for (let i = 0; i < N; i++) { next[i] = mask[i] && x[i] >= lo && x[i] <= hi ? 1 : 0; if (next[i] !== mask[i]) changed = true; }
    if (!changed) break;
    mask = next; st = stats(mask);
    steps.push({ mask, n: st.n, mu: st.mu, sd: st.sd, lo, hi, center: st.center, scale: st.scale });
    if (st.n < 3) break;
  }
  return steps;
}

// ---------- weighted estimators (weights w_i = 1/s_i^2) ----------
export function weighted(x, s, mask) {
  let W = 0, W2 = 0, WX = 0, n = 0;
  for (let i = 0; i < x.length; i++) if (!mask || mask[i]) { const w = 1 / (s[i] * s[i]); W += w; W2 += w * w; WX += w * x[i]; n++; }
  const mu = WX / W;
  let chi2 = 0;
  for (let i = 0; i < x.length; i++) if (!mask || mask[i]) chi2 += (x[i] - mu) ** 2 / (s[i] * s[i]);
  return { mu, errMu: 1 / Math.sqrt(W),                         // formal error on the mean
    sdW: Math.sqrt(chi2 / (W - W2 / W)),                        // reliability-weighted std dev
    chi2red: chi2 / (n - 1), n, typicalErr: Math.sqrt(n / W) }; // sqrt(N / sum w): the rms-harmonic error bar
}
// clip points more than k of THEIR OWN error bars from the weighted mean, iterating
export function weightedClip(x, s, k = 3, maxIter = 10) {
  let mask = new Uint8Array(x.length).fill(1), st = weighted(x, s, mask);
  const steps = [{ mask, ...st }];
  for (let it = 0; it < maxIter; it++) {
    const next = new Uint8Array(x.length); let changed = false;
    for (let i = 0; i < x.length; i++) { next[i] = mask[i] && Math.abs(x[i] - st.mu) <= k * s[i] ? 1 : 0; if (next[i] !== mask[i]) changed = true; }
    if (!changed) break;
    mask = next; st = weighted(x, s, mask); steps.push({ mask, ...st });
  }
  return steps;
}

// ---------- repeated-trial comparison ----------
// For each outlier fraction, simulate `trials` samples and record |error| of each estimator.
export function simulate({ n, gamma, fracs, trials, seed }) {
  const names = ['mean / sd', 'median / MAD', '3σ clip (mean, sd)', '3σ clip (median, MAD)'];
  const res = fracs.map((f) => {
    const cErr = names.map(() => []), sErr = names.map(() => []);
    for (let t = 0; t < trials; t++) {
      const { x } = makeSample({ n, f, gamma, seed: seed + t * 7919 + Math.round(f * 1e4) });
      const r = robust(x);
      const c1 = sigmaClip(x, { k: 3, cen: 'mean', dev: 'std', maxIter: 10 }).pop();
      const c2 = sigmaClip(x, { k: 3, cen: 'median', dev: 'mad', maxIter: 10 }).pop();
      const cf = truncSdFactor(3);
      const est = [[mean(x), sd(x)], [r.median, r.madSigma], [c1.mu, c1.sd / cf], [c2.mu, c2.sd / cf]];
      est.forEach((e, j) => { cErr[j].push(Math.abs(e[0] - TRUE_MU)); sErr[j].push(Math.abs(e[1] - TRUE_SIGMA)); });
    }
    const q = (arr, p) => arr.map((a) => quantile(a, p));
    return { f, cMed: q(cErr, 0.5), c90: q(cErr, 0.9), sMed: q(sErr, 0.5), s90: q(sErr, 0.9) };
  });
  return { names, res };
}
