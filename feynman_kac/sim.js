// Pure simulation helpers for the Feynman-Kac Monte Carlo demo (no DOM).

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

// Wikipedia's worked example: dX_t = dt + sqrt(2) dW_t, payoff psi(x) = exp(-x^2) at T=1.
export const MU = 1, SIGMA = Math.SQRT2, T_HORIZON = 1, PAYOFF = (x) => Math.exp(-x * x);

// Exact solution of the convection-diffusion PDE (b=1, sigma=1), terminal condition exp(-x^2) at T=1.
export function exact(x, t) {
  const d = 5 - 4 * t;
  return Math.exp(-((1 - t + x) ** 2) / d) / Math.sqrt(d);
}

// Simulate `n` Euler-Maruyama paths of X from (x0, t0) to T_HORIZON with step `dt`.
// Returns per-path endpoints and, if `keepPaths`, a down-sampled trajectory for plotting.
export function simulate({ x0, t0, n, dt, seed, keepPaths = 0 }) {
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round((T_HORIZON - t0) / dt));
  const h = (T_HORIZON - t0) / steps;
  const sqrtH = Math.sqrt(h);
  const endpoints = new Float64Array(n);
  const paths = [];
  const t0start = performance.now();
  for (let i = 0; i < n; i++) {
    let x = x0;
    const track = i < keepPaths;
    const traj = track ? [x] : null;
    for (let s = 0; s < steps; s++) {
      x += MU * h + SIGMA * sqrtH * randn(rng);
      if (track) traj.push(x);
    }
    endpoints[i] = x;
    if (track) paths.push(traj);
  }
  const ms = performance.now() - t0start;
  return { endpoints, paths, steps, h, ms };
}

// Running Monte Carlo estimate of E[payoff(X_T)] at geometrically-spaced checkpoints of N,
// plus the standard error of the mean at each checkpoint (for a shrinking confidence band).
export function convergenceTrace(endpoints) {
  const n = endpoints.length;
  const checkpoints = [];
  for (let k = 8; k < n; k = Math.ceil(k * 1.15)) checkpoints.push(k);
  checkpoints.push(n);
  let sum = 0, sumSq = 0, next = 0;
  const trace = [];
  for (let i = 0; i < n; i++) {
    const v = PAYOFF(endpoints[i]);
    sum += v; sumSq += v * v;
    if (next < checkpoints.length && i + 1 === checkpoints[next]) {
      const N = i + 1, mean = sum / N, variance = Math.max(0, sumSq / N - mean * mean);
      trace.push({ N, mean, se: Math.sqrt(variance / N) });
      next++;
    }
  }
  return trace;
}
