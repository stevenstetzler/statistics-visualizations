/* Explorer page: everything in one view. Shared pieces live in lib.js. */
import {
  createState, createScatter, createModelView, createHistView, buildSliders, xSliders, ySliders, abSliders, sigmaSlider,
  solve, fitParams, setCenter, modelC, xbasis, xbar, dot, add, sub, scale, gauss, fmt, vfmt, clamp, colors, ONES,
} from './lib.js';

const DEFAULTS = { x: [0, 1, 2], y: [0, 3, 0], a: 2, b: -0.5, sigma: 1, center: false, cloudCenter: 'c', showCloud: true };
const state = createState(DEFAULTS);
const $ = (id) => document.getElementById(id);
const col = colors();

/* ------------------------------------------------------------- sliders */
const heading = (host, text) => { const h = document.createElement('div'); h.className = 'small'; h.style.marginTop = '10px'; h.textContent = text; host.appendChild(h); return h; };
const sliderHost = $('sliders');
heading(sliderHost, 'Predictor values');
const refreshX = buildSliders(sliderHost, xSliders(), state);
heading(sliderHost, 'Observed values');
const refreshY = buildSliders(sliderHost, ySliders(), state);
const modelHead = heading(sliderHost, '');
const refreshAB = buildSliders(sliderHost, abSliders(), state);
const refreshSigma = buildSliders($('noiseSliders'), [sigmaSlider()], state);

/* --------------------------------------------------------------- views */
const scatter = createScatter($('scatter'), state, { draggable: true, showCand: true, showFit: true });
const model = createModelView($('view'), state, { cloud: true, fits: false, epsilon: true });

/* ------------------------------------------------------------- buttons */
$('snap').onclick = () => { const p = fitParams(state, state.y); state.a = clamp(p.a, -8, 8); state.b = clamp(p.b, -3, 3); state.emit(); };
$('reset').onclick = () => {
  setCenter(state, false); $('center').checked = false;
  state.x = [...DEFAULTS.x]; state.y = [...DEFAULTS.y]; state.a = DEFAULTS.a; state.b = DEFAULTS.b; state.sigma = DEFAULTS.sigma;
  state.emit();
};
$('center').onchange = (e) => { setCenter(state, e.target.checked); state.emit(); };
$('cloud').onchange = (e) => { state.showCloud = e.target.checked; state.emit(); };
$('ccenter').onchange = (e) => { state.cloudCenter = e.target.value; state.emit(); };
$('stat').onchange = () => state.emit();
$('draw').onclick = () => {
  const e = [gauss(), gauss(), gauss()];
  state.y = add(modelC(state), scale(e, state.sigma)).map((v) => clamp(Math.round(v * 20) / 20, -5.5, 5.5));
  state.emit();
};

const hist = createHistView($('hist'), state);

/* ------------------------------------------------------------- readout */
function drawReadout(f) {
  const { x, y, sigma, center } = state;
  const xb = xbasis(state), xs = center ? '(x − x̄)' : 'x';
  const host = $('readout');
  if (f.degenerate) {
    host.innerHTML = '<div class="warn">All x values are equal, so 1 and x point the same way: the "plane" collapses to a line and the model has only p = 1 free parameter. Spread the x values out to see the plane.</div>';
    return;
  }
  const { r, u, yhat } = f;
  const c = modelC(state);
  const e = scale(sub(y, c), 1 / sigma);
  const tot = dot(e, e), resid = dot(e, u) ** 2, absorbed = tot - resid;
  const cosT = dot(ONES, xb) / (Math.sqrt(3) * Math.hypot(...xb)), ang = Math.acos(clamp(cosT, -1, 1)) * 180 / Math.PI;
  const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  host.innerHTML =
    kv('angle between 1 and ' + (center ? 'x − x̄' : 'x'), `${fmt(ang, 1)}°  ${Math.abs(ang - 90) < 0.05 ? '(perpendicular)' : '(oblique: cos θ = ' + fmt(cosT, 3) + ')'}`) +
    kv('least-squares fit', `ŷ = ${fmt(center ? f.a + f.b * xbar(x) : f.a)} ${f.b < 0 ? '−' : '+'} ${fmt(Math.abs(f.b))}·${xs}`) +
    kv(`fitted vector ŷ = â·1 + b̂·${xs}`, vfmt(yhat)) +
    kv('residual vector r = y − ŷ', vfmt(r)) +
    kv('perpendicular to both spanning vectors', `r·1 = ${fmt(dot(r, ONES))}  (residuals sum to 0)<br>r·${xs} = ${fmt(dot(r, xb))}  (uncorrelated with x)`) +
    kv('the single free residual direction', `u = ${vfmt(u)}<br>r = (r·u)·u with r·u = ${fmt(dot(r, u))}<br>‖r‖² = RSS = ${fmt(dot(r, r))} = (r·u)²`) +
    kv(`treat c as the truth, ε = y − c  (σ = ${fmt(sigma)})`, `‖ε‖²/σ² = ${fmt(tot)} = <b style="color:${col.fit}">${fmt(absorbed)}</b> absorbed (2 df) + <b style="color:${col.resid}">${fmt(resid)}</b> left over (1 df)`) +
    kv('RSS / σ², df = n − p = 1', `${fmt(resid)}   ~ χ²₁ if the model is right`) +
    kv('estimated vs true noise', `σ̂² = RSS/(n − p) = ${fmt(dot(r, r))}<br>true σ² = ${fmt(sigma * sigma)}`);
}

/* -------------------------------------------------------------- render */
function renderAll() {
  const f = solve(state.x, state.y);
  modelHead.textContent = state.center ? 'Your model  y = a + b·(x − x̄)' : 'Your model  y = a + b·x';
  refreshX(); refreshY(); refreshAB(); refreshSigma();
  scatter(); model(); drawReadout(f); hist($('stat').value);
}
state.on(renderAll);
renderAll();
