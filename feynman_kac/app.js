import * as S from './sim.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const st = { x0: 0, t0: 0, n: 4000, dt: 0.01, seed: 1 };

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

// ---------- 2. sample paths ----------
function drawPaths(svg, data) {
  const W = 760, H = 280, m = { l: 44, r: 14, t: 14, b: 32 };
  const t0 = st.t0, T = S.T_HORIZON;
  let ylo = Infinity, yhi = -Infinity;
  for (const p of data.paths) for (const v of p) { if (v < ylo) ylo = v; if (v > yhi) yhi = v; }
  if (!Number.isFinite(ylo)) { ylo = st.x0 - 1; yhi = st.x0 + 1; }
  const pad = (yhi - ylo) * 0.08 + 0.1; ylo -= pad; yhi += pad;
  const X = (t) => m.l + (t - t0) / (T - t0) * (W - m.l - m.r);
  const Y = (v) => H - m.b - (v - ylo) / (yhi - ylo) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const ys = niceStep(yhi - ylo, 6);
  for (let v = Math.ceil(ylo / ys) * ys; v <= yhi; v += ys) {
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'tick' }));
    svg.append(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v, 1)));
  }
  const xs = niceStep(T - t0, 6);
  for (let v = t0; v <= T + 1e-9; v += xs || 0.1) {
    svg.append(el('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }));
    svg.append(el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle' }, fmt(v, 2)));
  }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, 'time s'));
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'X_s'));
  const steps = data.steps, h = data.h;
  for (const p of data.paths) {
    let d = '';
    for (let i = 0; i <= steps; i++) d += (i ? 'L' : 'M') + X(t0 + i * h).toFixed(1) + ',' + Y(p[i]).toFixed(1);
    svg.append(el('path', { d, fill: 'none', stroke: css('--norm'), 'stroke-width': 1, opacity: 0.55 }));
  }
  svg.append(el('circle', { cx: X(t0), cy: Y(st.x0), r: 4, fill: css('--c-mean') }));
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// ---------- 3. endpoint histogram + payoff overlay ----------
function drawEndpoints(svg, data) {
  const W = 760, H = 280, m = { l: 44, r: 44, t: 16, b: 34 };
  const xs = data.endpoints;
  let lo = Infinity, hi = -Infinity;
  for (const v of xs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.06 + 0.1; lo -= pad; hi += pad;
  const nb = Math.max(20, Math.min(70, Math.round(Math.sqrt(xs.length) * 2)));
  const bw = (hi - lo) / nb, counts = new Float64Array(nb);
  for (const v of xs) counts[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / bw)))]++;
  const cmax = Math.max(...counts) * 1.15;
  const X = (v) => m.l + (v - lo) / (hi - lo) * (W - m.l - m.r);
  const Yc = (c) => H - m.b - c / cmax * (H - m.t - m.b);
  const Yp = (p) => H - m.b - p * (H - m.t - m.b); // payoff in [0,1]
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const cs = niceStep(cmax, 5);
  for (let v = 0; v <= cmax; v += cs) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Yc(v), y2: Yc(v), class: 'tick' })); svg.append(el('text', { x: m.l - 6, y: Yc(v) + 4, 'text-anchor': 'end' }, Math.round(v))); }
  for (const v of [0, 0.5, 1]) svg.append(el('text', { x: W - m.r + 6, y: Yp(v) + 4 }, v));
  const xstep = niceStep(hi - lo, 7);
  for (let v = Math.ceil(lo / xstep) * xstep; v <= hi; v += xstep) { svg.append(el('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' })); svg.append(el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle' }, fmt(v, 1))); }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, 'endpoint X_T'));
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'count'));
  svg.append(el('text', { x: W - 8, y: (m.t + H - m.b) / 2, transform: `rotate(90 ${W - 8} ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'payoff e^{-x²}'));
  const bx = (b) => X(lo + b * bw), bwp = bx(1) - bx(0);
  for (let b = 0; b < nb; b++) {
    const g = el('g');
    g.append(el('rect', { x: bx(b) + 0.5, y: Yc(counts[b]), width: Math.max(0.5, bwp - 1), height: Yc(0) - Yc(counts[b]), fill: css('--norm') }));
    g.append(el('title', {}, `X_T ∈ [${fmt(lo + b * bw, 2)}, ${fmt(lo + (b + 1) * bw, 2)}): ${counts[b]} paths`));
    svg.append(g);
  }
  let d = '';
  for (let i = 0; i <= 160; i++) { const v = lo + (hi - lo) * i / 160; d += (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Yp(S.PAYOFF(v)).toFixed(1); }
  svg.append(el('path', { d, fill: 'none', stroke: css('--c-mean'), 'stroke-width': 2 }));
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// ---------- 4. convergence ----------
function drawConvergence(svg, trace, target) {
  const W = 760, H = 280, m = { l: 48, r: 14, t: 14, b: 34 };
  const n0 = trace[0].N, n1 = trace[trace.length - 1].N;
  const X = (N) => m.l + (Math.log10(N) - Math.log10(n0)) / (Math.log10(n1) - Math.log10(n0)) * (W - m.l - m.r);
  let ylo = target, yhi = target;
  for (const p of trace) { ylo = Math.min(ylo, p.mean - p.se); yhi = Math.max(yhi, p.mean + p.se); }
  const pad = (yhi - ylo) * 0.15 + 0.01; ylo -= pad; yhi += pad;
  const Y = (v) => H - m.b - (v - ylo) / (yhi - ylo) * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const ys = niceStep(yhi - ylo, 5);
  for (let v = Math.ceil(ylo / ys) * ys; v <= yhi; v += ys) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'tick' })); svg.append(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, fmt(v, 3))); }
  for (const N of [n0, ...[10, 100, 1000, 10000].filter((v) => v > n0 && v < n1), n1]) {
    svg.append(el('line', { x1: X(N), x2: X(N), y1: H - m.b, y2: H - m.b + 4, class: 'axis' }));
    svg.append(el('text', { x: X(N), y: H - m.b + 17, 'text-anchor': 'middle' }, N >= 1000 ? (N / 1000) + 'k' : N));
  }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle' }, 'number of paths N (log scale)'));
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'estimate of u(x₀, t₀)'));
  // +/- 1 se band
  let band = '', bandBack = '';
  trace.forEach((p, i) => { band += (i ? 'L' : 'M') + X(p.N).toFixed(1) + ',' + Y(p.mean + p.se).toFixed(1); });
  for (let i = trace.length - 1; i >= 0; i--) { const p = trace[i]; bandBack += (i === trace.length - 1 ? 'M' : 'L') + X(p.N).toFixed(1) + ',' + Y(p.mean - p.se).toFixed(1); }
  svg.append(el('path', { d: band + bandBack.replace('M', 'L') + 'Z', fill: css('--c-w'), opacity: 0.18 }));
  // exact value
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(target), y2: Y(target), stroke: css('--truth'), 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
  // running estimate
  let d = '';
  trace.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p.N).toFixed(1) + ',' + Y(p.mean).toFixed(1); });
  svg.append(el('path', { d, fill: 'none', stroke: css('--c-w'), 'stroke-width': 2 }));
  trace.forEach((p) => {
    const c = el('circle', { cx: X(p.N), cy: Y(p.mean), r: 2.4, fill: css('--c-w') });
    c.append(el('title', {}, `N = ${p.N}: estimate ${fmt(p.mean)} ± ${fmt(p.se)}`));
    svg.append(c);
  });
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// ---------- wiring ----------
let data, lastKey = '';
function render() {
  $('oX').textContent = st.x0.toFixed(1);
  $('oT').textContent = st.t0.toFixed(2);
  $('oN').textContent = st.n.toLocaleString();
  $('oDt').textContent = st.dt.toFixed(3);
  const key = `${st.x0}|${st.t0}|${st.n}|${st.dt}|${st.seed}`;
  if (key !== lastKey) {
    lastKey = key;
    data = S.simulate({ x0: st.x0, t0: st.t0, n: st.n, dt: st.dt, seed: st.seed, keepPaths: Math.min(60, st.n) });
  }
  const target = S.exact(st.x0, st.t0);
  const trace = S.convergenceTrace(data.endpoints);
  const final = trace[trace.length - 1];

  drawPaths($('hPaths'), data);
  $('lPaths').innerHTML = swatch('line', css('--norm'), `${data.paths.length} of ${st.n} simulated paths shown`) + swatch('box', css('--c-mean'), 'start (x₀, t₀)');

  drawEndpoints($('hEnd'), data);
  $('lEnd').innerHTML = swatch('box', css('--norm'), 'endpoint histogram') + swatch('line', css('--c-mean'), 'payoff e^{-x²} (right axis)');

  drawConvergence($('hConv'), trace, target);
  $('lConv').innerHTML = swatch('line', css('--c-w'), 'running Monte Carlo estimate') + swatch('box', css('--c-w') + '40', '± 1 standard error') + swatch('dash', css('--truth'), 'exact value (closed form)');
  $('rConv').innerHTML = `<p class="small" style="margin:8px 0 0">
    Exact u(x₀,t₀) = <b>${fmt(target)}</b>. Monte Carlo estimate with all ${st.n.toLocaleString()} paths: <b>${fmt(final.mean)} ± ${fmt(final.se)}</b>.
    Simulated ${st.n.toLocaleString()} paths × ${data.steps} steps (${(st.n * data.steps).toLocaleString()} random draws) in <b>${data.ms.toFixed(1)} ms</b>.</p>`;
}

function bind() {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('gX', 'input', (e) => { st.x0 = +e.target.value; render(); });
  on('gT', 'input', (e) => { st.t0 = +e.target.value; render(); });
  on('gN', 'input', (e) => { st.n = +e.target.value; render(); });
  on('gDt', 'input', (e) => { st.dt = +e.target.value; render(); });
  on('gNew', 'click', () => { st.seed++; render(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
}

bind();
render();
if (window.renderMathInElement) renderMath(); else addEventListener('load', renderMath);
function renderMath() {
  renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
}
