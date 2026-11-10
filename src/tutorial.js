import { createState, createScatter, createParamView, createModelView, buildSliders, xSliders, ySliders, abSliders, sigmaSlider,
  solve, fitParams, setCenter, modelC, xbasis, xbar, covHTML, dot, sub, ONES, fmt, vfmt, clamp, gauss, add, scale, norm, colors } from './lib.js';

const DEFAULT = { x: [0, 1, 2], y: [0, 3, 0], a: 2, b: -0.5, sigma: 1, center: false, cloudCenter: 'c' };
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
];

/* views */
const scatter = createScatter($('scatter1'), state, { draggable: true, showFit: true });
const model3d = createModelView($('view3d'), state, { cloud: false });
const noise3d = createModelView($('view3dNoise'), state, { cloud: true, minimal: true, camera: [11, 6, 9] });
const param = createParamView($('paramSvg'), state);

/* buttons */
$('resetData').onclick = () => { state.x = [...DEFAULT.x]; state.y = [...DEFAULT.y]; state.emit(); };
$('snap').onclick = () => { const p = fitParams(state, state.y); state.a = clamp(p.a, -8, 8); state.b = clamp(p.b, -3, 3); state.emit(); };
$('centerX').onchange = (e) => { setCenter(state, e.target.checked); state.emit(); };
$('ccSeg').onclick = (e) => {
  const v = e.target.dataset && e.target.dataset.v; if (!v) return;
  state.cloudCenter = v;
  [...$('ccSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  state.emit();
};
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

function renderAll() {
  refresh.forEach((r) => r());
  setupTable(); readouts();
  scatter(); model3d(); noise3d(); param(true);
}
state.on(renderAll);
renderAll();
