// Presets, symmetry groups, Evolve / Rebirth, and the discovery-string codec.

import { PARAMS, PARAM_BY_ID, defaults, coerce } from './params.js';
import { viewScore } from './de.js';
import { CUSTOM_GRADIENT, GRADIENTS } from './gradients.js';
import { T, STACKS, sid, stackValues, SYMMETRY_GROUPS } from './kifs.js';

const r = (a, b) => a + Math.random() * (b - a);
const ri = n => Math.floor(Math.random() * n);
const pick = a => a[ri(a.length)];
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// Is a control live for the current values? Its own gate open, and its gate's
// control live too (visibility cascades exactly as in the panel).
export function isActive(p, values) {
  if (!p.gate) return true;
  const g = values[p.gate];
  const open = p.gateEq === undefined ? !!g : Array.isArray(p.gateEq) ? p.gateEq.includes(g) : g === p.gateEq;
  return open && isActive(PARAM_BY_ID.get(p.gate), values);
}

// Every formula and colour parameter at its default: presets start from this so
// nothing from the previous scene (a longer stack, a hybrid) leaks in.
const FORMULA_GROUPS = new Set(['stack', 'xform', 'vary', 'hybrid', 'shape', 'iter']);
const formulaDefaults = () => {
  const d = defaults();
  const o = {};
  for (const p of PARAMS) if (FORMULA_GROUPS.has(p.group)) o[p.id] = d[p.id];
  return o;
};
const LOOK = { colorSource: 0, colorIters: 6, foldColW: 0.25, palette: 0, colorShift: 0, volumetric: 0.3, fog: 0.05, aoStrength: 0.6, brightness: 1.3, ambient: 0.25, stepAO: 1, shadows: true, tonemap: 1, targetX: 0, targetY: 0, targetZ: 0, rollX: 0, rollY: 0, rollZ: 0, lens: 1 };
const scene = (label, group, stepsA, o = {}, stepsB = null) => ({
  label, group,
  v: { ...formulaDefaults(), ...LOOK, ...stackValues('a', stepsA), ...(stepsB ? stackValues('b', stepsB) : {}), ...o },
});

// ── Presets ─────────────────────────────────────────────────────────────────
export const BIOMES = {
  sierpinski: scene('Sierpinski Tetrahedron', 'classic', [{ t: T.SIERP }],
    { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 3, shapeR: 1, iterations: 12, rotX: 0.62, rotY: -0.42, dist: 4.3, palette: 3, colorShift: 0.1 }),
  menger: scene('Menger Sponge', 'classic', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 6, rotX: 0.72, rotY: -0.52, dist: 4.7, palette: 1, colorSource: 1, foldColW: 0.2 }),
  octa: scene('Octahedral Flake', 'classic', [{ t: T.OCTA }],
    { scale: 2, centerX: 1, centerY: 0, centerZ: 0, shape: 2, shapeR: 1, iterations: 12, rotX: 0.55, rotY: -0.5, dist: 4.2, palette: 6 }),
  icosa: scene('Icosahedral Flake', 'classic', [{ t: T.ICOSA }],
    { scale: 2, centerX: 0, centerY: 0.525731, centerZ: 0.850651, shape: 0, shapeR: 1, iterations: 10, rotX: 0.4, rotY: -0.3, dist: 3.4, palette: 2 }),
  dodeca: scene('Dodecahedral Cage', 'classic', [{ t: T.ICOSA }],
    { scale: 2.2, centerX: 0.356822, centerY: 0, centerZ: 0.934172, shape: 0, shapeR: 1, iterations: 10, rotX: 0.3, rotY: -0.45, dist: 3.4, palette: 20, colorSource: 1, foldColW: 0.12 }),
  star: scene('Icosahedral Dust', 'classic', [{ t: T.ICOSA }],
    { scale: 2.618034, centerX: 0, centerY: 0.525731, centerZ: 0.850651, shape: 0, shapeR: 1, iterations: 12, rotX: 0.4, rotY: -0.3, dist: 3.2, palette: 16, volumetric: 1 }),
  cathedral: scene("Knighty's Cathedral", 'rot', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 7, alpha: 0.18, beta: 0.08, gamma: 0.0, rotX: 0.5, rotY: -0.35, dist: 4.4, palette: 20, colorSource: 1, foldColW: 0.12 }),
  twist: scene('Twisted Sierpinski', 'rot', [{ t: T.SIERP }],
    { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 3, shapeR: 1, iterations: 14, preAlpha: 0.3, preBeta: 0.2, rotX: 0.9, rotY: -0.3, dist: 4.2, palette: 5 }),
  coral: scene('Kaleido Coral', 'rot', [{ t: T.ABS }, { t: T.PLANE, nx: 1, ny: -1, nz: 0.35, d: 0.1 }, { t: T.SWAP }, { t: T.ROT, pv: 1, ra: 12, rb: 7, rg: -9 }],
    { scale: 2.1, centerX: 1, centerY: 0.8, centerZ: 0.6, shape: 0, shapeR: 0.6, iterations: 12, rotX: 0.5, rotY: -0.4, dist: 4.6, palette: 6, colorSource: 3 }),
  hex: scene('Hexagonal Drum', 'sym', [{ t: T.ABS, abs: 6 }, { t: T.DIHEDRAL, ax: 2, n: 6 }],
    { scale: 2.4, centerX: 1, centerY: 0.3, centerZ: 0.6, shape: 0, shapeR: 0.7, iterations: 10, rotX: 0.4, rotY: -0.55, dist: 4.4, palette: 6 }),
  lattice: scene('Edge-Folded Dust', 'sym', [{ t: T.ABS }, { t: T.EDGE, lx: 0.75, ly: 0.75, lz: 0.75 }, { t: T.SWAP }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 6, rotX: 0.75, rotY: -0.5, dist: 5.2, palette: 8 }),
  spun: scene('Spun Sponge', 'vary', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 6, spinX: 0.05, spinZ: 0.09, rotX: 0.6, rotY: -0.45, dist: 3.8, palette: 9 }),
  drift: scene('Drifting Flake', 'vary', [{ t: T.OCTA }],
    { scale: 2, scaleStep: -0.03, centerX: 1, centerY: 0.2, centerZ: 0, centerStepY: 0.04, shape: 2, shapeR: 1, iterations: 12, rotX: 0.4, rotY: -0.4, dist: 4.3, palette: 10 }),
  invsponge: scene('Inverted Sponge', 'inv', [{ t: T.INV, icx: 0.6, icy: 0.4, icz: 1.6, ir: 1.4, il: 0, iu: 1 }, { t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 6, rotX: 0.72, rotY: -0.52, dist: 4, palette: 1, colorSource: 1, foldColW: 0.2, stepFactor: 0.9 }),
  feather: scene('Feathered Sierpinski', 'inv', [{ t: T.INV, ir: 1.2, ia: 0.35, il: 10 }, { t: T.SIERP }],
    { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 3, shapeR: 1, iterations: 12, rotX: 0.62, rotY: -0.42, dist: 4.3, palette: 3, colorShift: 0.1, stepFactor: 0.8 }),
  hybrid: scene('Menger ⇄ Sierpinski', 'hybrid', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, hybridMode: 1, hybN: 2, scaleB: 2, centerBX: 1, centerBY: 1, centerBZ: 1, shape: 1, shapeR: 1, iterations: 8, rotX: 0.62, rotY: -0.42, dist: 4.2, palette: 11, colorSource: 1 },
    [{ t: T.SIERP }]),
  pattern: scene('Pattern Hybrid (AAB)', 'hybrid', [{ t: T.ICOSA }],
    { scale: 2, centerX: 0, centerY: 0.525731, centerZ: 0.850651, hybridMode: 3, hybLen: 3, scaleB: 2, centerBX: 1, centerBY: 0, centerBZ: 0, shape: 0, shapeR: 1, iterations: 9, rotX: 0.4, rotY: -0.3, dist: 3.4, palette: 12, colorSource: 3 },
    [{ t: T.OCTA }]),
};
export const PRESET_GROUPS = [
  ['Classic KIFS', 'classic'], ['Rotated KIFS', 'rot'], ['Symmetry groups', 'sym'], ['Per-iteration variation', 'vary'], ['Sphere inversion', 'inv'], ['Hybrids', 'hybrid'],
];

// ── Symmetry groups (Stack A only; the rest of the scene is kept) ──────────
export { SYMMETRY_GROUPS };
export function symmetryValues(i) {
  const g = SYMMETRY_GROUPS[i];
  return g ? { ...stackValues('a', g.steps), ...g.set } : {};
}

// Small mutation of 3–5 live geometric params (~6% of each slider span).
export function evolve(values, strength = 0.06, { exclude = [] } = {}) {
  // Only parameters that currently do something, and always at least one real
  // change (picking hidden params or rounding back to the same value does nothing).
  const pool = PARAMS.filter(p => p.mutate && isActive(p, values) && !exclude.includes(p.id));
  const out = {};
  const count = 3 + ri(3);
  for (let tries = 0; Object.keys(out).length < count && tries < 40; tries++) {
    const p = pool[ri(pool.length)];
    if (!p || p.id in out) continue;
    const span = p.max - p.min;
    let nv = values[p.id] + gauss() * span * strength;
    nv = coerce(p, Math.max(p.min, Math.min(p.max, nv)));
    if (nv !== values[p.id]) out[p.id] = nv;
  }
  return out;
}

// A random fold stack: a symmetry group's mirrors, sometimes with an extra
// custom plane, rotation or edge fold, and random rotations around it.
function randomStack() {
  const gi = ri(SYMMETRY_GROUPS.length), g = SYMMETRY_GROUPS[gi];
  const steps = g.steps.map(x => ({ ...x }));
  if (Math.random() < 0.35) steps.push({ t: T.PLANE, nx: r(-1, 1), ny: r(-1, 1), nz: r(-1, 1), d: r(-0.3, 0.3), k: 1 });
  if (Math.random() < 0.3) steps.push({ t: T.ROT, pv: ri(2), ra: r(-25, 25), rb: r(-25, 25), rg: r(-25, 25) });
  if (Math.random() < 0.2) steps.push({ t: T.EDGE, lx: r(0.4, 1.2), ly: r(0.4, 1.2), lz: r(0.4, 1.2) });
  return { g, steps };
}

// Fresh random geometry, validated on the CPU so you don't land inside the
// fractal or stare at empty space. Returns { values, score, tries }.
export function rebirth(current, tries = 24) {
  let best = null;
  for (let t = 0; t < tries; t++) {
    const { g, steps } = randomStack();
    const jit = x => x * r(0.75, 1.25) + r(-0.15, 0.15);
    const gv = {
      ...formulaDefaults(),
      ...stackValues('a', steps),
      scale: g.set.scale * r(0.85, 1.15),
      centerX: jit(g.set.centerX), centerY: jit(g.set.centerY), centerZ: jit(g.set.centerZ),
      shape: g.set.shape, shapeR: g.set.shapeR * r(0.8, 1.2),
      alpha: Math.random() < 0.5 ? 0 : r(-0.5, 0.5),
      beta: Math.random() < 0.5 ? 0 : r(-0.5, 0.5),
      gamma: Math.random() < 0.5 ? 0 : r(-0.5, 0.5),
      preAlpha: Math.random() < 0.7 ? 0 : r(-0.4, 0.4),
      preBeta: Math.random() < 0.7 ? 0 : r(-0.4, 0.4),
      preGamma: Math.random() < 0.7 ? 0 : r(-0.4, 0.4),
      spinX: Math.random() < 0.85 ? 0 : r(-0.08, 0.08),
      spinY: Math.random() < 0.85 ? 0 : r(-0.08, 0.08),
      spinZ: Math.random() < 0.85 ? 0 : r(-0.08, 0.08),
      iterations: 8 + ri(6),
      colorShift: Math.random(),
      colorSource: pick([0, 0, 1, 2, 3]),
      palette: (i => (i >= CUSTOM_GRADIENT ? i + 1 : i))(ri(GRADIENTS.length - 1)), // any built-in (not Custom)
      rotX: r(-Math.PI, Math.PI), rotY: r(-0.7, 0.3),
      rollX: 0, rollY: 0, rollZ: 0,
      targetX: 0, targetY: 0, targetZ: 0,
      dist: r(2.8, 6),
    };
    const cand = { ...current, ...gv };
    const s = viewScore(cand, 5);
    // Want: camera outside the surface, a healthy mix of hit and sky, not a wall in the face.
    const fitness = (s.clearance > 0.02 ? 1 : 0) * (1 - Math.abs(s.hitFrac - 0.55)) * (1 - s.nearFrac);
    if (!best || fitness > best.fitness) best = { values: gv, fitness, score: s, tries: t + 1 };
    if (s.clearance > 0.02 && s.hitFrac >= 0.25 && s.hitFrac <= 0.9 && s.nearFrac < 0.2) break;
  }
  return best;
}

// ── Discovery string ───────────────────────────────────────────────────────
// EIDOS1:<base64url(JSON of non-default values)>

export const PREFIX = 'EIDOS1:';

const b64urlEncode = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const round = x => (typeof x === 'number' ? Number(x.toPrecision(7)) : x);

export function encodeDiscovery(values) {
  const d = defaults();
  const o = {};
  for (const p of PARAMS) {
    const v = values[p.id];
    if (v !== d[p.id]) o[p.id] = round(v);
  }
  return PREFIX + b64urlEncode(JSON.stringify(o));
}

// Hook for renamed parameters in later versions (none yet). Unknown keys pass through.
export function migrateLegacy(obj) { return obj; }

// Returns a full, validated value set (defaults filled in) or throws.
export function decodeDiscovery(str) {
  str = String(str).trim();
  let obj;
  if (str.startsWith(PREFIX)) obj = JSON.parse(b64urlDecode(str.slice(PREFIX.length)));
  else if (str.startsWith('{')) {
    const j = JSON.parse(str);
    obj = j.params ?? j; // also accept a project file pasted in
  } else throw new Error('Not a discovery string');
  if (!obj || typeof obj !== 'object') throw new Error('Malformed discovery string');
  obj = migrateLegacy(obj);
  const out = defaults();
  for (const id in obj) {
    const p = PARAM_BY_ID.get(id);
    if (!p) continue;
    const v = coerce(p, obj[id]);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

export const PROJECT_VERSION = 2;

export function makeProject(values, keys) {
  return { app: 'eidos', version: PROJECT_VERSION, params: { ...values }, keyframes: keys };
}

export function parseProject(text) {
  const j = JSON.parse(text);
  if (!j || typeof j !== 'object') throw new Error('Not a project file');
  const params = decodeDiscovery(JSON.stringify(j.params ?? {}));
  return { params, keyframes: Array.isArray(j.keyframes) ? j.keyframes.map(migrateLegacy) : [] };
}
