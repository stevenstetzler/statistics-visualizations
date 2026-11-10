import { createState, createScatter, createParamView, createModelView, createHistView, histStats, createChiPlot, chiSf, buildSliders, xSliders, ySliders, abSliders, sigmaSlider,
  solve, fitParams, bootstrapSamples, MODES, setCenter, modelC, xbasis, xbar, covHTML, dot, sub, ONES, fmt, vfmt, clamp, gauss, add, scale, norm, colors } from './lib.js';

const DEFAULT = { x: [0, 1, 2], y: [1, 2.6, 3], a: 0.5, b: 1.2, sigma: 1, center: false, cloudCenter: 'c' };
const state = createState(DEFAULT);
const $ = (id) => document.getElementById(id);
const col = colors();
const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;

/* sliders */
const refresh = [
  buildSliders($('slX'), xSliders(), state),
  buildSliders($('slY'), ySliders(), state),
  buildSliders($('slAB'), abSliders(), state),
  buildSliders($('slAB2'), abSliders(), state),
  buildSliders($('slSigma'), [sigmaSlider()], state),
  buildSliders($('slY3'), ySliders(), state),
  buildSliders($('slAB3'), abSliders(), state),
  buildSliders($('slSigma3'), [sigmaSlider()], state),
];

/* views */
const scatter = createScatter($('scatter1'), state, { draggable: true, showFit: true });
const model3d = createModelView($('view3d'), state, { cloud: false });
const noise3d = createModelView($('view3dNoise'), state, { cloud: true, minimal: true, camera: [11, 6, 9] });
const param = createParamView($('paramSvg'), state);
const hist = createHistView($('histSvg'), state);
const scatter2 = createScatter($('scatter2'), state, { draggable: true, showCand: true, showFit: true });
const chi1 = createChiPlot($('chi1'), 1, col.fit), chi2 = createChiPlot($('chi2'), 2, col.ink), chi3 = createChiPlot($('chi3'), 3, col.cand);
let stat = 'res';

/* buttons */
$('resetData').onclick = () => { state.x = [...DEFAULT.x]; state.y = [...DEFAULT.y]; state.emit(); };
$('snap').onclick = $('snap2').onclick = () => { const p = fitParams(state, state.y); state.a = clamp(p.a, -8, 8); state.b = clamp(p.b, -3, 3); state.emit(); };
$('centerX').onchange = (e) => { setCenter(state, e.target.checked); state.emit(); };
$('ccSeg').onclick = (e) => {
  const v = e.target.dataset && e.target.dataset.v; if (!v) return;
  state.cloudCenter = v;
  [...$('ccSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  state.emit();
};
$('dfSeg').onclick = (e) => {
  const v = e.target.dataset && e.target.dataset.v; if (!v) return;
  stat = v; state.emit();
};
$('curved').onclick = () => { state.x = [0, 1, 2]; state.y = [0, 3, 0]; state.emit(); };
$('draw').onclick = () => {
  const c = modelC(state);
  state.y = add(c, scale([gauss(), gauss(), gauss()], state.sigma)).map((v) => clamp(Math.round(v * 20) / 20, -5.5, 5.5));
  state.emit();
};

/* text readouts */
function setupTable() {
  const f = solve(state.x, state.y);
  let h = '<table class="data"><tr><th>i</th><th>xᵢ</th><th>yᵢ</th><th>ŷᵢ = â + b̂·xᵢ</th><th>rᵢ = yᵢ − ŷᵢ</th></tr>';
  for (let i = 0; i < 3; i++) h += `<tr><td>${i + 1}</td><td>${fmt(state.x[i], 1)}</td><td>${fmt(state.y[i], 1)}</td><td>${fmt(f.yhat[i])}</td><td>${fmt(f.r[i])}</td></tr>`;
  h += `</table><p class="small mono">â = ${fmt(f.a)}, b̂ = ${fmt(f.b)} &nbsp;·&nbsp; RSS = ${fmt(dot(f.r, f.r))}</p>`;
  $('setupTable').innerHTML = f.degenerate ? '<p class="warn">All x values are equal: the slope cannot be estimated. Spread them out.</p>' : h;
}
function readouts() {
  const f = solve(state.x, state.y), xb = xbasis(state);
  const xs = state.center ? '(x − x̄)' : 'x';
  $('ro2').innerHTML = f.degenerate ? '' :
    kv('residuals r', vfmt(f.r)) +
    kv('sum of residuals', fmt(f.r[0] + f.r[1] + f.r[2])) +
    kv('Σ rᵢ·xᵢ', fmt(dot(f.r, state.x)));
  if (f.degenerate) { $('ro3').innerHTML = '<div class="warn">All x equal: 1 and x point the same way, so the plane collapses.</div>'; $('ro4').innerHTML = covHTML(state); return; }
  const c = modelC(state), ru = dot(f.r, f.u);
  const dist2 = dot(sub(state.y, c), sub(state.y, c));
  $('ro3').innerHTML =
    kv('fit ŷ', vfmt(f.yhat)) +
    kv('residual r', `${vfmt(f.r)}<br>r·1 = ${fmt(dot(f.r, ONES))}, r·${xs} = ${fmt(dot(f.r, xb))}`) +
    kv('RSS = ‖r‖² = (r·u)²', `${fmt(dot(f.r, f.r))} (r·u = ${fmt(ru)})`) +
    kv('your model c: ‖y − c‖²', `${fmt(dist2)} ≥ RSS, with equality only when c = ŷ`);
  const p = fitParams(state, state.y);
  $('ro4').innerHTML = covHTML(state) + kv('your dataset\'s fit (â, b̂)', `(${fmt(p.a)}, ${fmt(p.b)})`);
}

function modeNote() {
  const mode = state.cloudCenter, S = bootstrapSamples(state);
  const stats = {
    c: 'Centered on the true c with the true noise: this is the actual sampling distribution of (â, b̂). Both contours should hug the dots.',
    fit: 'Centered on your fit ŷ, with Gaussian noise of standard deviation σ (the slider stands in for σ̂). The cloud has the same shape as the truth cloud, but the dots now center on your (â, b̂), not on the truth.',
    resid: 'Each resample is ŷ plus the three residuals redrawn with replacement. The σ slider is ignored: the noise comes from the data. The residual vector always points along u (for equally spaced x it is (c, −2c, c)), so there are only a handful of different datasets, and the dots form a few clumps.',
    pairs: '',
  };
  let h = `<p><b>${MODES[mode]}.</b> ${stats[mode]}</p>`;
  if (mode === 'pairs') {
    const bad = S.filter((t) => !t.raw).length, perfect = S.filter((t) => t.raw && t.distinct === 2).length;
    h = `<p><b>${MODES[mode]}.</b> Each resample draws 3 of your (x, y) pairs with replacement, so it has its own x and its own plane. The σ slider is ignored. Of the ${S.length} resamples drawn here: <b>${bad}</b> had all x equal (the slope is undefined, so no dot) and <b>${perfect}</b> used only two distinct points (a perfect fit, zero residual). The remaining resamples use all three points again, which just reproduces your original fit. The 3-D cloud shows only the resampled y vectors, at most 27 distinct points.</p>`;
  }
  $('modeNote').innerHTML = h;
}

function histNote(st) {
  if (!st) return '';
  const mode = state.cloudCenter, n = st.zs.length;
  const pct = (f) => Math.round((100 * st.zs.filter(f).length) / n);
  if (mode === 'pairs') {
    const zero = pct((z) => z < 1e-9);
    return `<p><b>Pairs: RSS is not χ² at all.</b> Each resample is fit with its own x, and when it contains only one or two distinct points the line passes through them exactly. <b>${zero}%</b> of the resamples have RSS = 0 exactly, and the rest sit at a single value (those just reorder your original points). With three observations and two parameters there is nothing left to resample. Only the leftover (1 df) quantity is defined here, since there is no shared plane.</p>`;
  }
  if (mode === 'resid') return `<p><b>Residual bootstrap: a few spikes, not a curve.</b> Every resample is built from the same residual vector, which points along u, so the squared length along u can only take a handful of values. Scaled by σ̂² = RSS/(n − p) it is not a smooth χ²₁, even though it has the right average. The σ slider is ignored.</p>`;
  const what = mode === 'c' ? 'The histogram follows the curve because the noise really is Gaussian with this σ and the model really is c.' : 'The center does not matter for the leftover part: u is perpendicular to the plane, so shifting the cloud within the plane leaves its distance along u unchanged. Only σ matters, and the curve is the same as for the truth.';
  const extra = st.stat === 'tot' ? ' Total = absorbed + leftover, so the 3-df histogram is the sum of the other two.' : st.stat === 'abs' ? ' This part is what moves (â, b̂): the in-plane noise.' : '';
  return `<p>${what}${extra} If you use the wrong σ the whole histogram scales, whatever df you use.</p>`;
}

/** one-line reading of a tail probability */
function reading(k, z, what) {
  const upper = chiSf(k, z), lower = 1 - upper;
  if (upper < 0.01) return `<b style="color:var(--resid)">Far in the right tail</b>: noise this size would exceed ${what} only ${fmt(upper * 100, 1)}% of the time.`;
  if (upper < 0.05) return `<b style="color:var(--resid)">Right tail</b>: only ${fmt(upper * 100, 1)}% of noise draws are this large.`;
  if (lower < 0.05) return `<b>Left tail</b>: closer than ${fmt((1 - lower) * 100, 0)}% of noise draws would be.`;
  if (upper < 0.1) return `<b>Borderline</b>: ${fmt(upper * 100, 1)}% of noise draws are at least this large.`;
  return `<b style="color:var(--res-u)">Typical</b>: ${fmt(upper * 100, 0)}% of noise draws are at least this large.`;
}
function fitSection() {
  const f = solve(state.x, state.y), s2 = state.sigma * state.sigma;
  if (f.degenerate) { ['v1', 'v2', 'v3'].forEach((id) => { $(id).innerHTML = ''; }); $('verdict').innerHTML = '<p class="warn">All x values are equal, so there is no plane. Spread the x values out.</p>'; return; }
  const c = modelC(state), tot = dot(sub(state.y, c), sub(state.y, c)), rss = dot(f.r, f.r), abs = Math.max(tot - rss, 0);
  const z1 = rss / s2, z2 = abs / s2, z3 = tot / s2;
  chi1(z1, 'RSS / σ²'); chi3(z3, '‖y − c‖² / σ²'); chi2(z2, '‖ŷ − c‖² / σ²');
  $('v1').innerHTML = reading(1, z1, 'this RSS');
  $('v3').innerHTML = reading(3, z3, 'this error');
  $('v2').innerHTML = reading(2, z2, 'this distance');
  const p1 = chiSf(1, z1), p2 = chiSf(2, z2), p3 = chiSf(3, z3);
  let v;
  if (p1 < 0.05) v = `<p><b>The line family does not fit.</b> Even the best line leaves RSS/σ² = ${fmt(z1)} (p = ${fmt(p1, 3)}). No choice of (a, b) will look good at σ = ${fmt(state.sigma)}: either the data are not linear, or the noise is bigger than assumed. Your own (a, b) at ${fmt(z3)} on χ²₃ (p = ${fmt(p3, 3)}) cannot do better than the best line.</p>`;
  else if (p2 < 0.05) v = `<p><b>The line family fits, but your (a, b) is a poor choice.</b> The best line is typical (RSS/σ² = ${fmt(z1)}, p = ${fmt(p1, 3)}), but your model is ${fmt(z2)} noise-units away from it inside the plane (p = ${fmt(p2, 3)} on χ²₂). Try "Set (a, b) to least squares".</p>`;
  else v = `<p><b>Looks like a good choice.</b> The best line is consistent with the noise (RSS/σ² = ${fmt(z1)}, p = ${fmt(p1, 3)}), and your (a, b) is within ordinary noise of it (${fmt(z2)} on χ²₂, p = ${fmt(p2, 3)}), so the data cannot tell it apart from the best fit. Overall error ${fmt(z3)} on χ²₃ (p = ${fmt(p3, 3)}).</p>`;
  $('verdict').innerHTML = v;
}

function renderAll() {
  refresh.forEach((r) => r());
  setupTable(); readouts(); modeNote();
  scatter(); model3d(); noise3d(); param(true);
  scatter2(); fitSection();
  const st = hist(stat);
  $('histNote').innerHTML = histNote(st);
  [...$('dfSeg').children].forEach((b) => { b.classList.toggle('on', st && b.dataset.v === st.stat); b.classList.toggle('dis', state.cloudCenter === 'pairs' && b.dataset.v !== 'res'); });
}
state.on(renderAll);
renderAll();
