import * as S from './stats.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const st = { n: 300, f: 0.08, gamma: 1.5, half: 10, seed: 1, reveal: true, truth: true };

// ---------- SVG helpers ----------
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

// ---------- histogram ----------
// o: {x, out, keep, wts, lines:[{x,color,dash,w,label}], bands:[{a,b,color}], box:{q1,q3,med}}
function histogram(svg, o) {
  const W = 760, H = 300, m = { l: 44, r: 14, t: 20, b: 34 };
  const lo = TRUE_MU() - st.half, hi = TRUE_MU() + st.half;
  const nb = Math.max(24, Math.min(80, Math.round(Math.sqrt(o.x.length) * 3)));
  const bw = (hi - lo) / nb;
  const norm = new Float64Array(nb), outl = new Float64Array(nb), cut = new Float64Array(nb), wsum = new Float64Array(nb);
  let offL = 0, offR = 0;
  const wtot = o.wts ? S.sum(o.wts) : 1;
  for (let i = 0; i < o.x.length; i++) {
    const v = o.x[i];
    if (v < lo) { offL++; continue; }
    if (v > hi) { offR++; continue; }
    const b = Math.min(nb - 1, Math.floor((v - lo) / bw));
    if (o.keep && !o.keep[i]) cut[b]++;
    else if (st.reveal && o.out[i]) outl[b]++;
    else norm[b]++;
    if (o.wts) wsum[b] += o.wts[i] / wtot * o.x.length;
  }
  const tot = Array.from(norm, (v, b) => v + outl[b] + cut[b]);
  const sig = S.TRUE_SIGMA, expPeak = o.x.length * (1 - st.f) * bw * S.phi(0) / sig;
  let ymax = Math.max(...tot, ...(o.wts ? wsum : [0]), st.truth ? expPeak : 0, 3) * 1.12;
  const X = (v) => m.l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - m.l - m.r);
  const Y = (v) => H - m.b - v / ymax * (H - m.t - m.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.replaceChildren();
  // grid + axes
  const ys = niceStep(ymax, 5);
  for (let v = 0; v <= ymax; v += ys) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'tick' })); svg.append(el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, Math.round(v))); }
  const xs = niceStep(hi - lo, 8);
  for (let v = Math.ceil(lo / xs) * xs; v <= hi + 1e-9; v += xs) { svg.append(el('line', { x1: X(v), x2: X(v), y1: H - m.b, y2: H - m.b + 4, class: 'axis' })); svg.append(el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle' }, +v.toFixed(6))); }
  svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle' }, 'value x'));
  svg.append(el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, 'count'));
  // bands under bars
  for (const bd of o.bands || []) {
    const a = X(bd.a), b = X(bd.b);
    if (b > a) svg.append(el('rect', { x: a, y: m.t, width: b - a, height: H - m.t - m.b, fill: bd.color, opacity: bd.op || 0.13 }));
  }
  // bars (stacked: kept normal, kept outlier, clipped-out)
  const bx = (b) => X(lo + b * bw), bwp = bx(1) - bx(0);
  for (let b = 0; b < nb; b++) {
    let base = 0;
    const seg = [[norm[b], css('--norm')], [outl[b], css('--outl')], [cut[b], css('--cut')]];
    const g = el('g');
    for (const [c, col] of seg) {
      if (!c) continue;
      g.append(el('rect', { x: bx(b) + 0.5, y: Y(base + c), width: Math.max(0.5, bwp - 1), height: Y(base) - Y(base + c), fill: col }));
      base += c;
    }
    if (base) g.append(el('title', {}, `x ∈ [${fmt(lo + b * bw)}, ${fmt(lo + (b + 1) * bw)}): ${base} samples`));
    svg.append(g);
  }
  // true curve
  if (st.truth) {
    let d = '';
    for (let i = 0; i <= 160; i++) { const v = lo + (hi - lo) * i / 160; const c = o.x.length * (1 - st.f) * bw * S.phi((v - S.TRUE_MU) / sig) / sig; d += (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(c).toFixed(1); }
    svg.append(el('path', { d, fill: 'none', stroke: css('--truth'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
  }
  // weighted histogram outline
  if (o.wts) {
    let d = '';
    for (let b = 0; b < nb; b++) d += (b ? 'L' : 'M') + bx(b).toFixed(1) + ',' + Y(wsum[b]).toFixed(1) + 'L' + bx(b + 1).toFixed(1) + ',' + Y(wsum[b]).toFixed(1);
    svg.append(el('path', { d, fill: 'none', stroke: css('--c-w'), 'stroke-width': 2 }));
  }
  // box plot
  if (o.box) {
    const b = o.box, yy = m.t - 14;
    svg.append(el('rect', { x: X(b.q1), y: yy, width: Math.max(1, X(b.q3) - X(b.q1)), height: 10, fill: 'none', stroke: css('--c-med'), 'stroke-width': 1.5, rx: 2 }));
    svg.append(el('line', { x1: X(b.med), x2: X(b.med), y1: yy, y2: yy + 10, stroke: css('--c-med'), 'stroke-width': 2.5 }));
  }
  // marker lines (clamped to the window, labelled with an arrow if off-scale)
  for (const L of o.lines || []) {
    if (!Number.isFinite(L.x)) continue;
    const off = L.x < lo || L.x > hi, x = X(L.x);
    svg.append(el('line', { x1: x, x2: x, y1: m.t - (L.tall ? 6 : 0), y2: H - m.b, stroke: L.color, 'stroke-width': L.w || 2, 'stroke-dasharray': L.dash || '' }));
    if (off) svg.append(el('text', { x: L.x < lo ? x + 4 : x - 4, y: m.t + 12 + (L.row || 0) * 13, 'text-anchor': L.x < lo ? 'start' : 'end', class: 'val' }, (L.x < lo ? '◀ ' : '') + fmt(L.x) + (L.x > hi ? ' ▶' : '')));
  }
  if (offL) svg.append(el('text', { x: m.l + 4, y: H - m.b - 6, class: 'val' }, `◀ ${offL} off-scale`));
  if (offR) svg.append(el('text', { x: W - m.r - 4, y: H - m.b - 6, 'text-anchor': 'end', class: 'val' }, `${offR} off-scale ▶`));
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}
const TRUE_MU = () => S.TRUE_MU;

function legendBase() {
  return (st.reveal ? swatch('box', css('--norm'), 'Gaussian samples') + swatch('box', css('--outl'), 'contaminants') : swatch('box', css('--norm'), 'samples'))
    + (st.truth ? swatch('dash', css('--truth'), 'true N(5, 1.5²) part') : '');
}
function table(head, rows) {
  return `<table class="est"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
    `<tr class="${r.cls || ''}">${r.c.map((c) => `<td${c && c.bad ? ' class="bad"' : ''}>${c && c.bad ? c.t : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// flag estimates that are badly off
const errCell = (v, truth, tol) => Math.abs(v - truth) > tol ? { bad: 1, t: fmt(v) } : fmt(v);

// ---------- sections ----------
let data, meas;
function renderAll() {
  data = S.makeSample({ n: st.n, f: st.f, gamma: st.gamma, seed: st.seed });
  const { x, out } = data;
  const nOut = out.reduce((a, b) => a + b, 0);
  const clean = Float64Array.from(x.filter((_, i) => !out[i]));
  $('oN').textContent = st.n; $('oF').textContent = (st.f * 100).toFixed(1) + '%'; $('oG').textContent = st.gamma.toFixed(1);

  // 0: raw data
  histogram($('h0'), { x, out });
  $('l0').innerHTML = legendBase() + `<span class="small">${nOut} of ${st.n} samples are contaminants</span>`;

  // 1: mean / sd
  const m1 = S.mean(x), s1 = S.sd(x);
  histogram($('h1'), { x, out, bands: [{ a: m1 - s1, b: m1 + s1, color: css('--c-mean') }],
    lines: [{ x: m1, color: css('--c-mean'), w: 2.5, row: 0 }, ...(st.reveal ? [{ x: S.mean(clean), color: css('--truth'), dash: '2 3', w: 2, row: 1 }] : [])] });
  $('l1').innerHTML = legendBase() + swatch('line', css('--c-mean'), 'mean') + swatch('box', css('--c-mean') + '40', '± 1 std dev') + (st.reveal ? swatch('dot', css('--truth'), 'mean of the Gaussian samples only') : '');
  $('r1').innerHTML = table(['', 'center', 'spread'], [
    { c: ['mean, std dev', errCell(m1, 5, 0.3), errCell(s1, 1.5, 0.4)] },
    { cls: 'ref', c: ['oracle: Gaussian samples only', fmt(S.mean(clean)), fmt(S.sd(clean))] },
    { cls: 'ref', c: ['truth', '5.00', '1.50'] }]);

  // 2: median / quantiles
  const r = S.robust(x), rs = $('s2val');
  const kind = document.querySelector('input[name=s2]:checked').value;
  const sig2 = { mad: r.madSigma, iqr: r.iqrSigma, pct: r.pctSigma }[kind];
  const trim = +$('trim').value; $('otrim').textContent = (trim * 100).toFixed(0) + '%';
  const tm = S.trimmedMean(x, trim);
  histogram($('h2'), { x, out, box: { q1: r.q1, q3: r.q3, med: r.median }, bands: [{ a: r.median - sig2, b: r.median + sig2, color: css('--c-med') }],
    lines: [{ x: r.median, color: css('--c-med'), w: 2.5, row: 0 }, { x: tm, color: css('--c-med'), dash: '2 3', w: 2, row: 1 }] });
  $('l2').innerHTML = legendBase() + swatch('line', css('--c-med'), 'median') + swatch('dot', css('--c-med'), `${(trim * 100).toFixed(0)}%-trimmed mean`) + swatch('box', css('--c-med') + '40', '± selected spread') + `<span class="small">box-plot above: Q₁, median, Q₃</span>`;
  $('r2').innerHTML = table(['', 'center', 'spread'], [
    { cls: kind === 'mad' ? 'hl' : '', c: ['median, 1.4826·MAD', errCell(r.median, 5, 0.3), errCell(r.madSigma, 1.5, 0.4)] },
    { cls: kind === 'iqr' ? 'hl' : '', c: ['median, IQR / 1.349', errCell(r.median, 5, 0.3), errCell(r.iqrSigma, 1.5, 0.4)] },
    { cls: kind === 'pct' ? 'hl' : '', c: ['median, (Q84 − Q16) / 2', errCell(r.median, 5, 0.3), errCell(r.pctSigma, 1.5, 0.4)] },
    { c: [`${(trim * 100).toFixed(0)}%-trimmed mean`, errCell(tm, 5, 0.3), '—'] },
    { cls: 'ref', c: ['for comparison: mean, std dev', fmt(m1), fmt(s1)] }]);

  // 3: sigma clipping
  const k = +$('ck').value, cen = document.querySelector('input[name=cc]:checked').value, dev = document.querySelector('input[name=cd]:checked').value, mi = +$('cm').value;
  $('ock').textContent = k.toFixed(1); $('ocm').textContent = mi;
  const steps = S.sigmaClip(x, { k, cen, dev, maxIter: mi });
  const sl = $('cs'), key = `${st.seed}|${st.n}|${st.f}|${st.gamma}|${k}|${cen}|${dev}|${mi}`;
  if (sl.dataset.key !== key) { sl.dataset.key = key; sl.max = steps.length - 1; sl.value = steps.length - 1; }
  const si = Math.min(+sl.value, steps.length - 1), sp = steps[si];
  $('ocs').textContent = `${si} / ${steps.length - 1}`;
  const cor = $('ccor').checked, cf = cor && si > 0 ? S.truncSdFactor(k) : 1;
  const cutLo = sp.center - k * sp.scale, cutHi = sp.center + k * sp.scale, sdc = sp.sd / cf;
  histogram($('h3'), { x, out, keep: sp.mask, bands: [{ a: sp.mu - sdc, b: sp.mu + sdc, color: css('--c-clip') }],
    lines: [{ x: sp.mu, color: css('--c-clip'), w: 2.5, row: 0 }, { x: cutLo, color: css('--c-clip'), dash: '6 4', w: 1.5, row: 1 }, { x: cutHi, color: css('--c-clip'), dash: '6 4', w: 1.5, row: 1 }] });
  $('l3').innerHTML = legendBase() + swatch('box', css('--cut'), 'clipped out') + swatch('line', css('--c-clip'), 'mean of kept') + swatch('box', css('--c-clip') + '40', '± std of kept') + swatch('dash', css('--c-clip'), `next cut: ${cen} ± ${k.toFixed(1)}·${dev}`);
  $('r3').innerHTML = table(['pass', 'kept', 'cut center', 'cut scale', 'mean', 'std dev' + (cor ? ' (corrected)' : '')],
    steps.map((s, i) => ({ cls: i === si ? 'hl' : '', c: [i === 0 ? '0 (no clipping)' : i, `${s.n} / ${st.n}`, fmt(s.center), fmt(s.scale), errCell(s.mu, 5, 0.3), errCell(i && cor ? s.sd / S.truncSdFactor(k) : s.sd, 1.5, 0.4)] })));

  // 4: weighted
  const honest = $('wh').checked, clipW = $('wc').checked, wk = +$('wk').value; $('owk').textContent = wk.toFixed(1);
  meas = S.makeMeasured({ n: st.n, f: st.f, honest, seed: st.seed });
  const wsteps = S.weightedClip(meas.x, meas.s, wk, 10);
  const wfinal = clipW ? wsteps[wsteps.length - 1] : wsteps[0];
  const wts = Float64Array.from(meas.s, (s, i) => (wfinal.mask[i] ? 1 / (s * s) : 0));
  const um = S.mean(meas.x), us = S.sd(meas.x);
  histogram($('h4'), { x: meas.x, out: meas.out, keep: wfinal.mask, wts,
    bands: [{ a: wfinal.mu - wfinal.sdW, b: wfinal.mu + wfinal.sdW, color: css('--c-w'), op: 0.1 }, { a: wfinal.mu - wfinal.errMu, b: wfinal.mu + wfinal.errMu, color: css('--c-w'), op: 0.45 }],
    lines: [{ x: wfinal.mu, color: css('--c-w'), w: 2.5, row: 0 }, { x: um, color: css('--c-mean'), dash: '2 3', w: 2, row: 1 }] });
  $('l4').innerHTML = swatch('box', css('--norm'), 'samples (counts)') + (st.reveal ? swatch('box', css('--outl'), 'contaminants') : '') + (clipW ? swatch('box', css('--cut'), 'clipped out') : '') +
    swatch('line', css('--c-w'), 'weighted histogram (each sample counts ∝ 1/σᵢ²)') + swatch('line', css('--c-w'), 'weighted mean ± error on the mean (dark), ± s<sub>w</sub> (light)') + swatch('dot', css('--c-mean'), 'unweighted mean');
  forest($('h4b'), meas, wfinal, wk);
  $('l4b').innerHTML = swatch('line', css('--c-w'), 'weighted mean') + `<span class="small">first 40 measurements, each with its error bar ±σᵢ; faded = clipped out; arrows = error bar runs off the window</span>`;
  const un = S.weighted(meas.x, meas.s.map(() => 1));
  $('r4').innerHTML = table(['', 'center', 'spread', 'error on mean', 'χ²ᵥ'], [
    { c: ['unweighted mean, std dev', errCell(um, 5, 0.3), fmt(us), fmt(us / Math.sqrt(st.n), 3), '—'] },
    { cls: 'hl', c: ['weighted mean, s<sub>w</sub>' + (clipW ? ' (clipped)' : ''), errCell(wfinal.mu, 5, 3 * wfinal.errMu + 0.05), fmt(wfinal.sdW), fmt(wfinal.errMu, 3), { bad: wfinal.chi2red > 1.5, t: fmt(wfinal.chi2red) }.bad ? { bad: 1, t: fmt(wfinal.chi2red) } : fmt(wfinal.chi2red)] },
    { cls: 'ref', c: ['expected if bars are honest: √(N/Σw)', '5.00', fmt(wfinal.typicalErr), fmt(wfinal.errMu, 3), '≈ 1'] }]);
}

function forest(svg, d, wf, wk) {
  const n = Math.min(40, d.x.length), W = 760, rh = 8, m = { l: 44, r: 14, t: 10, b: 28 }, H = m.t + m.b + n * rh;
  const lo = S.TRUE_MU - st.half, hi = S.TRUE_MU + st.half;
  const X = (v) => m.l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - m.l - m.r);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
  const xs = niceStep(hi - lo, 8);
  for (let v = Math.ceil(lo / xs) * xs; v <= hi + 1e-9; v += xs) { svg.append(el('line', { x1: X(v), x2: X(v), y1: m.t, y2: H - m.b, class: 'tick' })); svg.append(el('text', { x: X(v), y: H - m.b + 15, 'text-anchor': 'middle' }, +v.toFixed(6))); }
  svg.append(el('rect', { x: X(wf.mu - wf.errMu), y: m.t, width: Math.max(1, X(wf.mu + wf.errMu) - X(wf.mu - wf.errMu)), height: n * rh, fill: css('--c-w'), opacity: 0.25 }));
  svg.append(el('line', { x1: X(wf.mu), x2: X(wf.mu), y1: m.t, y2: m.t + n * rh, stroke: css('--c-w'), 'stroke-width': 2 }));
  for (let i = 0; i < n; i++) {
    const y = m.t + i * rh + rh / 2, kept = wf.mask[i];
    const col = st.reveal && d.out[i] ? css('--outl') : css('--norm');
    const g = el('g', { opacity: kept ? 1 : 0.35 });
    g.append(el('line', { x1: X(d.x[i] - d.s[i]), x2: X(d.x[i] + d.s[i]), y1: y, y2: y, stroke: col, 'stroke-width': 1.5 }));
    g.append(el('circle', { cx: X(d.x[i]), cy: y, r: 2.6, fill: col }));
    if (d.x[i] - d.s[i] < lo) g.append(el('text', { x: m.l + 1, y: y + 3, style: 'font-size:8px' }, '◀'));
    if (d.x[i] + d.s[i] > hi) g.append(el('text', { x: W - m.r - 1, y: y + 3, 'text-anchor': 'end', style: 'font-size:8px' }, '▶'));
    g.append(el('title', {}, `x = ${fmt(d.x[i])} ± ${fmt(d.s[i])}${d.out[i] ? ' (contaminant)' : ''}`));
    svg.append(g);
  }
  svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
}

// ---------- simulation (section 5) ----------
let simCache = null, simTimer = 0;
function runSim() {
  $('simInfo').textContent = 'running…';
  setTimeout(() => {
    const trials = st.n > 800 ? 60 : st.n > 400 ? 120 : 200;
    const fracs = [0, 0.01, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2, 0.25];
    const t0 = performance.now();
    simCache = S.simulate({ n: st.n, gamma: st.gamma, fracs, trials, seed: 12345 });
    $('simInfo').textContent = `${trials} trials per point, N = ${st.n}, γ = ${st.gamma.toFixed(1)} (${Math.round(performance.now() - t0)} ms)`;
    drawSim();
  }, 20);
}
function drawSim() {
  if (!simCache) return;
  const mode = document.querySelector('input[name=sm]:checked').value;
  const cols = [css('--c-mean'), css('--c-med'), css('--c-clip'), css('--c-clip')], dashes = ['', '', '', '6 4'];
  const chart = (svg, key) => {
    const W = 400, H = 280, m = { l: 48, r: 14, t: 12, b: 36 };
    const fr = simCache.res.map((r) => r.f), series = simCache.names.map((_, j) => simCache.res.map((r) => Math.max(1e-3, r[key][j])));
    const lmin = Math.floor(Math.log10(Math.min(...series.flat()))), lmax = Math.ceil(Math.log10(Math.max(...series.flat())));
    const X = (f) => m.l + f / 0.25 * (W - m.l - m.r), Y = (v) => H - m.b - (Math.log10(v) - lmin) / (lmax - lmin) * (H - m.t - m.b);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.replaceChildren();
    for (let e = lmin; e <= lmax; e++) { svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(10 ** e), y2: Y(10 ** e), class: 'tick' })); svg.append(el('text', { x: m.l - 5, y: Y(10 ** e) + 4, 'text-anchor': 'end' }, 10 ** e >= 1 ? 10 ** e : (10 ** e).toString())); }
    for (const f of [0, 0.05, 0.1, 0.15, 0.2, 0.25]) svg.append(el('text', { x: X(f), y: H - m.b + 15, 'text-anchor': 'middle' }, (f * 100) + '%'));
    svg.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 4, 'text-anchor': 'middle' }, 'outlier fraction f'));
    series.forEach((s, j) => {
      svg.append(el('path', { d: s.map((v, i) => (i ? 'L' : 'M') + X(fr[i]).toFixed(1) + ',' + Y(v).toFixed(1)).join(''), fill: 'none', stroke: cols[j], 'stroke-width': 2, 'stroke-dasharray': dashes[j] }));
      s.forEach((v, i) => { const c = el('circle', { cx: X(fr[i]), cy: Y(v), r: 2.8, fill: cols[j] }); c.append(el('title', {}, `${simCache.names[j]}, f = ${(fr[i] * 100).toFixed(0)}%: ${v.toPrecision(2)}`)); svg.append(c); });
    });
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis' }));
  };
  chart($('s1'), mode === 'med' ? 'cMed' : 'c90');
  chart($('s2'), mode === 'med' ? 'sMed' : 's90');
  $('ls').innerHTML = simCache.names.map((n, j) => swatch(j === 3 ? 'dash' : 'line', cols[j], n)).join('') + '<span class="small">log scale; dots are hoverable</span>';
}

// ---------- wiring ----------
function bind() {
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('gN', 'input', (e) => { st.n = +e.target.value; renderAll(); queueSim(); });
  on('gF', 'input', (e) => { st.f = +e.target.value; renderAll(); });
  on('gG', 'input', (e) => { st.gamma = +e.target.value; renderAll(); queueSim(); });
  on('gW', 'change', (e) => { st.half = +e.target.value; renderAll(); });
  on('gNew', 'click', () => { st.seed++; renderAll(); });
  on('gReveal', 'change', (e) => { st.reveal = e.target.checked; renderAll(); });
  on('gTruth', 'change', (e) => { st.truth = e.target.checked; renderAll(); });
  for (const id of ['trim', 'ck', 'cm', 'cs', 'ccor', 'wh', 'wc', 'wk']) on(id, 'input', renderAll);
  for (const n of ['s2', 'cc', 'cd']) document.querySelectorAll(`input[name=${n}]`).forEach((e) => e.addEventListener('change', renderAll));
  document.querySelectorAll('input[name=sm]').forEach((e) => e.addEventListener('change', drawSim));
  on('simGo', 'click', runSim);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderAll(); drawSim(); });
}
function queueSim() { clearTimeout(simTimer); simTimer = setTimeout(runSim, 500); }

bind();
renderAll();
runSim();
if (window.renderMathInElement) renderMath(); else addEventListener('load', renderMath);
function renderMath() {
  renderMathInElement(document.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
}
