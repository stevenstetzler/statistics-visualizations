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

// Running Monte Carlo estimate at geometrically-spaced checkpoints of N, given a per-path
// scalar value, plus the standard error of the mean at each checkpoint (shrinking band).
export function convergenceTrace(values) {
  const n = values.length;
  const checkpoints = [];
  for (let k = 8; k < n; k = Math.ceil(k * 1.15)) checkpoints.push(k);
  checkpoints.push(n);
  let sum = 0, sumSq = 0, next = 0;
  const trace = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v; sumSq += v * v;
    if (next < checkpoints.length && i + 1 === checkpoints[next]) {
      const N = i + 1, mean = sum / N, variance = Math.max(0, sumSq / N - mean * mean);
      trace.push({ N, mean, se: Math.sqrt(variance / N) });
      next++;
    }
  }
  return trace;
}

// ---------- section 2: a bare drift/diffusion widget, no cost ----------
export function driftDiffusionPaths({ x0, mu, sigma, n, dt, T = 1, seed }) {
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round(T / dt)), h = T / steps, sqrtH = Math.sqrt(h);
  const paths = [];
  for (let i = 0; i < n; i++) {
    let x = x0; const traj = [x];
    for (let s = 0; s < steps; s++) { x += mu * h + sigma * sqrtH * randn(rng); traj.push(x); }
    paths.push(traj);
  }
  return { paths, steps, h };
}

// ---------- section 2: cost meter along one path ----------
// f(x,s) = |x| (running cost grows with distance from 0); V(x,s) = decayRate (constant decay).
export function costMeterPath({ x0, mu, sigma, decayRate, dt, T = 1, seed }) {
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round(T / dt)), h = T / steps, sqrtH = Math.sqrt(h);
  let x = x0, cost = 0, discountExp = 0;
  const trace = [{ t: 0, x, cost, discount: 1 }];
  for (let s = 0; s < steps; s++) {
    cost += Math.abs(x) * h;
    discountExp += decayRate * h;
    x += mu * h + sigma * sqrtH * randn(rng);
    trace.push({ t: (s + 1) * h, x, cost, discount: Math.exp(-discountExp) });
  }
  return trace;
}

// ---------- section 4: martingale-flatness demo ----------
// Y_s = u(X_s, s) for the worked example (V=0, f=0, so the discount/cost terms are trivial).
export function martingaleDemo({ x0, t0, n, dt, seed, keep = 15 }) {
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round((T_HORIZON - t0) / dt)), h = (T_HORIZON - t0) / steps, sqrtH = Math.sqrt(h);
  const checkEvery = Math.max(1, Math.round(steps / 24));
  const checkpoints = []; for (let s = 0; s <= steps; s += checkEvery) checkpoints.push(s);
  if (checkpoints[checkpoints.length - 1] !== steps) checkpoints.push(steps);
  const sums = new Float64Array(checkpoints.length), sumSqs = new Float64Array(checkpoints.length);
  const sample = [];
  for (let i = 0; i < n; i++) {
    let x = x0; const track = i < keep, trace = track ? [{ t: t0, x: exact(x, t0) }] : null;
    let ci = 0;
    if (checkpoints[0] === 0) { const u = exact(x, t0); sums[0] += u; sumSqs[0] += u * u; ci = 1; }
    for (let s = 1; s <= steps; s++) {
      x += MU * h + SIGMA * sqrtH * randn(rng);
      const t = t0 + s * h;
      if (ci < checkpoints.length && checkpoints[ci] === s) {
        const u = exact(x, t); sums[ci] += u; sumSqs[ci] += u * u; ci++;
        if (track) trace.push({ t, x: u });
      }
    }
    if (track) sample.push(trace);
  }
  const checkpointsRes = checkpoints.map((s, i) => {
    const mean = sums[i] / n, variance = Math.max(0, sumSqs[i] / n - mean * mean);
    return { t: t0 + s * h, mean, se: Math.sqrt(variance / n) };
  });
  return { checkpoints: checkpointsRes, sample };
}

// ---------- section 6: exit-time / Dirichlet-problem demo ----------
// Pure Brownian motion (no drift) in the interval (a,b). Boundary payoff psi(a)=0, psi(b)=1.
// Exact solution (harmonic in 1D => linear): u(x) = (x-a)/(b-a).
export const EXIT_A = -2, EXIT_B = 2, EXIT_SIGMA = 1;
export const exitExact = (x) => (x - EXIT_A) / (EXIT_B - EXIT_A);
export function exitTimeDemo({ x0, n, dt, seed, keep = 25, maxSteps = 20000 }) {
  const rng = mulberry32(seed);
  const sqrtDt = Math.sqrt(dt);
  const payoffs = new Float64Array(n), exitTimes = new Float64Array(n);
  const sample = [];
  const t0start = performance.now();
  for (let i = 0; i < n; i++) {
    let x = x0, t = 0, step = 0;
    const track = i < keep, traj = track ? [{ t, x }] : null;
    while (x > EXIT_A && x < EXIT_B && step < maxSteps) {
      x += EXIT_SIGMA * sqrtDt * randn(rng);
      t += dt; step++;
      if (track) traj.push({ t, x: Math.max(EXIT_A, Math.min(EXIT_B, x)) });
    }
    payoffs[i] = x <= EXIT_A ? 0 : 1;
    exitTimes[i] = t;
    if (track) sample.push(traj);
  }
  return { payoffs, exitTimes, sample, ms: performance.now() - t0start };
}

// ---------- section 7: finance (Black-Scholes) reskin ----------
export function erf(x) {
  const s = x < 0 ? -1 : 1, z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return s * y;
}
export const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
export function blackScholesCall({ S0, K, r, sigma, T }) {
  const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S0 * Phi(d1) - K * Math.exp(-r * T) * Phi(d2);
}
export function financeDemo({ S0, K, r, sigma, T, n, dt, seed, keep = 50 }) {
  const rng = mulberry32(seed);
  const steps = Math.max(1, Math.round(T / dt)), h = T / steps, sqrtH = Math.sqrt(h);
  const payoffs = new Float64Array(n);
  const paths = [];
  const t0start = performance.now();
  for (let i = 0; i < n; i++) {
    let logS = Math.log(S0);
    const track = i < keep, traj = track ? [S0] : null;
    for (let s = 0; s < steps; s++) {
      logS += (r - 0.5 * sigma * sigma) * h + sigma * sqrtH * randn(rng);
      if (track) traj.push(Math.exp(logS));
    }
    const ST = Math.exp(logS);
    payoffs[i] = Math.exp(-r * T) * Math.max(ST - K, 0);
    if (track) paths.push(traj);
  }
  return { payoffs, paths, steps, h, ms: performance.now() - t0start };
}
