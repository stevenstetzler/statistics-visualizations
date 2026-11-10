/* Shared pieces for tutorial.html: math, shared state, sliders, 2-D plots, 3-D model view. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

/* ------------------------------------------------------------------ math */
export const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
export const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
export const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
export const scale = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
export const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
export const norm = (p) => Math.hypot(p[0], p[1], p[2]);
export const unit = (p) => { const n = norm(p); return n < 1e-9 ? [0, 0, 0] : scale(p, 1 / n); };
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const ONES = [1, 1, 1];
export const fmt = (v, d = 2) => { const s = (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d); return s === '-0.00' ? '0.00' : s; };
export const vfmt = (v) => '(' + v.map((t) => fmt(t)).join(', ') + ')';
export const sub_ = (n) => '₀₁₂₃₄₅₆₇₈₉'[n];
const T = (v) => new THREE.Vector3(v[0], v[1], v[2]);

export const xbar = (x) => (x[0] + x[1] + x[2]) / 3;
/** second spanning vector: x, or x − x̄·1 when centred */
export const xbasis = (s) => (s.center ? sub(s.x, scale(ONES, xbar(s.x))) : s.x);
/** point in ℝ³ for the model (a, b) in the current parametrisation */
export const modelC = (s) => add(scale(ONES, s.a), scale(xbasis(s), s.b));
/** convert (a, b) of the current parametrisation to raw intercept/slope */
export const rawLine = (s) => ({ a: s.center ? s.a - s.b * xbar(s.x) : s.a, b: s.b });

/** least squares for y ≈ a + b x (raw) and the geometry of the fit */
export function solve(x, y) {
  const Sx = x[0] + x[1] + x[2], Sy = y[0] + y[1] + y[2], Sxx = dot(x, x), Sxy = dot(x, y);
  const det = 3 * Sxx - Sx * Sx;
  const degenerate = det < 1e-3;
  let a, b;
  if (degenerate) { b = 0; a = Sy / 3; } else { b = (3 * Sxy - Sx * Sy) / det; a = (Sy - b * Sx) / 3; }
  const yhat = add(scale(ONES, a), scale(x, b));
  const e1 = unit(ONES);
  const e2 = unit(sub(x, scale(e1, dot(x, e1))));
  const u = degenerate ? [0, 0, 0] : unit(cross(e1, e2));
  return { a, b, yhat, r: sub(y, yhat), e1, e2, u, degenerate };
}
/** LS fit expressed in the current parametrisation */
export function fitParams(s, y) {
  const f = solve(s.x, y);
  return { a: s.center ? f.a + f.b * xbar(s.x) : f.a, b: f.b };
}
/** covariance of (â, b̂) = σ² (XᵀX)⁻¹ for X = [1, xb] */
export function covAB(s, sigma = s.sigma) {
  const v2 = xbasis(s), g11 = 3, g12 = dot(ONES, v2), g22 = dot(v2, v2);
  const det = g11 * g22 - g12 * g12;
  if (det < 1e-6) return null;
  const k = sigma * sigma / det;
  return { va: k * g22, vb: k * g11, cab: -k * g12 };
}

/* ---------------------------------------------------------- random noise */
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(2024);
export const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
export const N_CLOUD = 400;
export const EPS = Array.from({ length: N_CLOUD }, () => [gauss(), gauss(), gauss()]);

/* ---------------------------------------------------------------- state */
export function createState(init) {
  const s = { ...init, x: [...init.x], y: [...init.y], _l: [] };
  s.on = (fn) => s._l.push(fn);
  s.emit = () => s._l.forEach((fn) => fn(s));
  s.snapshot = () => ({ ...init, x: [...init.x], y: [...init.y] });
  return s;
}
/** fixed random picks (0..2) used by the residual and pairs bootstraps */
export const IDX = Array.from({ length: N_CLOUD }, () => [0, 1, 2].map(() => Math.floor(rng() * 3)));
export const MODES = {
  c: 'hypothesized truth c',
  fit: 'parametric bootstrap (ŷ + Gaussian noise)',
  resid: 'residual bootstrap (ŷ + resampled residuals)',
  pairs: 'pairs bootstrap (resampled (x, y) pairs)',
};
/**
 * Simulated datasets for the current cloud mode. Each sample has its own x (only the pairs
 * bootstrap changes it), its y vector in ℝ³, and its least-squares fit in raw (a, b).
 */
export function bootstrapSamples(s) {
  const mode = s.cloudCenter, f = solve(s.x, s.y), c = modelC(s);
  return EPS.map((e, i) => {
    let x = s.x, y;
    if (mode === 'c') y = add(c, scale(e, s.sigma));
    else if (mode === 'fit') y = add(f.yhat, scale(e, s.sigma));
    else if (mode === 'resid') y = add(f.yhat, IDX[i].map((k) => f.r[k]));
    else { x = IDX[i].map((k) => s.x[k]); y = IDX[i].map((k) => s.y[k]); }
    const g = solve(x, y);
    return { x, y, raw: g.degenerate ? null : { a: g.a, b: g.b }, distinct: new Set(IDX[i]).size };
  });
}
/** raw (a, b) -> the parametrisation currently selected (centred or not) */
export const toParam = (s, raw) => ({ a: s.center ? raw.a + raw.b * xbar(s.x) : raw.a, b: raw.b });
/** centre of the 3-D cloud, for labels */
export function cloudCenter(s) {
  return s.cloudCenter === 'c' ? modelC(s) : solve(s.x, s.y).yhat;
}
/** switch parametrisation but keep the same point c in 3-D */
export function setCenter(s, on) {
  if (on !== s.center) { s.a = clamp(s.a + (on ? 1 : -1) * s.b * xbar(s.x), -8, 8); s.center = on; }
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => location.reload());
export function colors() {
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();
  return { data: C('--data'), fit: C('--fit'), resid: C('--resid'), u: C('--res-u'), cand: C('--cand'), basis: C('--basis'), ink: C('--ink'), muted: C('--muted'), line: C('--line') };
}

/* --------------------------------------------------------------- sliders */
/** defs: [{name, min, max, step, get(s), set(s,v), title?}] */
export function buildSliders(host, defs, state) {
  const rows = defs.map((d) => {
    const row = document.createElement('div'); row.className = 'sl';
    row.innerHTML = `<label>${d.name}</label><input type="range" min="${d.min}" max="${d.max}" step="${d.step}"><output></output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', () => { d.set(state, parseFloat(input.value)); state.emit(); });
    host.appendChild(row);
    return { d, input, out };
  });
  return () => rows.forEach(({ d, input, out }) => { const v = d.get(state); input.value = v; out.textContent = fmt(v, d.step < 0.1 ? 2 : 1); });
}
export const xSliders = () => [0, 1, 2].map((i) => ({ name: `x${sub_(i + 1)}`, min: -3, max: 3, step: 0.1, get: (s) => s.x[i], set: (s, v) => { s.x[i] = v; } }));
export const ySliders = () => [0, 1, 2].map((i) => ({ name: `y${sub_(i + 1)}`, min: -5, max: 5, step: 0.1, get: (s) => s.y[i], set: (s, v) => { s.y[i] = v; } }));
export const abSliders = () => [
  { name: 'a', min: -8, max: 8, step: 0.05, get: (s) => s.a, set: (s, v) => { s.a = v; } },
  { name: 'b', min: -3, max: 3, step: 0.05, get: (s) => s.b, set: (s, v) => { s.b = v; } },
];
export const sigmaSlider = () => ({ name: 'σ', min: 0.1, max: 3, step: 0.05, get: (s) => s.sigma, set: (s, v) => { s.sigma = v; } });

/* ------------------------------------------------------------- SVG utils */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

/* ----------------------------------------------------- 2-D scatter (x, y) */
export function createScatter(svg, state, { draggable = true, showCand = false, showFit = true } = {}) {
  const col = colors();
  const SW = 320, SH = 230, M = { l: 30, r: 10, t: 10, b: 24 };
  svg.setAttribute('viewBox', `0 0 ${SW} ${SH}`);
  const XR = [-3.5, 3.5], YR = [-6, 6];
  const sx = (v) => M.l + ((v - XR[0]) / (XR[1] - XR[0])) * (SW - M.l - M.r);
  const sy = (v) => SH - M.b - ((v - YR[0]) / (YR[1] - YR[0])) * (SH - M.t - M.b);
  const isy = (py) => YR[0] + ((SH - M.b - py) / (SH - M.t - M.b)) * (YR[1] - YR[0]);
  for (let v = -6; v <= 6; v += 3) { svgEl('line', { x1: M.l, x2: SW - M.r, y1: sy(v), y2: sy(v), stroke: col.muted, 'stroke-opacity': v === 0 ? 0.6 : 0.2 }, svg); svgEl('text', { x: M.l - 5, y: sy(v) + 4, 'text-anchor': 'end', fill: col.muted, 'font-size': 10 }, svg).textContent = v; }
  for (let v = -3; v <= 3; v++) { svgEl('line', { x1: sx(v), x2: sx(v), y1: M.t, y2: SH - M.b, stroke: col.muted, 'stroke-opacity': v === 0 ? 0.6 : 0.2 }, svg); svgEl('text', { x: sx(v), y: SH - 8, 'text-anchor': 'middle', fill: col.muted, 'font-size': 10 }, svg).textContent = v; }
  svgEl('text', { x: SW - M.r, y: SH - 8, 'text-anchor': 'end', fill: col.muted, 'font-size': 11, 'font-style': 'italic' }, svg).textContent = 'x';
  svgEl('text', { x: M.l + 4, y: M.t + 10, fill: col.muted, 'font-size': 11, 'font-style': 'italic' }, svg).textContent = 'y';
  const lCand = svgEl('line', { stroke: col.cand, 'stroke-width': 2 }, svg);
  const lFit = svgEl('line', { stroke: col.fit, 'stroke-width': 2.5 }, svg);
  lCand.style.display = showCand ? '' : 'none'; lFit.style.display = showFit ? '' : 'none';
  const res = [0, 1, 2].map(() => svgEl('line', { stroke: col.resid, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg));
  const pts = [0, 1, 2].map((i) => {
    const g = svgEl('g', draggable ? { cursor: 'ns-resize' } : {}, svg);
    svgEl('circle', { r: 16, fill: 'transparent' }, g);
    svgEl('circle', { r: 6, fill: col.data, stroke: 'white', 'stroke-width': 1.5 }, g);
    svgEl('text', { fill: col.data, 'font-size': 11, 'font-weight': 600, dx: 9, dy: -8 }, g).textContent = `(x${sub_(i + 1)}, y${sub_(i + 1)})`;
    if (draggable) g.addEventListener('pointerdown', (ev) => {
      g.setPointerCapture(ev.pointerId);
      const move = (e2) => { const r = svg.getBoundingClientRect(); state.y[i] = clamp(Math.round(isy(((e2.clientY - r.top) / r.height) * SH) * 10) / 10, -5.5, 5.5); state.emit(); };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', () => g.removeEventListener('pointermove', move), { once: true });
    });
    return g;
  });
  const setLine = (el, A, B) => { el.setAttribute('x1', sx(XR[0])); el.setAttribute('x2', sx(XR[1])); el.setAttribute('y1', sy(A + B * XR[0])); el.setAttribute('y2', sy(A + B * XR[1])); };
  return () => {
    const { x, y } = state, f = solve(x, y), c = rawLine(state);
    setLine(lCand, c.a, c.b); setLine(lFit, f.a, f.b);
    for (let i = 0; i < 3; i++) {
      const px = sx(x[i]);
      res[i].setAttribute('x1', px); res[i].setAttribute('x2', px);
      res[i].setAttribute('y1', sy(f.a + f.b * x[i])); res[i].setAttribute('y2', sy(y[i]));
      pts[i].setAttribute('transform', `translate(${px},${sy(y[i])})`);
    }
  };
}

/* ------------------------------------------- 2-D parameter plot (a vs b) */
export function createParamView(svg, state) {
  const col = colors();
  const W = 340, H = 300, M = { l: 38, r: 12, t: 12, b: 32 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const AR = [-8, 8], BR = [-4, 4];
  const px = (a) => M.l + ((a - AR[0]) / (AR[1] - AR[0])) * (W - M.l - M.r);
  const py = (b) => H - M.b - ((b - BR[0]) / (BR[1] - BR[0])) * (H - M.t - M.b);
  const dyn = svgEl('g', {}, svg);
  const stat = svgEl('g', {}, svg);
  stat.innerHTML = '';
  for (let a = -8; a <= 8; a += 4) { svgEl('line', { x1: px(a), x2: px(a), y1: M.t, y2: H - M.b, stroke: col.muted, 'stroke-opacity': a === 0 ? 0.6 : 0.2 }, stat); svgEl('text', { x: px(a), y: H - 16, 'text-anchor': 'middle', fill: col.muted, 'font-size': 10 }, stat).textContent = a; }
  for (let b = -4; b <= 4; b += 2) { svgEl('line', { x1: M.l, x2: W - M.r, y1: py(b), y2: py(b), stroke: col.muted, 'stroke-opacity': b === 0 ? 0.6 : 0.2 }, stat); svgEl('text', { x: M.l - 5, y: py(b) + 4, 'text-anchor': 'end', fill: col.muted, 'font-size': 10 }, stat).textContent = b; }
  const ax = svgEl('text', { x: (M.l + W - M.r) / 2, y: H - 3, 'text-anchor': 'middle', fill: col.muted, 'font-size': 11, 'font-style': 'italic' }, stat);
  const ay = svgEl('text', { x: 11, y: H / 2, 'text-anchor': 'middle', fill: col.muted, 'font-size': 11, 'font-style': 'italic', transform: `rotate(-90 11 ${H / 2})` }, stat);
  const mark = (x, y, color, text, dy = -9) => { svgEl('circle', { cx: px(x), cy: py(y), r: 5, fill: color, stroke: 'white', 'stroke-width': 1.5 }, dyn); svgEl('text', { x: px(x) + 8, y: py(y) + dy, fill: color, 'font-size': 11, 'font-weight': 600, style: 'paint-order:stroke;stroke:var(--bg);stroke-width:3px' }, dyn).textContent = text; };
  const ellipse = (ctr, cov, stroke, op, dash, w = 1.5) => {
    const sq = Math.sqrt(cov.va), l21 = cov.cab / sq, l22 = Math.sqrt(Math.max(cov.vb - l21 * l21, 0));
    [[2.296, op, ''], [5.991, op * 0.7, dash || '5 4']].forEach(([k2, o, d]) => {
      let path = '';
      for (let t = 0; t <= 64; t++) {
        const th = (t / 64) * 2 * Math.PI, u = Math.sqrt(k2) * Math.cos(th), v = Math.sqrt(k2) * Math.sin(th);
        path += (t ? 'L' : 'M') + px(ctr.a + sq * u).toFixed(1) + ' ' + py(ctr.b + l21 * u + l22 * v).toFixed(1);
      }
      svgEl('path', { d: path, fill: 'none', stroke, 'stroke-width': w, 'stroke-opacity': o, 'stroke-dasharray': d }, dyn);
    });
  };
  const note = (y, text, color) => svgEl('text', { x: W - M.r, y, 'text-anchor': 'end', fill: color, 'font-size': 10 }, dyn).textContent = text;
  return (showCloud) => {
    dyn.innerHTML = '';
    ax.textContent = state.center ? 'a  (level at x̄)' : 'a  (intercept)';
    ay.textContent = 'b  (slope)';
    const truth = { a: state.a, b: state.b };
    const obs = fitParams(state, state.y);
    const mode = state.cloudCenter;
    if (showCloud) {
      const pts = bootstrapSamples(state).filter((t) => t.raw).map((t) => toParam(state, t.raw));
      pts.forEach((p) => svgEl('circle', { cx: px(p.a), cy: py(p.b), r: 2.2, fill: col.cand, 'fill-opacity': 0.4 }, dyn));
      if (mode === 'c' || mode === 'fit') {
        const cov = covAB(state);
        if (cov) { ellipse(mode === 'c' ? truth : obs, cov, col.ink, 1); note(M.t + 8, 'contours 68% / 95%: σ²(XᵀX)⁻¹', col.ink); }
      } else {
        // empirical covariance of the dots (solid) vs the formula with σ̂ (dotted)
        const n = pts.length;
        if (n > 3) {
          const ma = pts.reduce((t, p) => t + p.a, 0) / n, mb = pts.reduce((t, p) => t + p.b, 0) / n;
          const emp = { va: 0, vb: 0, cab: 0 };
          pts.forEach((p) => { emp.va += (p.a - ma) ** 2 / (n - 1); emp.vb += (p.b - mb) ** 2 / (n - 1); emp.cab += (p.a - ma) * (p.b - mb) / (n - 1); });
          if (emp.va > 1e-9) ellipse({ a: ma, b: mb }, emp, col.ink, 1);
        }
        const f = solve(state.x, state.y), sig = Math.sqrt(dot(f.r, f.r));
        const th = covAB(state, sig);
        if (th) ellipse(obs, th, col.fit, 0.9, '', 1.5);
        note(M.t + 8, 'black: spread of the dots (68% / 95%)', col.ink);
        note(M.t + 20, 'blue: formula σ̂²(XᵀX)⁻¹, σ̂² = RSS/(n − p)', col.fit);
      }
    }
    mark(truth.a, truth.b, col.cand, 'true (a, b)', 14);
    mark(obs.a, obs.b, col.data, 'your fit (â, b̂)', -9);
  };
}

/** HTML for the covariance readout */
export function covHTML(state) {
  const cov = covAB(state);
  if (!cov) return '<span class="warn">x values all equal: the slope is not identifiable.</span>';
  const sa = Math.sqrt(cov.va), sb = Math.sqrt(cov.vb), rho = cov.cab / (sa * sb);
  return `<div class="kv"><span class="k">Cov(â, b̂) = σ² (XᵀX)⁻¹</span><span class="v">[ ${fmt(cov.va, 3)}  ${fmt(cov.cab, 3)} ]<br>[ ${fmt(cov.cab, 3)}  ${fmt(cov.vb, 3)} ]</span></div>` +
    `<div class="kv"><span class="k">standard errors and correlation</span><span class="v">sd(â) = ${fmt(sa)}, sd(b̂) = ${fmt(sb)}, corr = ${fmt(rho)}</span></div>`;
}

/* --------------------------------------------------------- 3-D model view */
export function createModelView(container, state, opts = {}) {
  const col = colors();
  const { cloud = false, fits = cloud, epsilon = false, minimal = false, camera: camPos = [15, 4, 8] } = opts;
  const cloudLabels = minimal;
  const labelHost = document.createElement('div'); labelHost.className = 'labels';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(renderer.domElement); container.appendChild(labelHost);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(...camPos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const R_AX = 6, R_PLANE = 5.5;

  const tube = (color, radius) => {
    const g = new THREE.CylinderGeometry(radius, radius, 1, 12); g.translate(0, 0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
    m.set = (a, b) => { const A = T(a), d = T(b).sub(A), len = d.length(); m.visible = len > 1e-4; if (!m.visible) return; m.position.copy(A); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len)); m.scale.set(1, len, 1); };
    scene.add(m); return m;
  };
  const dashed = (color, dash = 0.22, gap = 0.14) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap }));
    l.set = (a, b) => { g.attributes.position.set([...a, ...b]); g.attributes.position.needsUpdate = true; l.computeLineDistances(); l.visible = norm(sub(a, b)) > 1e-4; };
    scene.add(l); return l;
  };
  const polyline = (color, n) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    l.set = (pts) => { g.attributes.position.set(pts.flat()); g.attributes.position.needsUpdate = true; };
    scene.add(l); return l;
  };
  const ball = (color, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color })); scene.add(m); return m; };
  const arrow = (color, headLen = 0.4, headW = 0.2) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, color, headLen, headW);
    a.set = (from, vec) => { const len = norm(vec); a.visible = len > 1e-4; if (!a.visible) return; a.position.copy(T(from)); a.setDirection(T(vec).normalize()); a.setLength(len, Math.min(headLen, len * 0.5), headW); };
    scene.add(a); return a;
  };
  const labels = [];
  const label = (html, color) => {
    const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = html; el.style.color = color; labelHost.appendChild(el);
    const L = { el, pos: new THREE.Vector3(), show: true };
    L.at = (p, text) => { L.pos.copy(T(p)); if (text !== undefined) el.innerHTML = text; };
    labels.push(L); return L;
  };

  ['y₁', 'y₂', 'y₃'].forEach((name, i) => {
    const d = [0, 0, 0]; d[i] = 1;
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([T(scale(d, -R_AX)), T(scale(d, R_AX))]), new THREE.LineBasicMaterial({ color: col.muted, transparent: true, opacity: 0.55 })));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 12), new THREE.MeshBasicMaterial({ color: col.muted }));
    tip.position.copy(T(scale(d, R_AX))); tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), T(d)); scene.add(tip);
    label(`${name} <span style="opacity:.6;font-weight:400">(obs ${i + 1})</span>`, col.muted).at(scale(d, R_AX + 0.5));
    for (let t = -5; t <= 5; t++) {
      if (t === 0) continue;
      const p = scale(d, t), h = i === 1 ? [0.08, 0, 0] : [0, 0.08, 0];
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([T(add(p, h)), T(sub(p, h))]), new THREE.LineBasicMaterial({ color: col.muted, transparent: true, opacity: 0.5 })));
    }
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: col.ink })));

  const plane = new THREE.Mesh(new THREE.CircleGeometry(R_PLANE, 96), new THREE.MeshBasicMaterial({ color: col.fit, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * 6.2832) * R_PLANE, Math.sin((k / 96) * 6.2832) * R_PLANE, 0))), new THREE.LineBasicMaterial({ color: col.fit, transparent: true, opacity: 0.55 }));
  plane.matrixAutoUpdate = rim.matrixAutoUpdate = false;
  scene.add(plane, rim);
  let lattice = null, lastKey = '';
  function buildLattice(v2) {
    if (lattice) { scene.remove(lattice); lattice.geometry.dispose(); }
    const pts = [], pt = (a, b) => add(scale(ONES, a), scale(v2, b));
    const trace = (fn) => { let prev = null; for (let s = -10; s <= 10.0001; s += 0.1) { const p = fn(s); if (prev && norm(prev) <= R_PLANE && norm(p) <= R_PLANE) pts.push(T(prev), T(p)); prev = p; } };
    for (let a = -6; a <= 6; a++) trace((s) => pt(a, s));
    for (let b = -4; b <= 4; b += 0.5) trace((s) => pt(s, b));
    lattice = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col.fit, transparent: true, opacity: 0.22 }));
    scene.add(lattice);
  }

  const arrOne = arrow(col.basis), arrX = arrow(col.basis);
  const lblOne = label('<b>1</b> = (1,1,1)', col.basis), lblX = label('<b>x</b>', col.basis);
  const legA = tube(col.cand, 0.035), legB = tube(col.cand, 0.035);
  const ballC = ball(col.cand, 0.17), lblC = label('<b>c</b>', col.cand);
  const lblA = label('a·1', col.cand), lblBx = label('b·x', col.cand);
  const ballY = ball(col.data, 0.2), lblY = label('<b>y</b> data', col.data);
  const ballH = ball(col.fit, 0.17), lblH = label('<b>ŷ</b> best fit', col.fit);
  const tubeR = tube(col.resid, 0.06), lblR = label('<b>r</b> residual', col.resid);
  const arrU = arrow(col.u, 0.35, 0.18), lblU = label('<b>u</b> residual space', col.u);
  const ra1 = polyline(col.resid, 3), ra2 = polyline(col.resid, 3), ra3 = polyline(col.cand, 3);
  const dashLine = dashed(col.resid, 0.35, 0.2);
  const dashYtoC = dashed(col.cand), dashCtoH = dashed(col.cand, 0.1, 0.1), lblE = label('ε', col.cand); // ε = y − c and its absorbed part

  /* noise cloud (+ its projections onto the plane = the fits) */
  const mkPoints = (color, size, opacity) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_CLOUD * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
    scene.add(p); return p;
  };
  const cloudPts = mkPoints(col.cand, 0.07, 0.55), fitPts = mkPoints(col.fit, 0.075, 0.8);
  const lblCloud = label('possible datasets y', col.cand), lblFits = label('their fits ŷ', col.fit);

  function render() {
    const { x, y, a, b, center } = state;
    const f = solve(x, y), xb = xbasis(state), c = modelC(state);
    const { yhat, r, e1, e2, u } = f;
    const key = x.join(',') + (center ? 'c' : '');
    if (key !== lastKey) { lastKey = key; buildLattice(xb); if (!f.degenerate) { const m = new THREE.Matrix4().makeBasis(T(e1), T(e2), T(u)); plane.matrix.copy(m); rim.matrix.copy(m); } }
    plane.visible = rim.visible = lattice.visible = !f.degenerate;
    arrOne.set([0, 0, 0], ONES); arrX.set([0, 0, 0], xb);
    lblOne.at(ONES); lblX.at(xb, center ? '<b>x − x̄</b>' : '<b>x</b>');
    const aOne = scale(ONES, a);
    legA.set([0, 0, 0], aOne); legB.set(aOne, c); ballC.position.copy(T(c));
    lblC.at(c, center ? '<b>c</b> = a·1 + b·(x − x̄)' : '<b>c</b> = a·1 + b·x');
    lblA.at(scale(aOne, 0.5)); lblBx.at(add(aOne, scale(xb, b * 0.5)), center ? 'b·(x − x̄)' : 'b·x');
    lblA.el.style.display = norm(aOne) > 0.6 ? '' : 'none';
    lblBx.el.style.display = norm(scale(xb, b)) > 0.6 ? '' : 'none';
    const showRA3 = center && !f.degenerate && norm(aOne) > 0.6 && norm(scale(xb, b)) > 0.6;
    ra3.visible = showRA3;
    if (showRA3) { const s = 0.35, d1 = scale(unit(ONES), -Math.sign(a)), d2 = scale(unit(xb), Math.sign(b)); ra3.set([add(aOne, scale(d1, s)), add(aOne, scale(add(d1, d2), s)), add(aOne, scale(d2, s))]); }
    ballY.position.copy(T(y)); lblY.at(y);
    ballH.position.copy(T(yhat)); lblH.at(yhat);
    tubeR.set(yhat, y); lblR.at(add(yhat, scale(r, 0.5)));
    const hasU = !f.degenerate;
    dashLine.visible = arrU.visible = hasU; lblU.show = hasU && !minimal;
    if (hasU) { dashLine.set(add(yhat, scale(u, -4)), add(yhat, scale(u, 4))); arrU.set([0, 0, 0], scale(u, 2.6)); lblU.at(scale(u, 2.7)); }
    const rl = norm(r), showRA = hasU && rl > 0.15;
    ra1.visible = ra2.visible = showRA;
    if (showRA) { const s = 0.35, rh = scale(r, 1 / rl); ra1.set([add(yhat, scale(e1, s)), add(yhat, scale(add(e1, rh), s)), add(yhat, scale(rh, s))]); ra2.set([add(yhat, scale(e2, s)), add(yhat, scale(add(e2, rh), s)), add(yhat, scale(rh, s))]); }
    lblR.show = rl > 0.15 && !minimal;
    dashYtoC.visible = dashCtoH.visible = lblE.show = epsilon;
    if (epsilon) { dashYtoC.set(c, y); lblE.at(add(c, scale(sub(y, c), 0.5))); lblE.show = norm(sub(y, c)) > 0.4; dashCtoH.set(c, yhat); }
    if (minimal) [lblOne, lblX, lblA, lblBx, lblC].forEach((L) => { L.show = false; });

    const mode = state.cloudCenter;
    const showCl = cloud && state.showCloud !== false && !f.degenerate;
    cloudPts.visible = showCl; fitPts.visible = showCl && fits && mode !== 'pairs';
    lblCloud.show = showCl && cloudLabels; lblFits.show = showCl && fits && cloudLabels && mode !== 'pairs';
    if (showCl) {
      const cc = cloudCenter(state), p1 = cloudPts.geometry.attributes.position, p2 = fitPts.geometry.attributes.position;
      bootstrapSamples(state).forEach((t, i) => {
        const q = t.y, fq = add(scale(e1, dot(q, e1)), scale(e2, dot(q, e2))); // projection onto the plane
        p1.setXYZ(i, q[0], q[1], q[2]); p2.setXYZ(i, fq[0], fq[1], fq[2]);
      });
      p1.needsUpdate = p2.needsUpdate = true;
      lblCloud.at(add(cc, [1.3, 1.6, 0]), mode === 'pairs' ? 'resampled y* (each has its own x*)' : mode === 'resid' ? 'ŷ + resampled residuals' : 'possible datasets y');
      lblFits.at(add(cc, scale(e2, 3.4)));
    }
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(container);
  const tmp = new THREE.Vector3();
  (function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    controls.update(); renderer.render(scene, camera);
    const w = container.clientWidth, h = container.clientHeight;
    for (const L of labels) {
      tmp.copy(L.pos).project(camera);
      const vis = L.show && tmp.z < 1 && L.el.style.display !== 'none';
      L.el.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) L.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w + 8}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translateY(-50%)`;
    }
  })();
  resize();
  return render;
}
