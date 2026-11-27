// Eidos's half of the Mandelbulber .fract importer: Kaleidoscopic IFS (10),
// Menger Sponge (7) and Sierpinski 3D (110), and two-formula hybrids of them,
// mapped exactly onto the fold stacks. Organon (core/engine/mbimport.js)
// parses the file and does the scene: iterations, camera, fractal transform,
// light, background, materials and ground.

import { num, vec, bool, nums, fractalAnglesFor, mbRotation2 } from '../core/engine/mbimport.js';
import { T, ABS_MASKS, STACKS, stackValues } from './kifs.js';

// Mandelbulber formula ids (formula/definition/all_fractal_list_enums.hpp) that
// Eidos ports exactly onto its fold stack.
export const MB_FORMULAS = { 10: 'Kaleidoscopic IFS', 7: 'Menger Sponge', 110: 'Sierpinski 3D' };
// Per-formula default bailout (constructor defaultBailout).
const MB_BAILOUT = { 10: 100, 7: 10, 110: 10 };

// ── formula mapping ──────────────────────────────────────────────────────────
// Each mapper returns one stack's worth: { steps, scale, center, post (row-major
// rotation or null), pre, rotStart } in Mandelbulber's own (Z-up) frame — the
// fold stack works in the fractal's frame, which the object transform below
// places in the scene, so no axis conversion is needed here.
// SetRotation3 (Rz(x)·Ry(y)·Rx(z)): what the Rotate step uses, angles kept as-is.
const isZero = v => v.every(x => x === 0);

// fractal_kaleidoscopic_ifs.cpp: abs flags → planes (each with its own
// rotation first) → main rotation about the offset → edge fold → scale about
// the offset, with Menger-sponge mode shifting z on one side only.
function mapKifs(f, notes) {
  const steps = [];
  const ax = ['x', 'y', 'z'].filter(a => bool(f, `IFS_abs_${a}`, false)).join('').toUpperCase();
  if (ax) steps.push({ t: T.ABS, abs: ABS_MASKS.indexOf(ax) });
  for (let i = 0; i < 9; i++) {
    if (!bool(f, `IFS_enabled_${i}`, false)) continue;
    const rot = vec(f, `IFS_rotations_${i}`, [0, 0, 0]);
    if (!isZero(rot)) steps.push({ t: T.ROT, pv: 0, ra: rot[0], rb: rot[1], rg: rot[2] });
    const n = vec(f, `IFS_direction_${i}`, [1, 0, 0]);
    const k = num(f, `IFS_intensity_${i}`, 1);
    if (k < 0 || k > 1) notes.push(`Plane ${i} intensity ${k} is outside 0…1 (not a fold); clamped.`);
    steps.push({ t: T.PLANE, nx: n[0], ny: n[1], nz: n[2], d: num(f, `IFS_distance_${i}`, 0), k: Math.max(0, Math.min(1, k)) });
  }
  const O = vec(f, 'IFS_offset', [1, 0, 0]);
  const mr = vec(f, 'IFS_rotation', [0, 0, 0]);
  if (bool(f, 'IFS_rotation_enabled', false) && !isZero(mr)) steps.push({ t: T.ROT, pv: 1, ra: mr[0], rb: mr[1], rg: mr[2] });
  const E = vec(f, 'IFS_edge', [0, 0, 0]);
  if (bool(f, 'IFS_edge_enabled', false) && E.some(x => x > 0)) steps.push({ t: T.EDGE, lx: Math.max(0, E[0]), ly: Math.max(0, E[1]), lz: Math.max(0, E[2]) });
  if (bool(f, 'IFS_menger_sponge_mode', false)) steps.push({ t: T.ZTRICK, zm: 1 });
  return { steps, scale: num(f, 'IFS_scale', 2), center: O, post: null, pre: null, rotStart: 0 };
}

// fractal_menger_sponge.cpp: abs, sort, ×scale3, x −= 2, y −= 2, z −= 2 if z > 1.
// With scale s that is "scale about C" with C = 2/(s − 1) and the z-trick in
// shift mode (its threshold ½·C·(s − 1) = 1).
function mapMenger(f, notes) {
  const s = num(f, 'transf_scale_3', 3);
  if (Math.abs(s - 1) < 1e-9) throw new Error('Menger Sponge with scale 1 has no Eidos equivalent');
  if (s < 0) notes.push('Negative Menger scale: Mandelbulber multiplies its DE by a negative number; Eidos uses |s|.');
  const c = 2 / (s - 1);
  return { steps: [{ t: T.ABS, abs: 0 }, { t: T.SWAP, swap: 0 }, { t: T.ZTRICK, zm: 1 }], scale: s, center: [c, c, c], post: null, pre: null, rotStart: 0 };
}

// fractal_sierpinski3d.cpp: tetra fold, optional reversed (sort) fold,
// z = s·z − c, then an optional rotation R. R at the end of iteration i is the
// same as R at the start of iteration i + 1 (|z| does not change), so it
// becomes the pre-rotation with Rotations Start = startR + 1.
function mapSierpinski(f, notes) {
  const steps = [];
  if (bool(f, 'transf_function_enabled', true)) steps.push({ t: T.SIERP });
  if (bool(f, 'transf_function_enabled_false', false)) steps.push({ t: T.SWAP, swap: 0 });
  const s = num(f, 'transf_scaleA_2', 2);
  if (Math.abs(s - 1) < 1e-9) throw new Error('Sierpinski 3D with scale 1 has no Eidos equivalent');
  const c = vec(f, 'transf_offset_111', [1, 1, 1]);
  if (num(f, 'transf_start_iterations_C', 0) !== 0 || num(f, 'transf_stop_iterations_C', 250) < 250)
    notes.push('Offset iteration range is not supported (the offset applies every iteration).');
  let pre = null, rotStart = 0;
  if (bool(f, 'transf_function_enabledR_false', false)) {
    pre = mbRotation2(vec(f, 'transf_rotation', [0, 0, 0]));
    rotStart = num(f, 'transf_start_iterations_R', 0) + 1;
    if (num(f, 'transf_stop_iterations_R', 250) < 250) notes.push('Rotation stop iteration is not supported (it rotates to the end).');
  }
  if (bool(f, 'analyticDE_enabled_false', false)) notes.push('Analytic DE tweaks (scale / offset) dropped: Eidos keeps the exact DE.');
  return { steps, scale: s, center: c.map(x => x / (s - 1)), post: null, pre, rotStart };
}

const MAPPERS = { 10: mapKifs, 7: mapMenger, 110: mapSierpinski };

// Fold-stack values for one mapped formula into stack 'a' or 'b'.
function applyStack(o, which, m, notes) {
  if (m.steps.length > STACKS[which].n) throw new Error(`needs ${m.steps.length} fold steps; Stack ${STACKS[which].name} holds ${STACKS[which].n}`);
  Object.assign(o, stackValues(which, m.steps));
  if (which === 'a') {
    o.scale = m.scale; [o.centerX, o.centerY, o.centerZ] = m.center;
    Object.assign(o, { alpha: 0, beta: 0, gamma: 0 });
  } else {
    o.scaleB = m.scale; [o.centerBX, o.centerBY, o.centerBZ] = m.center;
    Object.assign(o, { alphaB: 0, betaB: 0, gammaB: 0 });
  }
}

// formula.importFract: the formula's parameters → { ok, formula, params } or { ok: false, error }.
export function importFract({ S, m, notes }) {
  const slots = [];
  for (let n = 1; n <= 9; n++) {
    const id = m[`formula_${n}`] !== undefined ? +nums(m[`formula_${n}`])[0] : 0;
    if (id > 0) slots.push({ n, id, iters: Math.max(1, Math.round(num(m, `formula_iterations_${n}`, 1))) });
  }
  const hybrid = bool(m, 'hybrid_fractal_enable', false);
  const used = hybrid ? slots : slots.slice(0, 1);
  if (!used.length) return { ok: false, error: 'No formula in the file' };
  const bad = used.find(x => !MAPPERS[x.id]);
  if (bad) return { ok: false, error: `Formula ${bad.id} is not one Eidos can import (supported: ${Object.entries(MB_FORMULAS).map(([k, v]) => `${v} (${k})`).join(', ')})` };
  if (used.length > 2) return { ok: false, error: `Hybrid of ${used.length} formulas; Eidos has two stacks (A and B)` };
  const o = { ctrMode: 0, hybridMode: 0, preAlpha: 0, preBeta: 0, preGamma: 0, rotStart: 0, spinX: 0, spinY: 0, spinZ: 0, scaleStep: 0, centerStepX: 0, centerStepY: 0, centerStepZ: 0, postRotC: false, shape: 0, shapeR: 0 };
  let pre = null, rotStart = 0;
  try {
    used.forEach((x, i) => {
      const mp = MAPPERS[x.id](S[`fractal_${x.n}`] || {}, notes);
      applyStack(o, i === 0 ? 'a' : 'b', mp, notes);
      if (mp.pre) {
        if (used.length > 1) notes.push('Sierpinski 3D rotation inside a hybrid is applied to both formulas.');
        pre = mp.pre; rotStart = mp.rotStart;
      }
      if (num(m, `formula_start_iteration_${x.n}`, 0) !== 0 || num(m, `formula_stop_iteration_${x.n}`, 250) < 250)
        notes.push(`Formula ${x.n} start / stop iterations are not supported.`);
      if (num(m, `formula_weight_${x.n}`, 1) !== 1) notes.push(`Formula ${x.n} weight is not supported (weight 1 used).`);
    });
  } catch (e) { return { ok: false, error: e.message }; }
  if (pre) { const a = fractalAnglesFor(pre); o.preAlpha = a.alpha; o.preBeta = a.beta; o.preGamma = a.gamma; o.rotStart = rotStart; }
  // Hybrid sequence (hybrid_fractal_sequences.cpp): formula 1 for its
  // iteration count, then formula 2, repeating.
  if (used.length === 2) {
    const [n1, n2] = [used[0].iters, used[1].iters];
    if (n1 + n2 <= 8) {
      o.hybridMode = 3; o.hybLen = n1 + n2;
      for (let k = 1; k <= 8; k++) o[`hybP${k}`] = k > n1 && k <= n1 + n2;
    } else if (n2 === 1) { o.hybridMode = 1; o.hybN = n1 + 1; }
    else return { ok: false, error: `Hybrid sequence ${n1}+${n2} iterations is longer than Eidos's 8-step pattern` };
  }
  // c addition: KIFS formulas are cpixelDisabledByDefault, so dont_add_c_constant
  // turns c ON for them. Eidos has no c.
  if (bool(m, 'dont_add_c_constant_1', false)) notes.push('“Add c” is on in the file; KIFS in Eidos adds no c (dropped).');
  if (bool(m, 'julia_mode', false)) notes.push('Julia mode has no effect without c (dropped).');
  const def = Math.max(...used.map(x => MB_BAILOUT[x.id]));
  o.bailout = bool(m, 'use_default_bailout', true) ? def : num(m, 'bailout', def);

  // Mandelbulber's linear DE is r / DE exactly as here (shape: a point,
  // radius 0), so Step Factor = its DE_factor.
  o.stepFactor = Math.min(4, Math.max(0.01, num(m, 'DE_factor', 1)));
  return { ok: true, formula: used.map(x => MB_FORMULAS[x.id]).join(' + '), params: o };
}
