// KIFS fold-step library — the one place that defines what each fold step does.
//
// Every step type has two implementations written side by side: `glsl()` emits
// straight-line GLSL for the specialised shader, and `cpu()` is the identical
// JavaScript used by the CPU distance estimator (autofocus, Rebirth, tests).
// tests/run.mjs and tests/browser.mjs check that the two agree.
//
// A fold stack is a list of slots. Each slot has a type and, for some types, a
// compile-time option (abs mask, swap mode, rotation pivot, dihedral axis,
// z-trick mode). Type + option go into the program key, so a stack compiles to
// exactly the code it needs and nothing else; every continuous value (plane
// normals, limits, angles, colour weights) is a uniform.
//
// Every step is a 1-Lipschitz map: a reflection across a plane, a conditional
// reflection (fold), a rotation, or a partial reflection with strength in
// [0, 1]. So the only stretch in an iteration is the final scale, the running
// derivative is exactly Π|s|, and shape(z) / dr is a true lower bound on the
// distance: Step Factor 1.0 never overshoots.

export const STEP_NAMES = [
  'Off', 'Abs', 'Plane Swaps', 'Sierpinski (tetrahedral)', 'Octahedral Planes', 'Icosahedral Planes',
  'Custom Plane', 'Menger Z-Trick', 'Rotate', 'Edge Fold', 'Box Fold', 'Dihedral N-Fold',
];
export const T = { OFF: 0, ABS: 1, SWAP: 2, SIERP: 3, OCTA: 4, ICOSA: 5, PLANE: 6, ZTRICK: 7, ROT: 8, EDGE: 9, BOX: 10, DIHEDRAL: 11 };
export const ABS_MASKS = ['XYZ', 'XY', 'XZ', 'YZ', 'X', 'Y', 'Z'];
export const SWAP_MODES = ['Sort x ≥ y ≥ z', 'x ↔ y (if x < y)', 'x ↔ z (if x < z)', 'y ↔ z (if y < z)'];
export const ROT_PIVOTS = ['Origin', 'Centre'];
export const AXES = ['X', 'Y', 'Z'];
export const ZTRICK_MODES = ['Mirror (continuous)', 'Shift (Mandelbulber)'];

export const STEP_DESC = [
  '',
  'Mirror the chosen axes to positive: reflections in the coordinate planes.',
  'Reflect across the diagonal planes x = y, x = z, y = z, so coordinates end up sorted.',
  'Reflect across x + y = 0, x + z = 0, y + z = 0: the tetrahedral (Sierpinski) mirror set.',
  'Abs then sort: the 48-element octahedral mirror group (Menger sponge symmetry).',
  'Fold into one of the 120 mirror cells of the icosahedron (x, y and a golden-ratio mirror): full icosahedral symmetry.',
  'Fold across your own plane n·z = d (normal is normalised). Strength < 1 is a partial reflection.',
  "Menger's trick: z is folded about ½·Cz·(s−1)/s, so the scale step shifts z on one side only. Mirror is continuous (exact DE anywhere in the stack); Shift is Mandelbulber's form, which jumps and is exact only when an Abs on z follows it next iteration (as in the Menger sponge).",
  'Rotate space mid-stack (α about Z, β about Y, γ about X, applied γ first), about the origin or the scale centre.',
  'Fold each axis down about its edge value E: z → E − |E − z| (axes with E = 0 are left alone).',
  'Mandelbox box fold: clamp to ±limit and reflect, z → 2·clamp(z) − z.',
  'Mirror into one of N angular sectors around an axis: N-fold dihedral (prism) symmetry.',
];

// Slot fields. Defaults are what a freshly enabled step starts with.
export const SLOT_FIELDS = ['t', 'abs', 'swap', 'zm', 'pv', 'ax', 'nx', 'ny', 'nz', 'd', 'k', 'ra', 'rb', 'rg', 'lx', 'ly', 'lz', 'n', 'cw'];
export const STACKS = { a: { n: 12, name: 'A' }, b: { n: 8, name: 'B' } };
export const sid = (s, k, f) => `${s}${k}${f}`; // e.g. a3t, b1nx (k is 1-based)

const DEG = Math.PI / 180;
// Icosahedral (H3) fold: the mirrors x = 0, y = 0 and the golden mirror with
// normal ICO_N bound a fundamental triangle of the 120-element group Ih (angles
// π/2, π/3, π/5; corners at a 5-fold vertex (0, 1, φ), a 2-fold edge midpoint
// (0, 0, 1) and a 3-fold face centre (φ, 0, 2φ + 1)). Reflecting into it six
// times always converges (tests/run.mjs checks the domain is 1/120 of space).
export const ICO_PASSES = 6;
const PHI = (1 + Math.sqrt(5)) / 2;
export const ICO_N = [-PHI / 2, -0.5, 1 / (2 * PHI)];

// Which option field a type compiles in.
const OPT_FIELD = { 1: 'abs', 2: 'swap', 7: 'zm', 8: 'pv', 11: 'ax' };

// Active slots of stack s ('a' | 'b'), stopping at the first Off (later slots
// are hidden in the panel, so they never count). [{ k, t, o }]
export function stackOf(v, s) {
  const out = [];
  for (let k = 1; k <= STACKS[s].n; k++) {
    const t = v[sid(s, k, 't')] | 0;
    if (!t) break;
    const of = OPT_FIELD[t];
    out.push({ k, t, o: of ? (v[sid(s, k, of)] | 0) : 0 });
  }
  return out;
}

export const stackKey = slots => slots.map(x => x.t.toString(36) + (x.o ? x.o : '')).join('.');

// Rotation for the Rotate step: Mandelbulber's SetRotation3 order,
// Rz(α)·Ry(β)·Rx(γ), angles in degrees (row-major).
const RXm = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const RYm = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const RZm = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
export const stepRotation = (a, b, g) => mm(mm(RZm((a || 0) * DEG), RYm((b || 0) * DEG)), RXm((g || 0) * DEG));

// Per-slot numeric data shared by the uniform upload and the CPU port.
//   p: vec4 (plane normal + offset; edge / box limits; dihedral N)
//   q: vec4 (x = plane strength, w = colour weight)
//   m: mat3 row-major (Rotate only)
export function slotData(v, s, slot) {
  const g = f => v[sid(s, slot.k, f)];
  const q = [1, 0, 0, g('cw') ?? 1];
  let p = null, m = null;
  switch (slot.t) {
    case T.PLANE: {
      let n = [g('nx') ?? 1, g('ny') ?? 0, g('nz') ?? 0];
      const l = Math.hypot(...n);
      n = l > 1e-12 ? n.map(x => x / l) : [1, 0, 0];
      p = [...n, g('d') ?? 0];
      q[0] = Math.max(0, Math.min(1, g('k') ?? 1));
      break;
    }
    case T.ROT: m = stepRotation(g('ra'), g('rb'), g('rg')); break;
    case T.EDGE: case T.BOX: p = [g('lx') ?? 1, g('ly') ?? 1, g('lz') ?? 1, 0]; break;
    case T.DIHEDRAL: p = [Math.max(1, Math.round(g('n') ?? 6)), 0, 0, 0]; break;
    default: break;
  }
  return { p, q, m };
}

const needsP = t => t === T.PLANE || t === T.EDGE || t === T.BOX || t === T.DIHEDRAL;

// ── GLSL emission ────────────────────────────────────────────────────────────
// Each step body works on `z` with `h` (reflections counted for fold colouring),
// and may read P (vec4), Q (vec4), M (mat3), s (this iteration's scale) and
// c (its centre). Names are substituted per slot.
function glslBody(t, o) {
  switch (t) {
    case T.ABS: return ABS_MASKS[o].toLowerCase().split('').map(a => `if (z.${a} < 0.0) { z.${a} = -z.${a}; h += 1.0; }`).join('\n    ');
    case T.SWAP: return [
      o === 0 || o === 1 ? 'if (z.x < z.y) { z.xy = z.yx; h += 1.0; }' : '',
      o === 0 || o === 2 ? 'if (z.x < z.z) { z.xz = z.zx; h += 1.0; }' : '',
      o === 0 || o === 3 ? 'if (z.y < z.z) { z.yz = z.zy; h += 1.0; }' : '',
    ].filter(Boolean).join('\n    ');
    case T.SIERP: return `if (z.x + z.y < 0.0) { z.xy = -z.yx; h += 1.0; }
    if (z.x + z.z < 0.0) { z.xz = -z.zx; h += 1.0; }
    if (z.y + z.z < 0.0) { z.yz = -z.zy; h += 1.0; }`;
    case T.OCTA: return glslBody(T.ABS, 0) + '\n    ' + glslBody(T.SWAP, 0);
    case T.ICOSA: return `for (int ip = 0; ip < ${ICO_PASSES}; ip++) {
      if (z.x < 0.0) { z.x = -z.x; h += 1.0; }
      if (z.y < 0.0) { z.y = -z.y; h += 1.0; }
      float ti = dot(z, ICO_N); if (ti < 0.0) { z -= 2.0 * ti * ICO_N; h += 1.0; }
    }`;
    case T.PLANE: return 'float tp = dot(z, P.xyz) - P.w; if (tp < 0.0) { z -= (2.0 * Q.x * tp) * P.xyz; h += 1.0; }';
    case T.ZTRICK: return o === 1
      ? 'if (s * z.z <= 0.5 * c.z * (s - 1.0)) { z.z += c.z * (s - 1.0) / sNZ(s); h += 1.0; }'
      : 'float hz = 0.5 * c.z * (s - 1.0) / sNZ(s); float dz = z.z - hz; if (s * dz < 0.0) { z.z = hz - dz; h += 1.0; }';
    case T.ROT: return o === 1 ? 'z = M * (z - c) + c;' : 'z = M * z;';
    case T.EDGE: return ['x', 'y', 'z'].map(a => `if (P.${a} > 0.0 && z.${a} > P.${a}) { z.${a} = 2.0 * P.${a} - z.${a}; h += 1.0; }`).join('\n    ');
    case T.BOX: return ['x', 'y', 'z'].map(a => `if (z.${a} > P.${a}) { z.${a} = 2.0 * P.${a} - z.${a}; h += 1.0; } else if (z.${a} < -P.${a}) { z.${a} = -2.0 * P.${a} - z.${a}; h += 1.0; }`).join('\n    ');
    case T.DIHEDRAL: {
      const sw = ['yz', 'zx', 'xy'][o];
      return `vec2 dw = z.${sw}; float sec = 3.14159265 / P.x; float a0 = atan(dw.y, dw.x);
    float a1 = abs(mod(a0 + sec, 2.0 * sec) - sec); if (abs(a1 - a0) > 1e-5) h += 1.0;
    z.${sw} = length(dw) * vec2(cos(a1), sin(a1));`;
    }
    default: return '';
  }
}

// Uniform declarations, trap globals and the stack function for stack s.
export function glslStack(s, slots) {
  const S = s.toUpperCase();
  const decl = [], body = [], traps = [];
  for (const sl of slots) {
    const n = `u_${s}${sl.k}`;
    decl.push(`uniform vec4 ${n}q;`);
    if (needsP(sl.t)) decl.push(`uniform vec4 ${n}p;`);
    if (sl.t === T.ROT) decl.push(`uniform mat3 ${n}m;`);
    traps.push(`g_t${s}${sl.k}`);
    const code = glslBody(sl.t, sl.o)
      .replace(/\bP\./g, `${n}p.`).replace(/\bQ\./g, `${n}q.`).replace(/\bM \*/g, `${n}m *`);
    body.push(`  { // ${s}${sl.k}: ${STEP_NAMES[sl.t]}
    float h = 0.0;
    ${code}
    stepHit(h, ${n}q.w);
    g_t${s}${sl.k} = min(g_t${s}${sl.k}, dot(z, z));
  }`);
  }
  return {
    decl: decl.join('\n') + (traps.length ? `\nfloat ${traps.join(', ')};` : ''),
    fn: `vec3 stack${S}(vec3 z, float s, vec3 c) {\n${body.join('\n')}\n  return z;\n}`,
    reset: traps.map(t => `${t} = 1e10;`).join(' '),
    sum: traps.map((t, i) => `(${t} < 1e9 ? u_${s}${slots[i].k}q.w * ${t} : 0.0)`).join(' + ') || '0.0',
  };
}

// ── CPU port (mirrors glslBody line for line) ───────────────────────────────
const sNZ = s => (Math.abs(s) < 1e-6 ? (s < 0 ? -1e-6 : 1e-6) : s);
const fmodG = (x, y) => x - y * Math.floor(x / y); // GLSL mod()

function cpuStep(t, o, z, D, s, c) {
  let h = 0;
  const [x0, y0, w0] = z;
  let x = x0, y = y0, w = w0;
  switch (t) {
    case T.ABS: {
      const m = ABS_MASKS[o];
      if (m.includes('X') && x < 0) { x = -x; h++; }
      if (m.includes('Y') && y < 0) { y = -y; h++; }
      if (m.includes('Z') && w < 0) { w = -w; h++; }
      break;
    }
    case T.SWAP: {
      if ((o === 0 || o === 1) && x < y) { [x, y] = [y, x]; h++; }
      if ((o === 0 || o === 2) && x < w) { [x, w] = [w, x]; h++; }
      if ((o === 0 || o === 3) && y < w) { [y, w] = [w, y]; h++; }
      break;
    }
    case T.SIERP: {
      if (x + y < 0) { [x, y] = [-y, -x]; h++; }
      if (x + w < 0) { [x, w] = [-w, -x]; h++; }
      if (y + w < 0) { [y, w] = [-w, -y]; h++; }
      break;
    }
    case T.OCTA: {
      const a = cpuStep(T.ABS, 0, z, D, s, c), b = cpuStep(T.SWAP, 0, a.z, D, s, c);
      return { z: b.z, h: a.h + b.h };
    }
    case T.ICOSA: {
      const N = ICO_N;
      for (let ip = 0; ip < ICO_PASSES; ip++) {
        if (x < 0) { x = -x; h++; }
        if (y < 0) { y = -y; h++; }
        const ti = x * N[0] + y * N[1] + w * N[2];
        if (ti < 0) { x -= 2 * ti * N[0]; y -= 2 * ti * N[1]; w -= 2 * ti * N[2]; h++; }
      }
      break;
    }
    case T.PLANE: {
      const P = D.p, tp = x * P[0] + y * P[1] + w * P[2] - P[3];
      if (tp < 0) { const f = 2 * D.q[0] * tp; x -= f * P[0]; y -= f * P[1]; w -= f * P[2]; h++; }
      break;
    }
    case T.ZTRICK: {
      if (o === 1) { if (s * w <= 0.5 * c[2] * (s - 1)) { w += c[2] * (s - 1) / sNZ(s); h++; } }
      else { const hz = 0.5 * c[2] * (s - 1) / sNZ(s), dz = w - hz; if (s * dz < 0) { w = hz - dz; h++; } }
      break;
    }
    case T.ROT: {
      const M = D.m;
      const u = o === 1 ? [x - c[0], y - c[1], w - c[2]] : [x, y, w];
      x = M[0] * u[0] + M[1] * u[1] + M[2] * u[2];
      y = M[3] * u[0] + M[4] * u[1] + M[5] * u[2];
      w = M[6] * u[0] + M[7] * u[1] + M[8] * u[2];
      if (o === 1) { x += c[0]; y += c[1]; w += c[2]; }
      break;
    }
    case T.EDGE: {
      const P = D.p;
      if (P[0] > 0 && x > P[0]) { x = 2 * P[0] - x; h++; }
      if (P[1] > 0 && y > P[1]) { y = 2 * P[1] - y; h++; }
      if (P[2] > 0 && w > P[2]) { w = 2 * P[2] - w; h++; }
      break;
    }
    case T.BOX: {
      const P = D.p, f = (a, l) => { if (a > l) { h++; return 2 * l - a; } if (a < -l) { h++; return -2 * l - a; } return a; };
      x = f(x, P[0]); y = f(y, P[1]); w = f(w, P[2]);
      break;
    }
    case T.DIHEDRAL: {
      const sec = Math.PI / D.p[0];
      const idx = [[1, 2], [2, 0], [0, 1]][o];
      const v = [x, y, w];
      const u0 = v[idx[0]], u1 = v[idx[1]];
      const a0 = Math.atan2(u1, u0);
      const a1 = Math.abs(fmodG(a0 + sec, 2 * sec) - sec);
      if (Math.abs(a1 - a0) > 1e-5) h++;
      const r = Math.hypot(u0, u1);
      v[idx[0]] = r * Math.cos(a1); v[idx[1]] = r * Math.sin(a1);
      [x, y, w] = v;
      break;
    }
    default: break;
  }
  return { z: [x, y, w], h };
}

// Returns (z, s, c, acc) => z for a compiled stack. acc: { fold, colOn, traps[] }.
export function cpuStack(v, s, slots) {
  const data = slots.map(sl => slotData(v, s, sl));
  return (z, sc, c, acc) => {
    for (let i = 0; i < slots.length; i++) {
      const r = cpuStep(slots[i].t, slots[i].o, z, data[i], sc, c);
      z = r.z;
      acc.fold += acc.colOn * data[i].q[3] * r.h;
      const zz = z[0] * z[0] + z[1] * z[1] + z[2] * z[2];
      const tk = s + slots[i].k;
      acc.traps[tk] = Math.min(acc.traps[tk] ?? 1e10, zz);
      acc.w[tk] = data[i].q[3];
    }
    return z;
  };
}

// ── Final DE shapes ─────────────────────────────────────────────────────────
export const SHAPES = ['Sphere', 'Box', 'Octahedron', 'Tetrahedron'];
export const SHAPE_GLSL = [
  'return length(z) - u_shapeR;',
  'vec3 q = abs(z) - u_shapeR * u_shapeBox; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);',
  'return (abs(z.x) + abs(z.y) + abs(z.z) - u_shapeR) * 0.57735027;',
  'return (max(max(-z.x - z.y - z.z, z.x + z.y - z.z), max(z.x - z.y + z.z, -z.x + z.y + z.z)) - u_shapeR) * 0.57735027;',
];
export function shapeFn(v) {
  const r = v.shapeR ?? 1, b = [v.shapeBX ?? 1, v.shapeBY ?? 1, v.shapeBZ ?? 1];
  switch (v.shape | 0) {
    case 1: return z => {
      const q = [Math.abs(z[0]) - r * b[0], Math.abs(z[1]) - r * b[1], Math.abs(z[2]) - r * b[2]];
      return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
    };
    case 2: return z => (Math.abs(z[0]) + Math.abs(z[1]) + Math.abs(z[2]) - r) * 0.57735027;
    case 3: return z => (Math.max(-z[0] - z[1] - z[2], z[0] + z[1] - z[2], z[0] - z[1] + z[2], -z[0] + z[1] + z[2]) - r) * 0.57735027;
    default: return z => Math.hypot(z[0], z[1], z[2]) - r;
  }
}

// ── Hybrid schedule ─────────────────────────────────────────────────────────
export const HYBRID_MODES = ['Off (Stack A only)', 'B every Nth iteration', 'A for N iterations, then B', 'Pattern'];
export const hybridPattern = v => Array.from({ length: 8 }, (_, k) => (v[`hybP${k + 1}`] ? 1 : 0));
export function hybridUsesB(v) {
  const mode = v.hybridMode | 0, N = Math.max(1, v.hybN | 0), L = Math.max(1, Math.min(8, v.hybLen | 0));
  const pat = hybridPattern(v);
  return i => mode === 1 ? i % N === N - 1 : mode === 2 ? i >= N : mode === 3 ? pat[i % L] === 1 : false;
}

// ── Symmetry-group presets ──────────────────────────────────────────────────
// Each sets Stack A to a fold sequence whose mirrors generate that point group
// (Schoenflies / Hermann–Mauguin), plus a centre and shape that suit it.
// Slots not listed are switched off.
export const SYMMETRY_GROUPS = [
  { name: 'Tetrahedral  Td (−43m) — Sierpinski', steps: [{ t: T.SIERP }], set: { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 3, shapeR: 1 } },
  { name: 'Octahedral  Oh (m−3m)', steps: [{ t: T.OCTA }], set: { scale: 2, centerX: 1, centerY: 0, centerZ: 0, shape: 2, shapeR: 1 } },
  { name: 'Cubic Menger  Oh + z-trick', steps: [{ t: T.OCTA }, { t: T.ZTRICK }], set: { scale: 3, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1 } },
  { name: 'Icosahedral  Ih (−5−3m)', steps: [{ t: T.ICOSA }], set: { scale: 2, centerX: 0, centerY: 0.525731, centerZ: 0.850651, shape: 0, shapeR: 1 } },
  { name: 'Orthorhombic  D2h (mmm)', steps: [{ t: T.ABS }], set: { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 1, shapeR: 1 } },
  { name: 'Tetragonal  D4h (4/mmm)', steps: [{ t: T.ABS }, { t: T.SWAP, swap: 1 }], set: { scale: 2, centerX: 1, centerY: 1, centerZ: 0.6, shape: 1, shapeR: 1 } },
  { name: 'Hexagonal prism  D6h (6/mmm)', steps: [{ t: T.ABS, abs: 6 }, { t: T.DIHEDRAL, ax: 2, n: 6 }], set: { scale: 2, centerX: 1, centerY: 0, centerZ: 0.8, shape: 0, shapeR: 0.6 } },
  { name: 'Trigonal prism  D3h (−6m2)', steps: [{ t: T.ABS, abs: 6 }, { t: T.DIHEDRAL, ax: 2, n: 3 }], set: { scale: 2, centerX: 1, centerY: 0, centerZ: 0.8, shape: 0, shapeR: 0.6 } },
  { name: 'Pentagonal prism  D5h', steps: [{ t: T.ABS, abs: 6 }, { t: T.DIHEDRAL, ax: 2, n: 5 }], set: { scale: 2, centerX: 1, centerY: 0, centerZ: 0.8, shape: 0, shapeR: 0.6 } },
  { name: 'Octahedral, edge-centred  Oh — cuboctahedral', steps: [{ t: T.OCTA }], set: { scale: 2, centerX: 1, centerY: 1, centerZ: 0, shape: 0, shapeR: 1 } },
  { name: 'Octahedral, vertex-centred  Oh — cubic', steps: [{ t: T.OCTA }], set: { scale: 2, centerX: 1, centerY: 1, centerZ: 1, shape: 2, shapeR: 1.5 } },
];

// Values for the full Stack A from a list of steps.
export function stackValues(s, steps) {
  const o = {};
  for (let k = 1; k <= STACKS[s].n; k++) {
    const st = steps[k - 1];
    o[sid(s, k, 't')] = st ? st.t : 0;
    if (st) for (const [f, val] of Object.entries(st)) if (f !== 't') o[sid(s, k, f)] = val;
  }
  return o;
}
