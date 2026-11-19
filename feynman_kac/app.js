import * as S from './sim.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
function niceStep(span, target = 8) {
  const raw = span / target, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
const swatch = (kind, color, text) =>
  `<span><i class="sw ${kind}" style="border-color:${color};color:${color}"></i>${text}</span>`;

// ======================================================================
// Generic chart primitives, reused across every section below.
// ======================================================================

// A bundle of time-series lines sharing a time axis. `series`: [{t,x}...] or array-of-arrays
// of plain numbers sampled at uniform step h starting at t0.
function pathsChart(svg, { paths, t0 = 0, h, points, xlabel = 'time s', ylabel = 'X_s', startPoint, extra, yfix, trange, noAxes }) {
  const W = 760, H = 280, m = { l: 48, r: 14, t: 14, b: 32 };
  const getXY = (path, i) => points ? [path[i].t, path[i].x] : [t0 + i * h, path[i]];
  let tlo = Infinity, thi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (const p of paths) for (let i = 0; i < p.length; i++) { const [t, v] = getXY(p, i); tlo = Math.min(tlo, t); thi = Math.max(thi, t); ylo = Math.min(ylo, v); yhi = Math.max(yhi, v); }
  if (trange) { tlo = trange[0]; thi = trange[1]; }
  if (!Number.isFinite(tlo)) { tlo = 0; thi = 1; }
  if (!Number.isFinite(ylo)) { ylo = -1; yhi = 1; }
  if (yfix) { ylo = yfix[0]; yhi = yfix[1]; }
  else { const pad = (yhi - ylo) * 0.08 + 1e-6; ylo -= pad; yhi += pad; }
  const X = (t) => m.l + (t - tlo) / (thi - tlo || 1) * (W - m.l - m.r);
  const Y = (v) => H - m.b - (v - ylo) / (yhi - ylo || 1) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  if (!noAxes) {
    const ys = niceStep(yhi - ylo, 6);
    for (let v = Math.ceil(ylo / ys) * ys; v <= yhi; v += ys) {
      svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'tick' }));
      svg.append(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v, Math.abs(v) < 10 ? 2 : 0)));
    }
    const xs = niceStep(thi - tlo, 6) || 0.1;
    for (let v = tlo; v <= thi + 1e-9; v += xs) {
      svg.append(el('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }));
      svg.append(el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle' }, fmt(v, 2)));
    }
    svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, xlabel));
    svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, ylabel));
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
  }
  for (const [a, b] of extra || []) svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(a), y2: Y(a), stroke: b, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
  for (const p of paths) {
    let d = '';
    for (let i = 0; i < p.length; i++) { const [t, v] = getXY(p, i); d += (i ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(v).toFixed(1); }
    svg.append(el('path', { d, fill: 'none', stroke: css('--norm'), 'stroke-width': 1, opacity: 0.55 }));
  }
  if (startPoint) svg.append(el('circle', { cx: X(startPoint[0]), cy: Y(startPoint[1]), r: 4, fill: css('--c-mean') }));
  return { X, Y, tlo, thi, ylo, yhi };
}

// Histogram of `values`, with an optional overlaid curve `payoffFn(x) in [0,1]` on a right axis.
function histChart(svg, { values, xlabel, payoffFn, payoffLabel, markers }) {
  const W = 760, H = 280, m = { l: 44, r: payoffFn ? 44 : 14, t: 16, b: 34 };
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.06 + 0.1; lo -= pad; hi += pad;
  const nb = Math.max(20, Math.min(70, Math.round(Math.sqrt(values.length) * 2)));
  const bw = (hi - lo) / nb, counts = new Float64Array(nb);
  for (const v of values) counts[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / bw)))]++;
  const cmax = Math.max(...counts) * 1.15;
  const X = (v) => m.l + (v - lo) / (hi - lo) * (W - m.l - m.r);
  const Yc = (c) => H - m.b - c / cmax * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const cs = niceStep(cmax, 5);
  for (let v = 0; v <= cmax; v += cs) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Yc(v), y2: Yc(v), class: 'tick' })); svg.append(el('text', { x: m.l - 6, y: Yc(v) + 4, 'text-anchor': 'end' }, Math.round(v))); }
  const xstep = niceStep(hi - lo, 7);
  for (let v = Math.ceil(lo / xstep) * xstep; v <= hi; v += xstep) { svg.append(el('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' })); svg.append(el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle' }, fmt(v, Math.abs(v) < 10 ? 1 : 0))); }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, xlabel));
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'count'));
  const bx = (b) => X(lo + b * bw), bwp = bx(1) - bx(0);
  for (let b = 0; b < nb; b++) {
    const g = el('g');
    g.append(el('rect', { x: bx(b) + 0.5, y: Yc(counts[b]), width: Math.max(0.5, bwp - 1), height: Yc(0) - Yc(counts[b]), fill: css('--norm') }));
    g.append(el('title', {}, `[${fmt(lo + b * bw, 2)}, ${fmt(lo + (b + 1) * bw, 2)}): ${counts[b]}`));
    svg.append(g);
  }
  for (const mk of markers || []) svg.append(el('line', { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: H - m.b, stroke: mk.color, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
  if (payoffFn) {
    const Yp = (p) => H - m.b - p * (H - m.t - m.b);
    for (const v of [0, 0.5, 1]) svg.append(el('text', { x: W - m.r + 6, y: Yp(v) + 4 }, v));
    svg.append(el('text', { x: W - 8, y: (m.t + H - m.b) / 2, transform: `rotate(90 ${W - 8} ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, payoffLabel));
    let d = ''; for (let i = 0; i <= 160; i++) { const v = lo + (hi - lo) * i / 160; d += (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Yp(payoffFn(v)).toFixed(1); }
    svg.append(el('path', { d, fill: 'none', stroke: css('--c-mean'), 'stroke-width': 2 }));
  }
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// Running Monte Carlo estimate vs. N (log scale) with a +-1 SE band and an exact-value line.
function convChart(svg, { trace, target, ylabel }) {
  const W = 760, H = 280, m = { l: 52, r: 14, t: 14, b: 34 };
  const n0 = trace[0].N, n1 = trace[trace.length - 1].N;
  const X = (N) => m.l + (Math.log10(N) - Math.log10(n0)) / (Math.log10(n1) - Math.log10(n0) || 1) * (W - m.l - m.r);
  let ylo = target, yhi = target;
  for (const p of trace) { ylo = Math.min(ylo, p.mean - p.se); yhi = Math.max(yhi, p.mean + p.se); }
  const pad = (yhi - ylo) * 0.15 + 0.005; ylo -= pad; yhi += pad;
  const Y = (v) => H - m.b - (v - ylo) / (yhi - ylo) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const ys = niceStep(yhi - ylo, 5);
  for (let v = Math.ceil(ylo / ys) * ys; v <= yhi; v += ys) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'tick' })); svg.append(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v, 3))); }
  for (const N of [n0, ...[10, 100, 1000, 10000].filter((v) => v > n0 && v < n1), n1]) {
    svg.append(el('line', { x1: X(N), x2: X(N), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }));
    svg.append(el('text', { x: X(N), y: H - m.b + 17, 'text-anchor': 'middle' }, N >= 1000 ? (N / 1000) + 'k' : N));
  }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, 'number of paths N (log scale)'));
  svg.append(el('text', { x: 14, y: (m.t + H - m.b) / 2, transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, ylabel));
  let band = '', bandBack = '';
  trace.forEach((p, i) => { band += (i ? 'L' : 'M') + X(p.N).toFixed(1) + ',' + Y(p.mean + p.se).toFixed(1); });
  for (let i = trace.length - 1; i >= 0; i--) { const p = trace[i]; bandBack += (i === trace.length - 1 ? 'M' : 'L') + X(p.N).toFixed(1) + ',' + Y(p.mean - p.se).toFixed(1); }
  svg.append(el('path', { d: band + bandBack.replace('M', 'L') + 'Z', fill: css('--c-w'), opacity: 0.18 }));
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(target), y2: Y(target), stroke: css('--truth'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
  let d = ''; trace.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p.N).toFixed(1) + ',' + Y(p.mean).toFixed(1); });
  svg.append(el('path', { d, fill: 'none', stroke: css('--c-w'), 'stroke-width': 2 }));
  trace.forEach((p) => { const c = el('circle', { cx: X(p.N), cy: Y(p.mean), r: 2.4, fill: css('--c-w') }); c.append(el('title', {}, `N=${p.N}: ${fmt(p.mean)} ± ${fmt(p.se)}`)); svg.append(c); });
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// A small sequential heatmap over a (x,t) grid, single hue via color-mix.
function heatmap(svg, { fn, xlo, xhi, tlo, thi, nx = 60, nt = 40, point }) {
  const W = 360, H = 280, m = { l: 40, r: 10, t: 12, b: 30 };
  let vlo = Infinity, vhi = -Infinity;
  const grid = [];
  for (let i = 0; i < nx; i++) { const row = []; for (let j = 0; j < nt; j++) { const x = xlo + (xhi - xlo) * i / (nx - 1), t = tlo + (thi - tlo) * j / (nt - 1); const v = fn(x, t); row.push(v); vlo = Math.min(vlo, v); vhi = Math.max(vhi, v); } grid.push(row); }
  const X = (x) => m.l + (x - xlo) / (xhi - xlo) * (W - m.l - m.r);
  const Y = (t) => H - m.b - (t - tlo) / (thi - tlo) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const cw = (W - m.l - m.r) / nx, ch = (H - m.t - m.b) / nt;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const pct = Math.round(((grid[i][j] - vlo) / (vhi - vlo || 1)) * 100);
    svg.append(el('rect', { x: m.l + i * cw, y: Y(tlo + (thi - tlo) * (j + 1) / nt), width: cw + 0.5, height: ch + 0.5, fill: `color-mix(in srgb, ${css('--stage')} ${100 - pct}%, ${css('--c-w')})` }));
  }
  for (const v of [xlo, 0, xhi].filter((v, i, a) => a.indexOf(v) === i)) svg.append(el('text', { x: X(v), y: H - m.b + 14, 'text-anchor': 'middle' }, fmt(v, 0)));
  for (const v of [tlo, thi]) svg.append(el('text', { x: m.l - 5, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v, 1)));
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle' }, 'x'));
  svg.append(el('text', { x: 10, y: (m.t + H - m.b) / 2, transform: `rotate(-90 10 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 't'));
  if (point) { svg.append(el('circle', { cx: X(point[0]), cy: Y(point[1]), r: 5, fill: 'none', stroke: css('--c-mean'), 'stroke-width': 2.5 })); svg.append(el('circle', { cx: X(point[0]), cy: Y(point[1]), r: 2, fill: css('--c-mean') })); }
}

// ======================================================================
// Section 1: the Rosetta-stone diagram
// ======================================================================
const st1 = { x0: 0 };
function render1() {
  $('o1x').textContent = st1.x0.toFixed(1);
  heatmap($('h1map'), { fn: S.exact, xlo: -3, xhi: 3, tlo: 0, thi: 1, point: [st1.x0, 0] });
  const d = S.driftDiffusionPaths({ x0: st1.x0, mu: S.MU, sigma: S.SIGMA, n: 40, dt: 0.02, seed: 7 });
  pathsChart($('h1paths'), { paths: d.paths, h: d.h, ylabel: 'X_s', startPoint: [0, st1.x0] });
  $('l1').innerHTML = swatch('box', css('--c-w'), 'u(x,t), the PDE solution (darker = larger)') + swatch('box', css('--c-mean'), 'the point (x₀, 0)') + swatch('line', css('--norm'), '40 simulated paths from that point');
}

// ======================================================================
// Section 2a: drift/diffusion sliders
// ======================================================================
const st2a = { mu: 1, sigma: 1 };
function render2a() {
  $('o2mu').textContent = st2a.mu.toFixed(1); $('o2sig').textContent = st2a.sigma.toFixed(2);
  const d = S.driftDiffusionPaths({ x0: 0, mu: st2a.mu, sigma: st2a.sigma, n: 50, dt: 0.02, seed: 3 });
  pathsChart($('h2a'), { paths: d.paths, h: d.h, ylabel: 'X_s', startPoint: [0, 0] });
  histChart($('h2aHist'), { values: d.paths.map((p) => p[p.length - 1]), xlabel: 'endpoint X_1' });
  $('l2a').innerHTML = swatch('line', css('--norm'), '50 paths, dX_s = μ ds + σ dW_s');
}

// ======================================================================
// Section 2b: the cost meter
// ======================================================================
let cm; const st2b = { step: 0 };
function render2b() {
  if (!cm) cm = S.costMeterPath({ x0: 0, mu: 0.6, sigma: 1, decayRate: 1.2, dt: 0.01, seed: 11 });
  const s = Math.min(st2b.step, cm.length - 1), pt = cm[s];
  const { X, Y } = pathsChart($('h2b'), { paths: [cm.map((p) => p.x)], h: 1 / (cm.length - 1), ylabel: 'X_s' });
  $('h2b').querySelector('path').setAttribute('opacity', 1);
  const g = el('g');
  g.append(el('line', { x1: X(pt.t), x2: X(pt.t), y1: 14, y2: 280 - 32, stroke: css('--c-mean'), 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
  g.append(el('circle', { cx: X(pt.t), cy: Y(pt.x), r: 4, fill: css('--c-mean') }));
  $('h2b').append(g);
  $('o2s').textContent = pt.t.toFixed(2);
  $('o2cost').style.width = Math.min(100, pt.cost / 1.2 * 100) + '%';
  $('o2disc').style.width = pt.discount * 100 + '%';
  $('o2costv').textContent = pt.cost.toFixed(3);
  $('o2discv').textContent = pt.discount.toFixed(3);
}

// ======================================================================
// Section 3: the worked numerical example (paths / endpoints / convergence)
// ======================================================================
const st3 = { x0: 0, t0: 0, n: 4000, dt: 0.01, seed: 1 };
let data3, lastKey3 = '';
function render3() {
  $('o3x').textContent = st3.x0.toFixed(1);
  $('o3t').textContent = st3.t0.toFixed(2);
  $('o3n').textContent = st3.n.toLocaleString();
  $('o3dt').textContent = st3.dt.toFixed(3);
  const key = `${st3.x0}|${st3.t0}|${st3.n}|${st3.dt}|${st3.seed}`;
  if (key !== lastKey3) { lastKey3 = key; data3 = S.simulate({ x0: st3.x0, t0: st3.t0, n: st3.n, dt: st3.dt, seed: st3.seed, keepPaths: Math.min(60, st3.n) }); }
  const target = S.exact(st3.x0, st3.t0);
  const trace = S.convergenceTrace(Array.from(data3.endpoints, S.PAYOFF));

  pathsChart($('h3paths'), { paths: data3.paths, t0: st3.t0, h: data3.h, ylabel: 'X_s', startPoint: [st3.t0, st3.x0] });
  $('l3paths').innerHTML = swatch('line', css('--norm'), `${data3.paths.length} of ${st3.n.toLocaleString()} simulated paths`) + swatch('box', css('--c-mean'), 'start (x₀, t₀)');

  histChart($('h3end'), { values: Array.from(data3.endpoints), xlabel: 'endpoint X_T', payoffFn: S.PAYOFF, payoffLabel: 'payoff e^{-x²}' });
  $('l3end').innerHTML = swatch('box', css('--norm'), 'endpoint histogram') + swatch('line', css('--c-mean'), 'payoff e^{-x²} (right axis)');

  convChart($('h3conv'), { trace, target, ylabel: 'estimate of u(x₀, t₀)' });
  $('l3conv').innerHTML = swatch('line', css('--c-w'), 'running Monte Carlo estimate') + swatch('box', css('--c-w') + '40', '± 1 standard error') + swatch('dash', css('--truth'), 'exact value (closed form)');
  const final = trace[trace.length - 1];
  $('r3').innerHTML = `<p class="small" style="margin:8px 0 0">Exact u(x₀,t₀) = <b>${fmt(target)}</b>. Monte Carlo estimate with all ${st3.n.toLocaleString()} paths: <b>${fmt(final.mean)} ± ${fmt(final.se)}</b>. Simulated ${st3.n.toLocaleString()} paths × ${data3.steps} steps (${(st3.n * data3.steps).toLocaleString()} random draws) in <b>${data3.ms.toFixed(1)} ms</b>.</p>`;
}

// ======================================================================
// Section 4: martingale-flatness demo
// ======================================================================
const st4 = { x0: 0, t0: 0, n: 2000 };
function render4() {
  $('o4x').textContent = st4.x0.toFixed(1); $('o4t').textContent = st4.t0.toFixed(2);
  const res = S.martingaleDemo({ x0: st4.x0, t0: st4.t0, n: st4.n, dt: 0.02, seed: 5, keep: 15 });
  const trange = [res.checkpoints[0].t, res.checkpoints[res.checkpoints.length - 1].t];
  pathsChart($('h4'), { paths: res.sample, points: true, ylabel: 'u(X_s, s)', yfix: [0, 1], trange });
  // overlay mean line on top (transparent background, same scale)
  const { X, Y } = pathsChart($('h4mean'), { paths: [], ylabel: 'u(X_s, s)', yfix: [0, 1], trange, noAxes: true });
  let band = '', bandBack = '', line = '';
  res.checkpoints.forEach((p, i) => { band += (i ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(p.mean + p.se).toFixed(1); line += (i ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(p.mean).toFixed(1); });
  for (let i = res.checkpoints.length - 1; i >= 0; i--) { const p = res.checkpoints[i]; bandBack += (i === res.checkpoints.length - 1 ? 'M' : 'L') + X(p.t).toFixed(1) + ',' + Y(p.mean - p.se).toFixed(1); }
  $('h4mean').append(el('path', { d: band + bandBack.replace('M', 'L') + 'Z', fill: css('--c-w'), opacity: 0.25 }));
  $('h4mean').append(el('path', { d: line, fill: 'none', stroke: css('--c-w'), 'stroke-width': 2.5 }));
  $('l4').innerHTML = swatch('line', css('--norm'), `15 individual paths of u(X_s,s)`) + swatch('line', css('--c-w'), 'average over all ' + st4.n.toLocaleString() + ' paths (± 1 SE)') + `<span class="small">average should stay flat at u(x₀,t₀) = ${fmt(S.exact(st4.x0, st4.t0))}</span>`;
}

// ======================================================================
// Section 6: exit-time / Dirichlet-problem demo
// ======================================================================
const st6 = { x0: 0, n: 2000 };
let data6, lastKey6 = '';
function render6() {
  $('o6x').textContent = st6.x0.toFixed(1);
  const key = `${st6.x0}|${st6.n}`;
  if (key !== lastKey6) { lastKey6 = key; data6 = S.exitTimeDemo({ x0: st6.x0, n: st6.n, dt: 0.005, seed: 9, keep: 25 }); }
  const { X, Y } = pathsChart($('h6'), { paths: data6.sample, points: true, ylabel: 'X_s', xlabel: 'time s (until exit)', yfix: [S.EXIT_A - 0.3, S.EXIT_B + 0.3] });
  for (const [v, label] of [[S.EXIT_A, 'a (ψ=0)'], [S.EXIT_B, 'b (ψ=1)']]) {
    $('h6').append(el('line', { x1: 48, x2: 746, y1: Y(v), y2: Y(v), stroke: css('--c-mean'), 'stroke-width': 1.5 }));
    $('h6').append(el('text', { x: 750, y: Y(v) + 4, 'text-anchor': 'start', fill: css('--c-mean') }, label));
  }
  const target = S.exitExact(st6.x0), trace = S.convergenceTrace(Array.from(data6.payoffs));
  convChart($('h6conv'), { trace, target, ylabel: 'estimate of u(x₀)' });
  const final = trace[trace.length - 1];
  const meanExit = Array.from(data6.exitTimes).reduce((a, b) => a + b, 0) / data6.exitTimes.length;
  $('l6').innerHTML = swatch('line', css('--norm'), '25 paths, pure Brownian motion, stopped at the boundary') + swatch('line', css('--c-mean'), 'domain boundary a=−2, b=2');
  $('l6conv').innerHTML = swatch('line', css('--c-w'), 'running estimate') + swatch('dash', css('--truth'), 'exact value (linear)');
  $('r6').innerHTML = `<p class="small" style="margin:8px 0 0">Exact u(x₀) = (x₀−a)/(b−a) = <b>${fmt(target)}</b>. Monte Carlo: <b>${fmt(final.mean)} ± ${fmt(final.se)}</b> from ${st6.n.toLocaleString()} paths (mean exit time ≈ ${meanExit.toFixed(2)}, ${data6.ms.toFixed(1)} ms).</p>`;
}

// ======================================================================
// Section 7: finance (Black-Scholes) reskin
// ======================================================================
const st7 = { sigma: 0.2, n: 3000 };
let data7, lastKey7 = '';
function render7() {
  $('o7sig').textContent = st7.sigma.toFixed(2);
  const params = { S0: 100, K: 100, r: 0.03, sigma: st7.sigma, T: 1 };
  const key = `${st7.sigma}|${st7.n}`;
  if (key !== lastKey7) { lastKey7 = key; data7 = S.financeDemo({ ...params, n: st7.n, dt: 0.004, seed: 13, keep: 50 }); }
  pathsChart($('h7paths'), { paths: data7.paths, h: data7.h, ylabel: 'stock price S_s', startPoint: [0, 100], extra: [[100, css('--c-mean')]] });
  histChart($('h7hist'), { values: data7.paths.map((p) => p[p.length - 1]), xlabel: 'S_T', markers: [{ x: params.K, color: css('--c-mean') }] });
  const target = S.blackScholesCall(params), trace = S.convergenceTrace(Array.from(data7.payoffs));
  convChart($('h7conv'), { trace, target, ylabel: 'option price' });
  const final = trace[trace.length - 1];
  $('l7paths').innerHTML = swatch('line', css('--norm'), '50 simulated stock-price paths (geometric Brownian motion)');
  $('l7hist').innerHTML = swatch('box', css('--norm'), 'distribution of S_T') + swatch('dash', css('--c-mean'), 'strike K=100');
  $('l7conv').innerHTML = swatch('line', css('--c-w'), 'Monte Carlo price') + swatch('dash', css('--truth'), 'Black–Scholes closed form');
  $('r7').innerHTML = `<p class="small" style="margin:8px 0 0">Black–Scholes price: <b>$${fmt(target, 3)}</b>. Monte Carlo (${st7.n.toLocaleString()} paths): <b>$${fmt(final.mean, 3)} ± ${fmt(final.se, 3)}</b> (${data7.ms.toFixed(1)} ms).</p>`;
}

// ---------- wiring ----------
function bind() {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('g1x', 'input', (e) => { st1.x0 = +e.target.value; render1(); });
  on('g2mu', 'input', (e) => { st2a.mu = +e.target.value; render2a(); });
  on('g2sig', 'input', (e) => { st2a.sigma = +e.target.value; render2a(); });
  on('g2s', 'input', (e) => { st2b.step = +e.target.value; render2b(); });
  on('g3x', 'input', (e) => { st3.x0 = +e.target.value; render3(); });
  on('g3t', 'input', (e) => { st3.t0 = +e.target.value; render3(); });
  on('g3n', 'input', (e) => { st3.n = +e.target.value; render3(); });
  on('g3dt', 'input', (e) => { st3.dt = +e.target.value; render3(); });
  on('g3new', 'click', () => { st3.seed++; render3(); });
  on('g4x', 'input', (e) => { st4.x0 = +e.target.value; render4(); });
  on('g4t', 'input', (e) => { st4.t0 = +e.target.value; render4(); });
  on('g6x', 'input', (e) => { st6.x0 = +e.target.value; render6(); });
  on('g7sig', 'input', (e) => { st7.sigma = +e.target.value; render7(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
}
function renderAll() { render1(); render2a(); render2b(); render3(); render4(); render6(); render7(); }

bind();
renderAll();
if (window.renderMathInElement) renderMath(); else addEventListener('load', renderMath);
function renderMath() {
  renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
}
