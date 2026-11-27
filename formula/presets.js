// Eidos's presets: KIFS scenes, symmetry groups and Rebirth's random fold
// stacks.

import { PARAMS, defaults } from './params.js';
import { CUSTOM_GRADIENT, GRADIENTS } from '../core/engine/gradients.js';
import { r, ri, pick } from '../core/engine/presets.js';
import { T, STACKS, sid, stackValues, SYMMETRY_GROUPS, ESTIMATE_TYPES } from './kifs.js';

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
  wythoff: scene('Truncated Octahedral Flake', 'wythoff', [{ t: T.OCTA }],
    { scale: 3, ctrMode: 1, wyGroup: 1, wyA: 1, wyB: 1, wyC: 0, wyR: 1, shape: 0, shapeR: 0.9, iterations: 8, rotX: 0.55, rotY: -0.5, dist: 3.6, palette: 6 }),
  twophase: scene('Two-Phase Flake', 'wythoff', [{ t: T.OCTA, iu: 3 }, { t: T.SIERP, if: 3 }],
    { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 2, shapeR: 1.3, iterations: 12, rotX: 0.55, rotY: -0.5, dist: 4, palette: 3 }),
  snub: scene('Snub Octahedral Flake', 'chiral', [{ t: T.CHIR_O }],
    { scale: 2.6, ctrMode: 1, wyGroup: 1, wyA: 1, wyB: 0.7, wyC: 0.5, wyR: 1, shape: 0, shapeR: 0.9, iterations: 9, rotX: 0.55, rotY: -0.5, dist: 3.6, palette: 6, stepFactor: 0.8 }),
  chiralico: scene('Twisted Icosahedral', 'chiral', [{ t: T.CHIR_I }],
    { scale: 2.3, ctrMode: 1, wyGroup: 2, wyA: 0.6, wyB: 1, wyC: 0.8, wyR: 1, shape: 0, shapeR: 0.8, iterations: 9, rotX: 0.4, rotY: -0.3, dist: 3.3, palette: 2, stepFactor: 0.8 }),
  pinwheel: scene('Pentagonal Pinwheel', 'chiral', [{ t: T.ABS, abs: 6 }, { t: T.CYCLIC, ax: 2, n: 5 }],
    { scale: 2.3, centerX: 1, centerY: 0.35, centerZ: 0.5, shape: 0, shapeR: 0.7, iterations: 10, rotX: 0.4, rotY: -0.55, dist: 4.3, palette: 6, stepFactor: 0.8 }),
  wiresponge: scene('Wireframe Sponge', 'shapes', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 5, shapeR: 1, shapeT: 0.07, iterations: 3, rotX: 0.72, rotY: -0.52, dist: 4.4, palette: 1 }),
  rings: scene('Ring Flake', 'shapes', [{ t: T.ICOSA }],
    { scale: 2.5, centerX: 0, centerY: 0.525731, centerZ: 0.850651, shape: 7, shapeR: 0.6, shapeT: 0.1, iterations: 10, rotX: 0.4, rotY: -0.3, dist: 3.4, palette: 2 }),
  kleinian: scene('Pseudo-Kleinian Caves', 'kleinian', [{ t: T.KLEIN, lx: 0.92, ly: 0.9, lz: 0.92, kr: 1 }],
    { scale: 1, centerX: 0, centerY: 0, centerZ: 0, shape: 9, shapeT: 0.05, iterations: 10, bailout: 1000, rotX: 0.5, rotY: -0.1, dist: 0.5, palette: 21, colorSource: 1, foldColW: 0.08, stepFactor: 0.8 }),
  hybrid: scene('Menger ⇄ Sierpinski', 'hybrid', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, hybridMode: 1, hybN: 2, scaleB: 2, centerBX: 1, centerBY: 1, centerBZ: 1, shape: 1, shapeR: 1, iterations: 8, rotX: 0.62, rotY: -0.42, dist: 4.2, palette: 11, colorSource: 1 },
    [{ t: T.SIERP }]),
  pattern: scene('Pattern Hybrid (AAB)', 'hybrid', [{ t: T.ICOSA }],
    { scale: 2, centerX: 0, centerY: 0.525731, centerZ: 0.850651, hybridMode: 3, hybLen: 3, scaleB: 2, centerBX: 1, centerBY: 0, centerBZ: 0, shape: 0, shapeR: 1, iterations: 9, rotX: 0.4, rotY: -0.3, dist: 3.4, palette: 12, colorSource: 3 },
    [{ t: T.OCTA }]),
};
export const PRESET_GROUPS = [
  ['Classic KIFS', 'classic'], ['Rotated KIFS', 'rot'], ['Symmetry groups', 'sym'], ['Per-iteration variation', 'vary'], ['Sphere inversion', 'inv'], ['Wythoff centres & iteration ranges', 'wythoff'], ['Chiral (rotation-only) folds', 'chiral'], ['Seed shapes', 'shapes'], ['Kleinian', 'kleinian'], ['Hybrids', 'hybrid'],
];

// ── Symmetry groups (Stack A only; the rest of the scene is kept) ──────────
export { SYMMETRY_GROUPS };
export function symmetryValues(i) {
  const g = SYMMETRY_GROUPS[i];
  return g ? { ...stackValues('a', g.steps), ctrMode: 0, ...g.set } : {};
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

// Rebirth: one random candidate (Organon scores it for visibility).
export function rebirthCandidate() {
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
    // Chiral / cyclic steps make the DE an estimate: march a little shorter.
    stepFactor: steps.some(x => ESTIMATE_TYPES.includes(x.t)) ? 0.8 : 1,
    colorShift: Math.random(),
    colorSource: pick([0, 0, 1, 2, 3]),
    palette: (i => (i >= CUSTOM_GRADIENT ? i + 1 : i))(ri(GRADIENTS.length - 1)), // any built-in (not Custom)
    rotX: r(-Math.PI, Math.PI), rotY: r(-0.7, 0.3),
    rollX: 0, rollY: 0, rollZ: 0,
    targetX: 0, targetY: 0, targetZ: 0,
    dist: r(2.8, 6),
  };
  return gv;
}
export const REBIRTH_TARGET = { hit: 0.55, lo: 0.25, hi: 0.9 };
