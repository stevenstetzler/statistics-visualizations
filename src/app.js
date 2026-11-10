/* Explorer page: everything in one view. Shared pieces live in lib.js. */
import {
  createState, setHTML, typeset, createScatter, createModelView, createHistView, buildSliders, xSliders, ySliders, abSliders, sigmaSlider,
  solve, fitParams, setCenter, modelC, xbasis, xbar, dot, add, sub, scale, gauss, fmt, vfmt, clamp, colors, ONES,
} from './lib.js';

const DEFAULTS = { x: [0, 1, 2], y: [1, 2.6, 3], a: 0.5, b: 1.2, sigma: 1, center: false, cloudCenter: 'c', showCloud: true };
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
const scatter = createScatter($('scatter'), state, { draggable: true, showCand: true, showFit: true, bands: true });
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
  const xb = xbasis(state);
  const xv = center ? String.raw`\mathbf x - \bar x\mathbf 1` : String.raw`\mathbf x`;   // second spanning vector
  const xs = center ? String.raw`(x - \bar x)` : 'x';
  const xp = center ? String.raw`(\mathbf x - \bar x\mathbf 1)` : String.raw`\mathbf x`;   // same, parenthesised when it follows a scalar
  const host = $('readout');
  if (f.degenerate) {
    setHTML(host, String.raw`<div class="warn">All \(x\) values are equal, so \(\mathbf 1\) and \(\mathbf x\) point the same way: the "plane" collapses to a line and the model has only \(p = 1\) free parameter. Spread the \(x\) values out to see the plane.</div>`);
    return;
  }
  const { r, u, yhat } = f;
  const c = modelC(state);
  const e = scale(sub(y, c), 1 / sigma);
  const tot = dot(e, e), resid = dot(e, u) ** 2, absorbed = tot - resid;
  const cosT = dot(ONES, xb) / (Math.sqrt(3) * Math.hypot(...xb)), ang = Math.acos(clamp(cosT, -1, 1)) * 180 / Math.PI;
  const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const level = fmt(center ? f.a + f.b * xbar(x) : f.a), slope = `${f.b < 0 ? '-' : '+'} ${fmt(Math.abs(f.b))}`;
  setHTML(host,
    kv(String.raw`angle between \(\mathbf 1\) and \(${xv}\)`, String.raw`${fmt(ang, 1)}°  ${Math.abs(ang - 90) < 0.05 ? '(perpendicular)' : String.raw`(oblique: \(\cos\theta = ${fmt(cosT, 3)}\))`}`) +
    kv('least-squares fit', String.raw`\(\hat y = ${level} ${slope}\,${xs}\)`) +
    kv(String.raw`fitted vector \(\hat{\mathbf y} = \hat a\mathbf 1 + \hat b\,${xp}\)`, vfmt(yhat)) +
    kv(String.raw`residual vector \(\mathbf r = \mathbf y - \hat{\mathbf y}\)`, vfmt(r)) +
    kv('perpendicular to both spanning vectors', String.raw`\(\mathbf r\cdot\mathbf 1 = ${fmt(dot(r, ONES))}\)  (residuals sum to 0)<br>\(\mathbf r\cdot${xp} = ${fmt(dot(r, xb))}\)  (uncorrelated with \(x\))`) +
    kv('the single free residual direction', String.raw`\(\mathbf u =\) ${vfmt(u)}<br>\(\mathbf r = (\mathbf r\cdot\mathbf u)\,\mathbf u\), with \(\mathbf r\cdot\mathbf u = ${fmt(dot(r, u))}\)<br>\(\lVert\mathbf r\rVert^2 = \mathrm{RSS} = ${fmt(dot(r, r))} = (\mathbf r\cdot\mathbf u)^2\)`) +
    kv(String.raw`treat \(\mathbf c\) as the truth, \(\boldsymbol\varepsilon = \mathbf y - \mathbf c\)  (\(\sigma = ${fmt(sigma)}\))`, String.raw`\(\lVert\boldsymbol\varepsilon\rVert^2/\sigma^2 = ${fmt(tot)}\) = <b style="color:${col.fit}">${fmt(absorbed)}</b> absorbed (2 df) + <b style="color:${col.resid}">${fmt(resid)}</b> left over (1 df)`) +
    kv(String.raw`\(\mathrm{RSS}/\sigma^2\), df \(= n - p = 1\)`, String.raw`\(${fmt(resid)} \sim \chi^2_1\) if the model is right`) +
    kv('estimated vs true noise', String.raw`\(\hat\sigma^2 = \mathrm{RSS}/(n-p) = ${fmt(dot(r, r))}\)<br>true \(\sigma^2 = ${fmt(sigma * sigma)}\)`));
}

/* -------------------------------------------------------------- render */
function renderAll() {
  const f = solve(state.x, state.y);
  setHTML(modelHead, state.center ? String.raw`Your model \(y = a + b\,(x - \bar x)\)` : String.raw`Your model \(y = a + b\,x\)`);
  refreshX(); refreshY(); refreshAB(); refreshSigma();
  scatter(); model(); drawReadout(f); hist($('stat').value);
}
state.on(renderAll);
renderAll();
typeset(document.body);
