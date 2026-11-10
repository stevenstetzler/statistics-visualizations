import { createState, createScatter, createParamView, createModelView, createHistView, histStats, createChiPlot, chiSf, simTail, typeset, setHTML, buildSliders, xSliders, ySliders, abSliders, sigmaSlider,
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
const scatter2 = createScatter($('scatter2'), state, { draggable: true, showCand: true, showFit: true, bands: true });
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
    c: String.raw`Centered on the true \(\mathbf c\) with the true noise: this is the actual sampling distribution of \((\hat a, \hat b)\). Both contours should hug the dots.`,
    fit: String.raw`Centered on your fit \(\hat{\mathbf y}\), with Gaussian noise of standard deviation \(\sigma\) (the slider stands in for \(\hat\sigma\)). The cloud has the same shape as the truth cloud, but the dots now center on your \((\hat a, \hat b)\), not on the truth.`,
    resid: String.raw`Each resample is \(\hat{\mathbf y}\) plus the three residuals redrawn with replacement. The \(\sigma\) slider is ignored: the noise comes from the data. The residual vector always points along \(\mathbf u\) (for equally spaced \(x\) it is \((c, -2c, c)\)), so there are only a handful of different datasets, and the dots form a few clumps.`,
    pairs: '',
  };
  let h = `<p><b>${MODES[mode]}.</b> ${stats[mode]}</p>`;
  if (mode === 'pairs') {
    const bad = S.filter((t) => !t.raw).length, perfect = S.filter((t) => t.raw && t.distinct === 2).length;
    h = String.raw`<p><b>${MODES[mode]}.</b> Each resample draws 3 of your \((x, y)\) pairs with replacement, so it has its own \(x\) and its own plane. The \(\sigma\) slider is ignored. Of the ${S.length} resamples drawn here: <b>${bad}</b> had all \(x\) equal (the slope is undefined, so no dot) and <b>${perfect}</b> used only two distinct points (a perfect fit, zero residual). The remaining resamples use all three points again, which just reproduces your original fit. The 3-D cloud shows only the resampled \(\mathbf y\) vectors, at most 27 distinct points.</p>`;
  }
  setHTML($('modeNote'), h);
}

function histNote(st) {
  if (!st) return '';
  const mode = state.cloudCenter, n = st.zs.length;
  const pct = (f) => Math.round((100 * st.zs.filter(f).length) / n);
  if (mode === 'pairs') {
    const zero = pct((z) => z < 1e-9);
    return String.raw`<p><b>Pairs: RSS is not \(\chi^2\) at all.</b> Each resample is fit with its own \(x\), and when it contains only one or two distinct points the line passes through them exactly. <b>${zero}%</b> of the resamples have \(\mathrm{RSS} = 0\) exactly, and the rest sit at a single value (those just reorder your original points). With three observations and two parameters there is nothing left to resample. Only the leftover (1 df) quantity is defined here, since there is no shared plane.</p>`;
  }
  if (mode === 'resid') return String.raw`<p><b>Residual bootstrap: a few spikes, not a curve.</b> Every resample is built from the same residual vector, which points along \(\mathbf u\), so the squared length along \(\mathbf u\) can only take a handful of values. Scaled by \(\hat\sigma^2 = \mathrm{RSS}/(n-p)\) it is not a smooth \(\chi^2_1\), even though it has the right average. The \(\sigma\) slider is ignored.</p>`;
  const what = mode === 'c'
    ? String.raw`The histogram follows the curve because the noise really is Gaussian with this \(\sigma\) and the model really is \(\mathbf c\).`
    : String.raw`The center does not matter for the leftover part: \(\mathbf u\) is perpendicular to the plane, so shifting the cloud within the plane leaves its distance along \(\mathbf u\) unchanged. Only \(\sigma\) matters, and the curve is the same as for the truth.`;
  const extra = st.stat === 'tot' ? ' Total = absorbed + leftover, so the 3-df histogram is the sum of the other two.' : st.stat === 'abs' ? ' This part is what moves \\((\\hat a, \\hat b)\\): the in-plane noise.' : '';
  return String.raw`<p>${what}${extra} If you use the wrong \(\sigma\) the whole histogram scales, whatever df you use.</p>`;
}

/** one-line reading of a tail probability, with a count from simulated repeats */
function reading(k, z) {
  const upper = chiSf(k, z), lower = 1 - upper, { count, n } = simTail(k, z);
  const pct = (p) => fmt(p * 100, p < 0.1 ? 1 : 0) + '%';
  const tail = `If the model were true, ${pct(upper)} of repeated experiments would give a value at least this large (simulated: ${count} of ${n}).`;
  let tag;
  if (upper < 0.01) tag = '<b style="color:var(--resid)">Far in the right tail.</b>';
  else if (upper < 0.05) tag = '<b style="color:var(--resid)">Right tail.</b>';
  else if (lower < 0.05) tag = '<b>Left tail: unusually small.</b>';
  else if (upper < 0.1) tag = '<b>Borderline.</b>';
  else tag = '<b style="color:var(--res-u)">Typical.</b>';
  return `${tag} ${tail}`;
}
function fitSection() {
  const f = solve(state.x, state.y), s2 = state.sigma * state.sigma;
  if (f.degenerate) { ['v1', 'v2', 'v3'].forEach((id) => { $(id).innerHTML = ''; }); setHTML($('verdict'), '<p class="warn">All x values are equal, so there is no plane. Spread the x values out.</p>'); return; }
  const c = modelC(state), tot = dot(sub(state.y, c), sub(state.y, c)), rss = dot(f.r, f.r), abs = Math.max(tot - rss, 0);
  const z1 = rss / s2, z2 = abs / s2, z3 = tot / s2;
  chi1(z1, 'RSS / σ²'); chi3(z3, '‖y − c‖² / σ²'); chi2(z2, '‖ŷ − c‖² / σ²');
  $('v1').innerHTML = reading(1, z1);
  $('v3').innerHTML = reading(3, z3);
  $('v2').innerHTML = reading(2, z2);
  const p1 = chiSf(1, z1), p2 = chiSf(2, z2), p3 = chiSf(3, z3);
  const sg = fmt(state.sigma);
  let v;
  if (p1 < 0.05) v = String.raw`<p><b>The line family does not fit.</b> Even the best line leaves \(\mathrm{RSS}/\sigma^2 = ${fmt(z1)}\) (\(p = ${fmt(p1, 3)}\)). No choice of \((a, b)\) will look good at \(\sigma = ${sg}\): either the data are not linear, or the noise is bigger than assumed. Your own \((a, b)\) at \(${fmt(z3)}\) on \(\chi^2_3\) (\(p = ${fmt(p3, 3)}\)) cannot do better than the best line.</p>`;
  else if (p2 < 0.05) v = String.raw`<p><b>The line family fits, but your \((a, b)\) is a poor choice.</b> The best line is typical (\(\mathrm{RSS}/\sigma^2 = ${fmt(z1)}\), \(p = ${fmt(p1, 3)}\)), but your model is \(${fmt(z2)}\) noise-units away from it inside the plane (\(p = ${fmt(p2, 3)}\) on \(\chi^2_2\)). Try "Set (a, b) to least squares".</p>`;
  else v = String.raw`<p><b>Looks like a good choice.</b> The best line is consistent with the noise (\(\mathrm{RSS}/\sigma^2 = ${fmt(z1)}\), \(p = ${fmt(p1, 3)}\)), and your \((a, b)\) is within ordinary noise of it (\(${fmt(z2)}\) on \(\chi^2_2\), \(p = ${fmt(p2, 3)}\)), so the data cannot tell it apart from the best fit. Overall error \(${fmt(z3)}\) on \(\chi^2_3\) (\(p = ${fmt(p3, 3)}\)).</p>`;
  setHTML($('verdict'), v);
}

function renderAll() {
  refresh.forEach((r) => r());
  setupTable(); readouts(); modeNote();
  scatter(); model3d(); noise3d(); param(true);
  scatter2(); fitSection();
  const st = hist(stat);
  setHTML($('histNote'), histNote(st));
  [...$('dfSeg').children].forEach((b) => { b.classList.toggle('on', st && b.dataset.v === st.stat); b.classList.toggle('dis', state.cloudCenter === 'pairs' && b.dataset.v !== 'res'); });
}
state.on(renderAll);
renderAll();
typeset(document.body);
