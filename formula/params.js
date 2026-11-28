// Eidos's formula parameters (the LEFT dock: the KIFS fold stacks, rotation &
// scale, per-iteration variation, hybrid schedule, DE shape, iteration). The
// right dock (scene & output) is Organon's; see core/engine/params.js for the
// field reference. defineParams() runs once, when this module loads.

import { defineParams, marchParams, PI } from '../core/engine/params.js';
import { STEP_NAMES, ABS_MASKS, SWAP_MODES, ROT_PIVOTS, AXES, ZTRICK_MODES, STACKS, SHAPES, HYBRID_MODES, WYTHOFF, CENTER_MODES, SMOOTH_TYPES, FLAKE_POLYS, LEVEL_MODES, sid } from './kifs.js';
export * from '../core/engine/params.js';

export const GROUPS_LEFT = [
  { id: 'presets', side: 'left',  title: 'Presets', accent: true, open: true },
  { id: 'stack',   side: 'left',  title: 'Fold Stack A', accent: true, open: true },
  { id: 'xform',   side: 'left',  title: 'Rotation & Scale', open: true },
  { id: 'vary',    side: 'left',  title: 'Per-Iteration Variation' },
  { id: 'hybrid',  side: 'left',  title: 'Hybrid · Stack B', accent: true },
  { id: 'shape',   side: 'left',  title: 'DE Shape' },
  { id: 'iter',    side: 'left',  title: 'Iteration' },
];

export const COLOR_SOURCES = ['Orbit trap', 'Fold count (stripes)', 'Trap + folds', 'Per-step orbit traps'];
export { STEP_NAMES, SHAPES, HYBRID_MODES };

const ON_TYPES = STEP_NAMES.map((_, i) => i).slice(1); // every type but Off

// One fold-stack slot: its type plus every type's own controls, each gated on
// the type so only the chosen step's controls show. Slot k + 1 appears once
// slot k is on, so an empty stack shows one "Step 1" selector.
function slotParams(s, k) {
  const g = s === 'a' ? 'stack' : 'hybrid';
  const id = f => sid(s, k, f);
  const own = eq => ({ gate: id('t'), gateEq: eq });
  const typeGate = k > 1 ? { gate: sid(s, k - 1, 't'), gateEq: ON_TYPES } : s === 'b' ? { gate: 'hybridMode', gateEq: [1, 2, 3] } : {};
  return [
    { id: id('t'), label: 'Fold', type: 'select', group: g, options: STEP_NAMES, def: s === 'a' && k === 1 ? 3 : 0, section: `${STACKS[s].name} · Step ${k}`, ...typeGate },
    { id: id('abs'), label: 'Axes', type: 'select', group: g, options: ABS_MASKS, def: 0, ...own(1) },
    { id: id('swap'), label: 'Swaps', type: 'select', group: g, options: SWAP_MODES, def: 0, ...own(2) },
    { id: id('zm'), label: 'Mode', type: 'select', group: g, options: ZTRICK_MODES, def: 0, ...own(7) },
    { id: id('pv'), label: 'Pivot', type: 'select', group: g, options: ROT_PIVOTS, def: 0, ...own(8) },
    { id: id('ax'), label: 'Axis', type: 'select', group: g, options: AXES, def: 2, ...own([11, 17]) },
    { id: id('nx'), label: 'NX', type: 'range', group: g, min: -1, max: 1, step: 0.001, def: 1, row: id('pn'), mutate: true, fine: true, ...own(6) },
    { id: id('ny'), label: 'NY', type: 'range', group: g, min: -1, max: 1, step: 0.001, def: 1, row: id('pn'), mutate: true, fine: true, ...own(6) },
    { id: id('nz'), label: 'NZ', type: 'range', group: g, min: -1, max: 1, step: 0.001, def: 0, row: id('pn'), mutate: true, fine: true, ...own(6) },
    { id: id('d'), label: 'Offset d', type: 'range', group: g, min: -2, max: 2, step: 0.001, def: 0, row: id('pd'), mutate: true, fine: true, ...own(6) },
    { id: id('k'), label: 'Strength', type: 'range', group: g, min: 0, max: 1, step: 0.001, def: 1, hardMin: 0, hardMax: 1, row: id('pd'), ...own(6) },
    { id: id('ra'), label: 'α (Z)', type: 'range', group: g, min: -180, max: 180, step: 0.01, def: 0, row: id('r'), mutate: true, fine: true, ...own(8) },
    { id: id('rb'), label: 'β (Y)', type: 'range', group: g, min: -180, max: 180, step: 0.01, def: 0, row: id('r'), mutate: true, fine: true, ...own(8) },
    { id: id('rg'), label: 'γ (X)', type: 'range', group: g, min: -180, max: 180, step: 0.01, def: 0, row: id('r'), mutate: true, fine: true, ...own(8) },
    { id: id('lx'), label: 'LX', type: 'range', group: g, min: 0, max: 4, step: 0.001, def: 1, hardMin: 0, row: id('l'), mutate: true, fine: true, ...own([9, 10, 18, 19]) },
    { id: id('ly'), label: 'LY', type: 'range', group: g, min: 0, max: 4, step: 0.001, def: 1, hardMin: 0, row: id('l'), mutate: true, fine: true, ...own([9, 10, 18, 19]) },
    { id: id('lz'), label: 'LZ', type: 'range', group: g, min: 0, max: 4, step: 0.001, def: 1, hardMin: 0, row: id('l'), mutate: true, fine: true, ...own([9, 10, 18, 19]) },
    { id: id('n'), label: 'Sectors N', type: 'range', group: g, min: 1, max: 16, step: 1, def: 6, int: true, hardMin: 1, hardMax: 64, ...own([11, 17]) },
    // Sphere Inversion (Kyma's inversion and Mandelbulber's in one step).
    { id: id('icx'), label: 'CX', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ic'), section: 'Inversion Centre c', mutate: true, fine: true, ...own(12) },
    { id: id('icy'), label: 'CY', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ic'), mutate: true, fine: true, ...own(12) },
    { id: id('icz'), label: 'CZ', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ic'), mutate: true, fine: true, ...own(12) },
    { id: id('ir'), label: 'Radius R', type: 'range', group: g, min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0.0001, row: id('ira'), mutate: true, fine: true, ...own(12) },
    { id: id('ia'), label: 'Amount', type: 'range', group: g, min: 0, max: 1, step: 0.001, def: 1, hardMin: 0, hardMax: 1, row: id('ira'), ...own(12) },
    { id: id('iax'), label: 'AX', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ia3'), section: 'Then Shift A, Scale S', mutate: true, fine: true, ...own(12) },
    { id: id('iay'), label: 'AY', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ia3'), mutate: true, fine: true, ...own(12) },
    { id: id('iaz'), label: 'AZ', type: 'range', group: g, min: -3, max: 3, step: 0.001, def: 0, row: id('ia3'), mutate: true, fine: true, ...own(12) },
    { id: id('is'), label: 'Scale S', type: 'range', group: g, min: 0.1, max: 4, step: 0.001, def: 1, row: id('isl'), mutate: true, fine: true, ...own(12) },
    { id: id('il'), label: 'DE Limit (0 = off)', type: 'range', group: g, min: 0, max: 100, step: 0.1, def: 10, hardMin: 0, row: id('isl'), ...own(12) },
    // Kleinian (Knighty): box fold to ±L (LX/LY/LZ above), inversion radius, shift C.
    { id: id('kr'), label: 'Inversion Radius R', type: 'range', group: g, min: 0.1, max: 3, step: 0.001, def: 1, hardMin: 0.0001, mutate: true, fine: true, ...own(18) },
    { id: id('kcx'), label: 'CX', type: 'range', group: g, min: -2, max: 2, step: 0.001, def: 0, row: id('kc'), section: 'Then Add C', mutate: true, fine: true, ...own(18) },
    { id: id('kcy'), label: 'CY', type: 'range', group: g, min: -2, max: 2, step: 0.001, def: 0, row: id('kc'), mutate: true, fine: true, ...own(18) },
    { id: id('kcz'), label: 'CZ', type: 'range', group: g, min: -2, max: 2, step: 0.001, def: 0, row: id('kc'), mutate: true, fine: true, ...own(18) },
    // N-Flake (Syntopia): which polyhedron's vertices, and how far out.
    { id: id('fp'), label: 'Vertices', type: 'select', group: g, options: FLAKE_POLYS, def: 1, ...own(20) },
    { id: id('fr'), label: 'Vertex Distance', type: 'range', group: g, min: 0, max: 3, step: 0.001, def: 1, mutate: true, fine: true, ...own(20) },
    // Smooth folds (Benesi): rounded creases, Softness k.
    { id: id('sm'), label: 'Smooth (round the creases)', type: 'bool', group: g, def: false, ...own(SMOOTH_TYPES) },
    { id: id('sk'), label: 'Softness k (large k thins the fractal)', type: 'range', group: g, min: 0, max: 0.5, step: 0.0005, def: 0.05, hardMin: 0, mutate: true, fine: true, gate: id('sm') },
    // Every step: the iterations it runs on, [From, Until).
    { id: id('if'), label: 'From Iter', type: 'range', group: g, min: 0, max: 20, step: 1, def: 0, int: true, hardMin: 0, hardMax: 249, row: id('iit'), section: 'Runs on Iterations  [From, Until)', ...own(ON_TYPES) },
    { id: id('iu'), label: 'Until Iter', type: 'range', group: g, min: 1, max: 40, step: 1, def: 250, int: true, hardMin: 1, hardMax: 250, row: id('iit'), ...own(ON_TYPES) },
    { id: id('cw'), label: 'Colour Weight', type: 'range', group: g, min: 0, max: 2, step: 0.01, def: 1, hardMin: 0, hardMax: 100, ...own(ON_TYPES) },
  ];
}
const stackParams = s => Array.from({ length: STACKS[s].n }, (_, i) => slotParams(s, i + 1)).flat();
const B_ON = { gate: 'hybridMode', gateEq: [1, 2, 3] };

export const FORMULA_PARAMS = [
  // ── Fold stack A ────────────────────────────────────────────────────────
  ...stackParams('a'),

  // ── Rotation & scale (one iteration: pre-rotation → stack → post-rotation → scale) ──
  { id: 'scale', label: 'Scale s', type: 'range', group: 'xform', min: -4, max: 4, step: 0.001, def: 2, mutate: true, fine: true },
  { id: 'ctrMode', label: 'Centre', type: 'select', group: 'xform', options: CENTER_MODES, def: 0, section: 'Scale Centre C  (z → s·(z − C) + C)' },
  { id: 'centerX', label: 'CX', type: 'range', group: 'xform', min: -3, max: 3, step: 0.001, def: 1, row: 'ctr', gate: 'ctrMode', gateEq: 0, mutate: true, fine: true },
  { id: 'centerY', label: 'CY', type: 'range', group: 'xform', min: -3, max: 3, step: 0.001, def: 1, row: 'ctr', gate: 'ctrMode', gateEq: 0, mutate: true, fine: true },
  { id: 'centerZ', label: 'CZ', type: 'range', group: 'xform', min: -3, max: 3, step: 0.001, def: 1, row: 'ctr', gate: 'ctrMode', gateEq: 0, mutate: true, fine: true },
  { id: 'wyGroup', label: 'Mirror Cell', type: 'select', group: 'xform', options: WYTHOFF.map(w => w.name), def: 1, gate: 'ctrMode', gateEq: 1 },
  { id: 'wyA', label: 'Corner A', type: 'range', group: 'xform', min: 0, max: 1, step: 0.001, def: 1, hardMin: 0, row: 'wy', gate: 'ctrMode', gateEq: 1, mutate: true, fine: true },
  { id: 'wyB', label: 'Corner B', type: 'range', group: 'xform', min: 0, max: 1, step: 0.001, def: 0, hardMin: 0, row: 'wy', gate: 'ctrMode', gateEq: 1, mutate: true, fine: true },
  { id: 'wyC', label: 'Corner C', type: 'range', group: 'xform', min: 0, max: 1, step: 0.001, def: 0, hardMin: 0, row: 'wy', gate: 'ctrMode', gateEq: 1, mutate: true, fine: true },
  { id: 'wyR', label: 'Centre Distance', type: 'range', group: 'xform', min: 0, max: 3, step: 0.001, def: 1, gate: 'ctrMode', gateEq: 1, mutate: true, fine: true },
  { id: 'preAlpha', label: 'Pre α', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, section: 'Pre-Rotation (before the stack)', mutate: true, fine: true },
  { id: 'preBeta', label: 'Pre β', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true },
  { id: 'preGamma', label: 'Pre γ', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true },
  { id: 'alpha', label: 'Post α', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, section: 'Post-Rotation (after the stack, before scaling)', mutate: true, fine: true },
  { id: 'beta', label: 'Post β', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true },
  { id: 'gamma', label: 'Post γ', type: 'range', group: 'xform', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true },
  { id: 'postRotC', label: 'Post-Rotation About the Centre', type: 'bool', group: 'xform', def: false },
  { id: 'rotStart', label: 'Rotations Start at Iteration', type: 'range', group: 'xform', min: 0, max: 20, step: 1, def: 0, int: true, hardMin: 0, hardMax: 250 },

  // ── Per-iteration variation ─────────────────────────────────────────────
  { id: 'scaleStep', label: 'Scale Step (added each iteration)', type: 'range', group: 'vary', min: -0.2, max: 0.2, step: 0.0001, def: 0, mutate: true, fine: true },
  { id: 'centerStepX', label: 'DX', type: 'range', group: 'vary', min: -0.2, max: 0.2, step: 0.0001, def: 0, row: 'cst', section: 'Centre Drift (added each iteration)', mutate: true, fine: true },
  { id: 'centerStepY', label: 'DY', type: 'range', group: 'vary', min: -0.2, max: 0.2, step: 0.0001, def: 0, row: 'cst', mutate: true, fine: true },
  { id: 'centerStepZ', label: 'DZ', type: 'range', group: 'vary', min: -0.2, max: 0.2, step: 0.0001, def: 0, row: 'cst', mutate: true, fine: true },
  { id: 'spinX', label: 'SX', type: 'range', group: 'vary', min: -0.5, max: 0.5, step: 0.001, def: 0, row: 'spin', section: 'Iteration Spin (iteration k turns by spin^k)', mutate: true, fine: true },
  { id: 'spinY', label: 'SY', type: 'range', group: 'vary', min: -0.5, max: 0.5, step: 0.001, def: 0, row: 'spin', mutate: true, fine: true },
  { id: 'spinZ', label: 'SZ', type: 'range', group: 'vary', min: -0.5, max: 0.5, step: 0.001, def: 0, row: 'spin', mutate: true, fine: true },

  // ── Hybrid schedule + stack B ───────────────────────────────────────────
  { id: 'hybridMode', label: 'Schedule', type: 'select', group: 'hybrid', options: HYBRID_MODES, def: 0, interp: 'step' },
  { id: 'hybN', label: 'N', type: 'range', group: 'hybrid', min: 1, max: 12, step: 1, def: 2, int: true, hardMin: 1, hardMax: 250, gate: 'hybridMode', gateEq: [1, 2] },
  { id: 'hybLen', label: 'Pattern Length', type: 'range', group: 'hybrid', min: 1, max: 8, step: 1, def: 3, int: true, hardMin: 1, hardMax: 8, gate: 'hybridMode', gateEq: 3 },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `hybP${i + 1}`, label: `${i + 1}`, type: 'bool', group: 'hybrid', def: i === 2, row: i < 4 ? 'hpa' : 'hpb', gate: 'hybridMode', gateEq: 3, ...(i === 0 ? { section: 'Pattern: checked iterations use Stack B' } : {}) })),
  { id: 'scaleB', label: 'B Scale', type: 'range', group: 'hybrid', min: -4, max: 4, step: 0.001, def: 2, mutate: true, fine: true, section: 'Stack B Scale & Rotation', ...B_ON },
  { id: 'centerBX', label: 'BCX', type: 'range', group: 'hybrid', min: -3, max: 3, step: 0.001, def: 1, row: 'cb', mutate: true, fine: true, ...B_ON },
  { id: 'centerBY', label: 'BCY', type: 'range', group: 'hybrid', min: -3, max: 3, step: 0.001, def: 1, row: 'cb', mutate: true, fine: true, ...B_ON },
  { id: 'centerBZ', label: 'BCZ', type: 'range', group: 'hybrid', min: -3, max: 3, step: 0.001, def: 1, row: 'cb', mutate: true, fine: true, ...B_ON },
  { id: 'alphaB', label: 'B Post α', type: 'range', group: 'hybrid', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true, ...B_ON },
  { id: 'betaB', label: 'B Post β', type: 'range', group: 'hybrid', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true, ...B_ON },
  { id: 'gammaB', label: 'B Post γ', type: 'range', group: 'hybrid', min: -PI, max: PI, step: 0.001, def: 0, mutate: true, fine: true, ...B_ON },
  ...stackParams('b'),

  // ── DE shape ────────────────────────────────────────────────────────────
  { id: 'shape', label: 'Shape', type: 'select', group: 'shape', options: SHAPES, def: 3 },
  { id: 'shapeR', label: 'Size', type: 'range', group: 'shape', min: 0, max: 3, step: 0.001, def: 1, hardMin: 0, mutate: true, fine: true },
  { id: 'shapeT', label: 'Thickness / Offset', type: 'range', group: 'shape', min: 0.005, max: 1, step: 0.001, def: 0.1, hardMin: 0, gate: 'shape', gateEq: [4, 5, 6, 7, 8, 9], mutate: true, fine: true },
  { id: 'shapeAx', label: 'Axis', type: 'select', group: 'shape', options: AXES, def: 2, gate: 'shape', gateEq: [7, 8] },
  { id: 'shapeBX', label: 'BX', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'sb', section: 'Box Proportions', gate: 'shape', gateEq: [1, 5], mutate: true },
  { id: 'shapeBY', label: 'BY', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'sb', gate: 'shape', gateEq: [1, 5], mutate: true },
  { id: 'shapeBZ', label: 'BZ', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'sb', gate: 'shape', gateEq: [1, 5], mutate: true },
  // Fold-and-cut polyhedra (Knighty). Shown by ui.js whenever the seed or the
  // level shape is a polyhedron, so these carry no gate.
  { id: 'polyLink', label: 'Vertex from the Wythoff Centre Weights', type: 'bool', group: 'shape', def: false },
  { id: 'polyA', label: 'Corner A', type: 'range', group: 'shape', min: 0, max: 1, step: 0.001, def: 1, hardMin: 0, row: 'pw', fine: true },
  { id: 'polyB', label: 'Corner B', type: 'range', group: 'shape', min: 0, max: 1, step: 0.001, def: 1, hardMin: 0, row: 'pw', fine: true },
  { id: 'polyC', label: 'Corner C', type: 'range', group: 'shape', min: 0, max: 1, step: 0.001, def: 0, hardMin: 0, row: 'pw', fine: true },
  { id: 'polyF1', label: 'Faces A', type: 'bool', group: 'shape', def: true, row: 'pf' },
  { id: 'polyF2', label: 'Faces B', type: 'bool', group: 'shape', def: true, row: 'pf' },
  { id: 'polyF3', label: 'Faces C', type: 'bool', group: 'shape', def: true, row: 'pf' },
  { id: 'polyE', label: 'Edges', type: 'bool', group: 'shape', def: false, row: 'pe' },
  { id: 'polyER', label: 'Edge Radius', type: 'range', group: 'shape', min: 0, max: 0.3, step: 0.0005, def: 0.03, hardMin: 0, row: 'pe', fine: true },
  { id: 'polyV', label: 'Vertices', type: 'bool', group: 'shape', def: false, row: 'pv' },
  { id: 'polyVR', label: 'Vertex Radius', type: 'range', group: 'shape', min: 0, max: 0.5, step: 0.0005, def: 0.08, hardMin: 0, row: 'pv', fine: true },

  // Shapes at every level: a second shape joined at the start of each iteration.
  { id: 'lvMode', label: 'Level Shapes', type: 'select', group: 'shape', options: LEVEL_MODES, def: 0, interp: 'step', section: 'Shapes at Every Level' },
  { id: 'lvShape', label: 'Level Shape', type: 'select', group: 'shape', options: SHAPES, def: 7, gate: 'lvMode', gateEq: [1, 2, 3, 4] },
  { id: 'lvR', label: 'Size', type: 'range', group: 'shape', min: 0, max: 3, step: 0.001, def: 0.5, hardMin: 0, gate: 'lvMode', gateEq: [1, 2, 3, 4], mutate: true, fine: true },
  { id: 'lvT', label: 'Thickness', type: 'range', group: 'shape', min: 0.002, max: 1, step: 0.001, def: 0.05, hardMin: 0, gate: 'lvShape', gateEq: [4, 5, 6, 7, 8, 9], mutate: true, fine: true },
  { id: 'lvAx', label: 'Axis', type: 'select', group: 'shape', options: AXES, def: 2, gate: 'lvShape', gateEq: [7, 8] },
  { id: 'lvBX', label: 'BX', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'lb', gate: 'lvShape', gateEq: [1, 5], mutate: true },
  { id: 'lvBY', label: 'BY', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'lb', gate: 'lvShape', gateEq: [1, 5], mutate: true },
  { id: 'lvBZ', label: 'BZ', type: 'range', group: 'shape', min: 0.05, max: 3, step: 0.001, def: 1, hardMin: 0, row: 'lb', gate: 'lvShape', gateEq: [1, 5], mutate: true },
  { id: 'lvOX', label: 'OX', type: 'range', group: 'shape', min: -3, max: 3, step: 0.001, def: 0, row: 'lo', section: 'Level Shape Position (in the folded frame)', gate: 'lvMode', gateEq: [1, 2, 3, 4], mutate: true, fine: true },
  { id: 'lvOY', label: 'OY', type: 'range', group: 'shape', min: -3, max: 3, step: 0.001, def: 0, row: 'lo', gate: 'lvMode', gateEq: [1, 2, 3, 4], mutate: true, fine: true },
  { id: 'lvOZ', label: 'OZ', type: 'range', group: 'shape', min: -3, max: 3, step: 0.001, def: 0, row: 'lo', gate: 'lvMode', gateEq: [1, 2, 3, 4], mutate: true, fine: true },
  { id: 'lvK', label: 'Blend Radius', type: 'range', group: 'shape', min: 0, max: 1, step: 0.001, def: 0.15, hardMin: 0, gate: 'lvMode', gateEq: 2, mutate: true, fine: true },
  { id: 'lvFrom', label: 'From Level', type: 'range', group: 'shape', min: 0, max: 20, step: 1, def: 0, int: true, hardMin: 0, hardMax: 249, row: 'lr', gate: 'lvMode', gateEq: [1, 2, 3, 4] },
  { id: 'lvUntil', label: 'Until Level', type: 'range', group: 'shape', min: 1, max: 40, step: 1, def: 250, int: true, hardMin: 1, hardMax: 250, row: 'lr', gate: 'lvMode', gateEq: [1, 2, 3, 4] },
  { id: 'lvCol', label: 'Colour Offset per Level', type: 'range', group: 'shape', min: 0, max: 2, step: 0.001, def: 0.3, hardMin: 0, gate: 'lvMode', gateEq: [1, 2, 3, 4] },

  // ── Iteration ───────────────────────────────────────────────────────────
  { id: 'iterations', label: 'Iterations', type: 'range', group: 'iter', min: 1, max: 40, step: 1, def: 12, int: true, hardMin: 1, hardMax: 250 },
  { id: 'bailout', label: 'Bailout |z|', type: 'range', group: 'iter', min: 2, max: 1000, step: 0.1, def: 100, hardMin: 1, hardMax: 1e6 },
  ...marchParams({ stepFactor: { label: 'Step Factor (1 = exact DE)' } }),
];

defineParams({
  groups: GROUPS_LEFT,
  params: FORMULA_PARAMS,
  scene: {
    override: {
      // Opening view and gradient for the KIFS presets.
      rotX: { def: 0.62 }, rotY: { def: -0.42 }, dist: { def: 4.3 },
      palette: { def: 3 },
      // Per-step colour weights live on each fold step (Colour Weight).
      colorSource: { options: COLOR_SOURCES },
      colorIters: { gateEq: [1, 2, 3] },
    },
  },
});
