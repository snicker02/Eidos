// Eidos's presets: KIFS scenes, symmetry groups and Rebirth's random fold
// stacks.

import { PARAMS, defaults } from './params.js';
import { CUSTOM_GRADIENT, GRADIENTS } from '../core/engine/gradients.js';
import { r, ri, pick } from '../core/engine/presets.js';
import { T, STACKS, sid, stackValues, SYMMETRY_GROUPS, ESTIMATE_TYPES, SMOOTH_TYPES } from './kifs.js';

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

// Fragmentarium's rotationMatrix3(axis, angle) used as `z *= rot` is the
// rotation by +angle about axis (as `rot * z`, by −angle). As Rotate-step
// angles: Rz(α)·Ry(β)·Rx(γ), degrees.
export function rotateStepAngles(axis, deg) {
  const l = Math.hypot(...axis), [x, y, z] = axis.map(a => a / l), t = deg * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  const R = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  const D = 180 / Math.PI;
  return { ra: Math.atan2(R[3], R[0]) * D, rb: -Math.asin(Math.max(-1, Math.min(1, R[6]))) * D, rg: Math.atan2(R[7], R[8]) * D };
}
const PHI = (1 + Math.sqrt(5)) / 2;
const SQ2 = Math.SQRT2;
// Knighty's Koch01 default preset: Scale, Offset (RotAngle 0, YOff 1/3).
const KOCH = { s: 2.37624, O: [2, 0.54944, -0.06592] };
// FragM ports (see the README for the original files and authors).
// Kali's Treebroccoli preset: Scale 1.44915, Fold, Julia, RotVector / RotAngle.
const BROC = { s: 1.44915, F: [0.13008, 0.04564315], J: [-0.03034482, -0.80827584, -0.15862068], rot: rotateStepAngles([0.2174, 1, 0.02174], 93.2544) };
// Syntopia's Dodecahedron mirrors (Phi exact).
const DODN = [[-1, PHI - 1, 1 / (PHI - 1)], [PHI - 1, 1 / (PHI - 1), -1], [1 / (PHI - 1), -1, PHI - 1]];
// Tryptophan's MultiIFS default (Mode 0: Menger fold, then the pyramid and abs
// folds about −Julia − Fold), as fold planes with offsets.
const MIFS = { J: [0.0495, -0.14852, 0.28712], Fz: -0.45098, O: [-0.21976 + 1, 0.92304, 0.04392] };
const mifsSteps = () => {
  const [jx, jy, jz] = MIFS.J;
  return [{ t: T.OCTA },
    { t: T.PLANE, nx: 1, ny: 1, nz: 0, d: -(jx + jy) / SQ2 },
    { t: T.PLANE, nx: 1, ny: -1, nz: 0, d: -(jx - jy) / SQ2 },
    { t: T.PLANE, nx: 1, ny: 0, nz: -1, d: -(jx - jz) / SQ2 },
    { t: T.PLANE, nx: 1, ny: 0, nz: 0, d: -jx },
    { t: T.PLANE, nx: 0, ny: 1, nz: 0, d: -jy },
    { t: T.PLANE, nx: 0, ny: 0, nz: 1, d: -MIFS.Fz - jz }];
};
const ICO5 = [0, 0.525731, 0.850651]; // icosahedral 5-fold vertex direction

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

  // ── FragM classics (Fragmentarium examples, ported) ──
  koch: scene("Koch Surface (Knighty's Koch01)", 'fragm',
    [{ t: T.ABS, abs: 1 }, { t: T.SWAP, swap: 1 }, { t: T.EDGE, lx: 0, ly: 0.333333, lz: 0 },
      { t: T.PLANE, nx: 1, ny: 0, nz: -1, d: -1 / (3 * SQ2) }, { t: T.PLANE, nx: 1, ny: 0, nz: -1, d: 1 / (3 * SQ2) }],
    { scale: KOCH.s, centerX: KOCH.O[0], centerY: KOCH.O[1], centerZ: KOCH.O[2], shape: 4, shapeR: Math.hypot(...KOCH.O), shapeT: 0, iterations: 12, bailout: 100,
      rotX: 0, rotY: -1.35, dist: 4, targetX: 0.3, palette: 2, colorSource: 1, foldColW: 0.15 }),
  broccoli: scene("Treebroccoli (Kali)", 'fragm',
    [{ t: T.ROT, ...BROC.rot }, { t: T.PLANE, nx: 1, ny: 0, nz: 0, d: -BROC.F[0] }, { t: T.PLANE, nx: 0, ny: 1, nz: 0, d: -BROC.F[1] }],
    { scale: BROC.s, centerX: -BROC.J[0] / (BROC.s - 1), centerY: -BROC.J[1] / (BROC.s - 1), centerZ: -BROC.J[2] / (BROC.s - 1), shape: 0, shapeR: 0, iterations: 20, bailout: 1000,
      rotX: 1.1, rotY: -0.25, dist: 5, targetY: 1.2, palette: 6, colorIters: 14 }),
  synocta: scene("Octahedron (Syntopia)", 'fragm',
    [{ t: T.PLANE, nx: 1, ny: 1, nz: 0, d: 0 }, { t: T.PLANE, nx: 1, ny: 0, nz: 1, d: 0 }, { t: T.SWAP, swap: 1 }, { t: T.SWAP, swap: 2 }],
    { scale: 2, centerX: 1, centerY: 0, centerZ: 0, shape: 0, shapeR: 0, iterations: 13, rotX: 0.6, rotY: -0.45, dist: 3.6, palette: 5 }),
  syndodeca: scene("Dodecahedron (Syntopia)", 'fragm',
    [0, 1, 2].flatMap(() => DODN.map(([nx, ny, nz]) => ({ t: T.PLANE, nx, ny, nz, d: 0 }))),
    { scale: 2.617924, centerX: 1, centerY: 1, centerZ: 1, shape: 0, shapeR: 0, iterations: 13, bailout: 1000, rotX: 0.4, rotY: -0.35, dist: 5.6, palette: 20 }),
  multiifs: scene("MultiIFS (Tryptophan)", 'fragm', mifsSteps(),
    { scale: 2, centerX: MIFS.O[0], centerY: MIFS.O[1], centerZ: MIFS.O[2], shape: 1, shapeR: 1, iterations: 6, rotX: 0.75, rotY: -0.5, dist: 4.6, palette: 8, colorSource: 1, foldColW: 0.12 }),

  // ── Smooth folds (Benesi) ──
  smoothmenger: scene("Smooth Menger (after Benesi)", 'smooth', [{ t: T.OCTA, sm: true, sk: 0.08 }, { t: T.ZTRICK, sm: true, sk: 0.08 }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, iterations: 6, rotX: 0.72, rotY: -0.52, dist: 4.7, palette: 1, colorSource: 1, foldColW: 0.2 }),
  softcoral: scene("Soft Kaleido Coral", 'smooth', [{ t: T.ABS, sm: true, sk: 0.04 }, { t: T.PLANE, nx: 1, ny: -1, nz: 0.35, d: 0.1, sm: true, sk: 0.04 }, { t: T.SWAP, sm: true, sk: 0.04 }, { t: T.ROT, pv: 1, ra: 12, rb: 7, rg: -9 }],
    { scale: 2.1, centerX: 1, centerY: 0.8, centerZ: 0.6, shape: 0, shapeR: 0.6, iterations: 12, rotX: 0.5, rotY: -0.4, dist: 4.6, palette: 6, colorSource: 3 }),

  // ── Periodic mirror fold ──
  sierplattice: scene("Sierpinski Lattice", 'periodic', [{ t: T.PERIOD, lx: 1.3, ly: 1.3, lz: 1.3, iu: 1 }, { t: T.SIERP }],
    { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 3, shapeR: 1, iterations: 11, rotX: 0.62, rotY: -0.3, dist: 3, targetX: 2.6, targetY: 2.6, targetZ: 2.6, palette: 3, fog: 0.15, colorShift: 0.1 }),
  mengerworld: scene("Menger Lattice (NewMenger)", 'periodic', [{ t: T.PERIOD, lx: 1, ly: 1, lz: 1 }],
    { scale: 3, centerX: 0, centerY: 0, centerZ: 0, shape: 1, shapeR: 10, lvMode: 3, lvShape: 10, lvR: 1 / 3, lvCol: 0.15, iterations: 5, bailout: 1000,
      rotX: 0.15, rotY: -0.1, dist: 1.6, targetX: 0, targetY: 0, targetZ: 0, palette: 1, fog: 0.05, volumetric: 0 }),
  spheresponge: scene("Sphere Sponge", 'periodic', [{ t: T.PERIOD, lx: 1, ly: 1, lz: 1 }],
    { scale: 3, centerX: 0, centerY: 0, centerZ: 0, shape: 1, shapeR: 10, lvMode: 3, lvShape: 0, lvR: 1.035, lvCol: 0.2, iterations: 5, bailout: 1000,
      rotX: -1.5708, rotY: -0.05, dist: 1.6, targetX: 1, targetY: 0, targetZ: 0, palette: 20, fog: 0.1, volumetric: 0 }),

  // ── N-flakes (Syntopia) ──
  sierpocta: scene("Sierpinski Octahedron (n-flake)", 'nflake', [{ t: T.NFLAKE, fp: 1, fr: 1 }],
    { scale: 2, centerX: 0, centerY: 0, centerZ: 0, shape: 2, shapeR: 1, iterations: 8, rotX: 0.55, rotY: -0.4, dist: 3.4, palette: 6, colorSource: 1, foldColW: 0.15, stepFactor: 0.8 }),
  icosaflake: scene("Icosahedron Flake", 'nflake', [{ t: T.NFLAKE, fp: 3, fr: 1 }],
    { scale: 1 + PHI, centerX: 0, centerY: 0, centerZ: 0, shape: 13, shapeR: 1, polyA: 1, polyB: 0, polyC: 0, iterations: 6, rotX: 0.4, rotY: -0.3, dist: 3.2, palette: 2, stepFactor: 0.8 }),
  dodecaflake: scene("Dodecahedron Flake", 'nflake', [{ t: T.NFLAKE, fp: 4, fr: 1 }],
    { scale: 2 + PHI, centerX: 0, centerY: 0, centerZ: 0, shape: 13, shapeR: 1, polyA: 0, polyB: 0, polyC: 1, iterations: 5, rotX: 0.4, rotY: -0.3, dist: 3.1, palette: 16, stepFactor: 0.8 }),

  // ── Fold-and-cut polyhedra (Knighty) ──
  // Vertex on the mirror through corners A and B (C = 0), B/A = 2φ/√(1 + φ²) for equal edges.
  football: scene("Truncated Icosahedron (fold & cut)", 'poly', [],
    { scale: 1, centerX: 0, centerY: 0, centerZ: 0, shape: 13, shapeR: 1, polyA: Math.sqrt(1 + PHI * PHI) / (2 * PHI), polyB: 1, polyC: 0, polyF2: false, polyE: true, polyER: 0.025, polyV: true, polyVR: 0.05, iterations: 1,
      rotX: 0.5, rotY: -0.35, dist: 3.4, palette: 12, colorSource: 1, foldColW: 0.3 }),
  ballstick: scene("Ball-and-Stick Flake", 'poly', [{ t: T.OCTA }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 0, shape: 12, shapeR: 1, polyA: 0, polyB: 1, polyC: 0, polyF1: false, polyF2: false, polyF3: false, polyE: true, polyER: 0.06, polyV: true, polyVR: 0.14,
      iterations: 3, rotX: 0.55, rotY: -0.5, dist: 4.2, palette: 6, colorSource: 1, foldColW: 0.3 }),
  polyornament: scene("Polyhedral Ornament", 'poly', [{ t: T.ICOSA }],
    { scale: 2.4, centerX: ICO5[0], centerY: ICO5[1], centerZ: ICO5[2], shape: 0, shapeR: 0.3, lvMode: 1, lvShape: 13, lvR: 0.75, lvCol: 0.25,
      polyA: 1, polyB: 1, polyC: 1, polyF1: false, polyF2: false, polyF3: false, polyE: true, polyER: 0.02, polyV: true, polyVR: 0.04,
      iterations: 5, rotX: 0.4, rotY: -0.3, dist: 3.2, palette: 2 }),

  // ── Shapes at every level ──
  ringornament: scene("Armillary Ornament", 'levels', [{ t: T.ICOSA }],
    { scale: 2.4, centerX: ICO5[0], centerY: ICO5[1], centerZ: ICO5[2], shape: 0, shapeR: 0, lvMode: 1, lvShape: 7, lvR: 0.9, lvT: 0.03, lvAx: 0, lvCol: 0.35,
      iterations: 4, rotX: 0.4, rotY: -0.3, dist: 3.3, palette: 2 }),
  octrings: scene("Octahedral Rings (after Syntopia's OctahedronOT)", 'levels',
    [{ t: T.PLANE, nx: 1, ny: 1, nz: 0, d: 0 }, { t: T.PLANE, nx: 1, ny: 0, nz: 1, d: 0 }, { t: T.SWAP, swap: 1 }, { t: T.SWAP, swap: 2 }],
    { scale: 2, centerX: 1, centerY: 0, centerZ: 0, shape: 0, shapeR: 0.15, lvMode: 1, lvShape: 7, lvR: 0.5, lvT: 0.035, lvAx: 1, lvOX: 0.55, lvOY: 0, lvOZ: 0, lvCol: 0.25,
      iterations: 9, rotX: 0.6, rotY: -0.45, dist: 3.6, palette: 5 }),
  bubbles: scene("Bubble-Carved Menger", 'levels', [{ t: T.OCTA }, { t: T.ZTRICK }],
    { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1, lvMode: 3, lvShape: 0, lvR: 0.4, lvOX: 1, lvOY: 1, lvOZ: 1, lvCol: 0.3,
      iterations: 6, rotX: 0.72, rotY: -0.52, dist: 4.7, palette: 1, colorSource: 1, foldColW: 0.2 }),
  blended: scene("Smooth-Union Flake", 'levels', [{ t: T.OCTA }],
    { scale: 2.6, centerX: 1, centerY: 0.35, centerZ: 0.1, shape: 0, shapeR: 0.5, lvMode: 2, lvShape: 0, lvR: 0.35, lvOX: 0.6, lvOY: 0.2, lvOZ: 0, lvK: 0.15, lvCol: 0.15,
      iterations: 8, rotX: 0.55, rotY: -0.5, dist: 3.8, palette: 9 }),
};
// Camera inside an infinite lattice, by design (tests check for a cavity).
for (const k of ['sierplattice', 'mengerworld', 'spheresponge']) BIOMES[k].inside = true;

export const PRESET_GROUPS = [
  ['Classic KIFS', 'classic'], ['Rotated KIFS', 'rot'], ['Symmetry groups', 'sym'], ['Per-iteration variation', 'vary'], ['Sphere inversion', 'inv'], ['Wythoff centres & iteration ranges', 'wythoff'], ['Chiral (rotation-only) folds', 'chiral'], ['Seed shapes', 'shapes'], ['Kleinian', 'kleinian'], ['Hybrids', 'hybrid'],
  ['FragM classics', 'fragm'], ['Smooth folds', 'smooth'], ['Periodic fold', 'periodic'], ['N-flakes', 'nflake'], ['Fold & cut polyhedra', 'poly'], ['Shapes at every level', 'levels'],
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
  // Now and then, round the creases (a little: large softness thins the fractal).
  if (Math.random() < 0.15) for (const st of steps) if (SMOOTH_TYPES.includes(st.t)) { st.sm = true; st.sk = r(0.01, 0.05); }
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
    // Now and then, rings or balls at every level.
    ...(Math.random() < 0.12 ? { lvMode: 1, lvShape: pick([0, 7, 7]), lvR: r(0.15, 0.6), lvT: r(0.02, 0.05), lvAx: ri(3), lvOX: r(0, 1), lvOY: r(0, 1), lvOZ: r(0, 1), lvCol: r(0.1, 0.5) } : {}),
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
