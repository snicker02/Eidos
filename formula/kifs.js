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
// Every step but one is a 1-Lipschitz map: a reflection across a plane, a
// conditional reflection (fold), a rotation, or a partial reflection with
// strength in [0, 1]. So the only stretch in an iteration is the final scale,
// the running derivative is exactly Π|s|, and shape(z) / dr is a true lower
// bound on the distance: Step Factor 1.0 never overshoots.
//
// The exceptions (ESTIMATE_TYPES) make the DE an estimate, not a bound:
//  • Sphere Inversion and the Kleinian step stretch space by R²/|z|², which
//    they track exactly in dr (conformal), as Mandelbulber does;
//  • the chiral folds and Cyclic N-Fold rotate instead of reflect. Each region
//    gets a rotation, so the map jumps across the seams between regions;
//  • N-Flake moves each region toward its nearest vertex, which also jumps at
//    the region boundaries.
//
// Smooth folds (Benesi): Abs, Plane Swaps, Sierpinski, Octahedral, Custom
// Plane and the mirror z-trick can round their creases. |t| becomes
// √(t² + k²) along each fold's normal, which still has slope ≤ 1, so the DE
// stays exact.
//
// Every step can be limited to an iteration range [From, Until).

export const STEP_NAMES = [
  'Off', 'Abs', 'Plane Swaps', 'Sierpinski (tetrahedral)', 'Octahedral Planes', 'Icosahedral Planes',
  'Custom Plane', 'Menger Z-Trick', 'Rotate', 'Edge Fold', 'Box Fold', 'Dihedral N-Fold', 'Sphere Inversion',
  'Tetrahedral Planes', 'Chiral Tetrahedral (T)', 'Chiral Octahedral (O)', 'Chiral Icosahedral (I)', 'Cyclic N-Fold', 'Kleinian (Knighty)',
  'Periodic Mirror Fold', 'N-Flake (nearest vertex)',
];
export const T = { OFF: 0, ABS: 1, SWAP: 2, SIERP: 3, OCTA: 4, ICOSA: 5, PLANE: 6, ZTRICK: 7, ROT: 8, EDGE: 9, BOX: 10, DIHEDRAL: 11, INV: 12,
  TETRA: 13, CHIR_T: 14, CHIR_O: 15, CHIR_I: 16, CYCLIC: 17, KLEIN: 18, PERIOD: 19, NFLAKE: 20 };
// Steps that make the DE an estimate (see above).
export const ESTIMATE_TYPES = [12, 14, 15, 16, 17, 18, 20];
// Steps with a Smooth option (compiled in; Softness is a uniform).
export const SMOOTH_TYPES = [1, 2, 3, 4, 6, 7];
export const ABS_MASKS = ['XYZ', 'XY', 'XZ', 'YZ', 'X', 'Y', 'Z'];
export const SWAP_MODES = ['Sort x ≥ y ≥ z', 'x ↔ y (if x < y)', 'x ↔ z (if x < z)', 'y ↔ z (if y < z)'];
export const ROT_PIVOTS = ['Origin', 'Centre'];
export const AXES = ['X', 'Y', 'Z'];
export const ZTRICK_MODES = ['Mirror (continuous)', 'Shift (Mandelbulber)'];
export const FLAKE_POLYS = ['Tetrahedron (4)', 'Octahedron (6)', 'Cube (8)', 'Icosahedron (12)', 'Dodecahedron (20)'];

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
  'Invert in a sphere: z → c + (z − c)·R²/|z − c|², blended by Amount, then shifted by A and scaled by S, for iterations From … Until. Not a fold: the DE becomes an estimate (derivative tracked, capped at DE Limit; 0 = uncapped). Lower Step Factor if you see holes.',
  'Reflect into one cell of the 24-element tetrahedral group Td (mirrors x = y, y = z, y = −z): full tetrahedral symmetry, ready for a Wythoff centre.',
  'Rotate (never mirror) into the domain of the 12 rotations of the tetrahedron: handed, twisted tetrahedral symmetry. The fold has seams, so the DE becomes an estimate.',
  'Rotate (never mirror) into the domain of the 24 rotations of the cube / octahedron: handed, snub-like symmetry. The fold has seams, so the DE becomes an estimate.',
  'Rotate (never mirror) into the domain of the 60 rotations of the icosahedron: handed, snub-dodecahedral symmetry. The fold has seams, so the DE becomes an estimate.',
  'Rotate (never mirror) into one of N sectors around an axis: N-fold cyclic symmetry, a pinwheel. The fold has seams, so the DE becomes an estimate.',
  "Knighty's pseudo-Kleinian step: box fold to ±L, invert in the sphere of radius R only inside it, then add C. Use with Scale 1 and the Kleinian shape. Not a fold: the DE becomes an estimate.",
  'A box fold that repeats: mirrors at every odd multiple of L on each axis (L = 0 leaves that axis alone), so space folds into the box ±L and the fractal tiles forever. On iteration 0 only (Until 1) it gives an infinite lattice of the fractal; on every iteration, a periodic sponge. Exact.',
  "Syntopia's n-flake IFS: each point moves toward its nearest vertex of the chosen polyhedron (at Vertex Distance), so the scale step shrinks a copy onto every vertex. Set the scale centre to 0. The nearest vertex jumps between regions, so the DE becomes an estimate.",
];

// Slot fields. Defaults are what a freshly enabled step starts with.
export const SLOT_FIELDS = ['t', 'abs', 'swap', 'zm', 'pv', 'ax', 'nx', 'ny', 'nz', 'd', 'k', 'ra', 'rb', 'rg', 'lx', 'ly', 'lz', 'n',
  'icx', 'icy', 'icz', 'ir', 'ia', 'il', 'iax', 'iay', 'iaz', 'is', 'kr', 'kcx', 'kcy', 'kcz', 'sm', 'sk', 'fp', 'fr', 'if', 'iu', 'cw'];
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
const OPT_FIELD = { 1: 'abs', 2: 'swap', 7: 'zm', 8: 'pv', 11: 'ax', 17: 'ax', 20: 'fp' };
// Smooth applies to the mirror z-trick only (the shift form is a jump).
const smoothOn = (t, o, v) => SMOOTH_TYPES.includes(t) && !(t === T.ZTRICK && o === 1) && !!v;

// Active slots of stack s ('a' | 'b'), stopping at the first Off (later slots
// are hidden in the panel, so they never count). [{ k, t, o, sm }]
export function stackOf(v, s) {
  const out = [];
  for (let k = 1; k <= STACKS[s].n; k++) {
    const t = v[sid(s, k, 't')] | 0;
    if (!t) break;
    const of = OPT_FIELD[t];
    const o = of ? (v[sid(s, k, of)] | 0) : 0;
    out.push({ k, t, o, sm: smoothOn(t, o, v[sid(s, k, 'sm')]) ? 1 : 0 });
  }
  return out;
}

export const stackKey = slots => slots.map(x => x.t.toString(36) + (x.o ? x.o : '') + (x.sm ? 's' : '')).join('.');

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
//   r: vec4 (Sphere Inversion: shift A, post-scale S)
//   it: vec2 (Sphere Inversion: iteration range [from, until))
export function slotData(v, s, slot) {
  const g = f => v[sid(s, slot.k, f)];
  const q = [1, 0, 0, g('cw') ?? 1];
  let p = null, m = null, r = null;
  const it = [g('if') ?? 0, g('iu') ?? 250];
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
    case T.INV:
      p = [g('icx') ?? 0, g('icy') ?? 0, g('icz') ?? 0, Math.max(1e-4, g('ir') ?? 1)];
      q[0] = Math.max(0, Math.min(1, g('ia') ?? 1));
      q[1] = Math.max(0, g('il') ?? 10);
      r = [g('iax') ?? 0, g('iay') ?? 0, g('iaz') ?? 0, g('is') ?? 1];
      break;
    case T.CYCLIC: p = [Math.max(1, Math.round(g('n') ?? 6)), 0, 0, 0]; break;
    case T.KLEIN:
      p = [g('lx') ?? 1, g('ly') ?? 1, g('lz') ?? 1, Math.max(1e-4, g('kr') ?? 1)];
      r = [g('kcx') ?? 0, g('kcy') ?? 0, g('kcz') ?? 0, 0];
      break;
    case T.PERIOD: p = [Math.max(0, g('lx') ?? 1), Math.max(0, g('ly') ?? 1), Math.max(0, g('lz') ?? 1), 0]; break;
    case T.NFLAKE: p = [g('fr') ?? 1, 0, 0, 0]; break;
    default: break;
  }
  // Smooth folds: Softness k in q.y (Sphere Inversion uses q.y for its limit).
  if (SMOOTH_TYPES.includes(slot.t)) q[1] = Math.max(0, g('sk') ?? 0.05);
  return { p, q, m, r, it };
}

// N-flake vertex sets (unit vectors), in a fixed order: the vertex index is
// the step's colour count.
const nrm3 = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const signs = n => Array.from({ length: 1 << n }, (_, i) => Array.from({ length: n }, (_, b) => ((i >> b) & 1 ? -1 : 1)));
const IPHI = 1 / PHI;
export const FLAKE_VERTS = [
  [[1, 1, 1], [-1, -1, 1], [1, -1, -1], [-1, 1, -1]].map(nrm3),
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  signs(3).map(nrm3),
  signs(2).flatMap(([a, b]) => [[0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]]).map(nrm3),
  [...signs(3), ...signs(2).flatMap(([a, b]) => [[0, a * IPHI, b * PHI], [a * IPHI, b * PHI, 0], [b * PHI, 0, a * IPHI]])].map(nrm3),
];

const needsP = t => t === T.PLANE || t === T.EDGE || t === T.BOX || t === T.DIHEDRAL || t === T.INV || t === T.CYCLIC || t === T.KLEIN || t === T.PERIOD || t === T.NFLAKE;
const needsR = t => t === T.INV || t === T.KLEIN;

// ── GLSL emission ────────────────────────────────────────────────────────────
// Each step body works on `z` with `h` (reflections counted for fold colouring),
// and may read P (vec4), Q (vec4), M (mat3), R (vec4), I (vec2), s (this
// iteration's scale), c (its centre) and it (the iteration index); only Sphere
// Inversion writes `dr`. Names are substituted per slot.
// Smooth forms (sm = 1, Softness k = Q.y), after Benesi's MengerSmooth:
//   abs:   t → √(t² + k²)
//   swap:  (a, b) → sorted with a − b = √((a − b)² + k²), a + b kept
//   mirror across a plane: the normal coordinate t → √(t² + k²)
// each with slope ≤ 1 along the fold normal and 1 across it.
const SWAP_PAIRS = [[0, 1, 'x', 'y'], [0, 2, 'x', 'z'], [1, 2, 'y', 'z']];
function glslBody(t, o, sm = 0) {
  switch (t) {
    case T.ABS: return ABS_MASKS[o].toLowerCase().split('').map(a => sm
      ? `if (z.${a} < 0.0) h += 1.0; z.${a} = sqrt(z.${a} * z.${a} + Q.y * Q.y);`
      : `if (z.${a} < 0.0) { z.${a} = -z.${a}; h += 1.0; }`).join('\n    ');
    case T.SWAP: return SWAP_PAIRS.filter((_, i) => o === 0 || o === i + 1).map(([, , a, b]) => sm
      ? `{ float st = z.${a} - z.${b}; if (st < 0.0) h += 1.0; float sm = 0.5 * (st - sqrt(st * st + Q.y * Q.y)); z.${a} -= sm; z.${b} += sm; }`
      : `if (z.${a} < z.${b}) { z.${a}${b} = z.${b}${a}; h += 1.0; }`).join('\n    ');
    case T.SIERP: return sm
      ? SWAP_PAIRS.map(([, , a, b]) => `{ float st = z.${a} + z.${b}; if (st < 0.0) h += 1.0; float sm = 0.5 * (sqrt(st * st + Q.y * Q.y) - st); z.${a} += sm; z.${b} += sm; }`).join('\n    ')
      : `if (z.x + z.y < 0.0) { z.xy = -z.yx; h += 1.0; }
    if (z.x + z.z < 0.0) { z.xz = -z.zx; h += 1.0; }
    if (z.y + z.z < 0.0) { z.yz = -z.zy; h += 1.0; }`;
    case T.OCTA: return glslBody(T.ABS, 0, sm) + '\n    ' + glslBody(T.SWAP, 0, sm);
    case T.ICOSA: return `for (int ip = 0; ip < ${ICO_PASSES}; ip++) {
      if (z.x < 0.0) { z.x = -z.x; h += 1.0; }
      if (z.y < 0.0) { z.y = -z.y; h += 1.0; }
      float ti = dot(z, ICO_N); if (ti < 0.0) { z -= 2.0 * ti * ICO_N; h += 1.0; }
    }`;
    case T.PLANE: return sm
      ? 'float tp = dot(z, P.xyz) - P.w; if (tp < 0.0) h += 1.0; z += (Q.x * (sqrt(tp * tp + Q.y * Q.y) - tp)) * P.xyz;'
      : 'float tp = dot(z, P.xyz) - P.w; if (tp < 0.0) { z -= (2.0 * Q.x * tp) * P.xyz; h += 1.0; }';
    case T.ZTRICK: return o === 1
      ? 'if (s * z.z <= 0.5 * c.z * (s - 1.0)) { z.z += c.z * (s - 1.0) / sNZ(s); h += 1.0; }'
      : sm
        ? 'float hz = 0.5 * c.z * (s - 1.0) / sNZ(s); float dz = z.z - hz; if (s * dz < 0.0) h += 1.0; z.z = hz + (s < 0.0 ? -1.0 : 1.0) * sqrt(dz * dz + Q.y * Q.y);'
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
    case T.INV: return `vec3 dz = z - P.xyz;
    float r2 = max(dot(dz, dz), 1e-6);
    float f = P.w * P.w / r2;
    if (r2 < P.w * P.w) h += 1.0;
    z = mix(z, P.xyz + dz * f, Q.x);
    dr *= mix(1.0, Q.y > 0.0 ? min(f, Q.y) : f, Q.x);
    z = (z + R.xyz) * R.w;
    dr *= abs(R.w);`;
    case T.TETRA: return `for (int ip = 0; ip < 4; ip++) {
      if (z.x < z.y) { z.xy = z.yx; h += 1.0; }
      if (z.y < z.z) { z.yz = z.zy; h += 1.0; }
      if (z.y + z.z < 0.0) { z.yz = -z.zy; h += 1.0; }
    }`;
    // Chiral: the mirror fold, then one more reflection across a face of the
    // cell when the reflection count is odd, so the net map is a rotation.
    case T.CHIR_T: return glslBody(T.TETRA, 0) + '\n    if (mod(h, 2.0) > 0.5) z.yz = -z.zy;';
    case T.CHIR_O: return glslBody(T.OCTA, 0) + '\n    if (mod(h, 2.0) > 0.5) z.z = -z.z;';
    case T.CHIR_I: return glslBody(T.ICOSA, 0) + '\n    if (mod(h, 2.0) > 0.5) z.x = -z.x;';
    case T.CYCLIC: {
      const sw = ['yz', 'zx', 'xy'][o];
      return `vec2 cw2 = z.${sw}; float csec = 6.28318531 / P.x; float ca0 = atan(cw2.y, cw2.x);
    float ck = floor(ca0 / csec); if (ck != 0.0) h += 1.0;
    float ca1 = ca0 - ck * csec;
    z.${sw} = length(cw2) * vec2(cos(ca1), sin(ca1));`;
    }
    case T.KLEIN: return ['x', 'y', 'z'].map(a => `if (z.${a} > P.${a}) { z.${a} = 2.0 * P.${a} - z.${a}; h += 1.0; } else if (z.${a} < -P.${a}) { z.${a} = -2.0 * P.${a} - z.${a}; h += 1.0; }`).join('\n    ')
      + `
    float kr2 = max(dot(z, z), 1e-12);
    float kk = max(P.w * P.w / kr2, 1.0);
    if (kk > 1.0) h += 1.0;
    z *= kk; dr *= kk;
    z += R.xyz;`;
    // Mirrors at ±L, ±3L, ±5L …: a triangle wave with slope ±1, the identity
    // on [−L, L].
    case T.PERIOD: return ['x', 'y', 'z'].map(a => `if (P.${a} > 0.0) { if (abs(z.${a}) > P.${a}) h += 1.0; z.${a} = abs(mod(z.${a} - P.${a}, 4.0 * P.${a}) - 2.0 * P.${a}) - P.${a}; }`).join('\n    ');
    // Nearest vertex V = R·v (largest dot product, all |v| = 1), then shift so
    // the scale step gives s·(z − V) + V.
    case T.NFLAKE: {
      const V = FLAKE_VERTS[o] || FLAKE_VERTS[0];
      const lit = v => `vec3(${v.map(x => x.toFixed(10)).join(', ')})`;
      return [`vec3 fv = ${lit(V[0])}; float fd = dot(z, fv); float fi = 0.0;`,
        ...V.slice(1).map((v, i) => `{ float fe = dot(z, ${lit(v)}); if (fe > fd) { fd = fe; fv = ${lit(v)}; fi = ${(i + 1).toFixed(1)}; } }`),
        'h += fi;',
        'z -= (1.0 - 1.0 / sNZ(s)) * (P.x * fv - c);'].join('\n    ');
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
    decl.push(`uniform vec4 ${n}q;`, `uniform vec2 ${n}i;`);
    if (needsP(sl.t)) decl.push(`uniform vec4 ${n}p;`);
    if (sl.t === T.ROT) decl.push(`uniform mat3 ${n}m;`);
    if (needsR(sl.t)) decl.push(`uniform vec4 ${n}r;`);
    traps.push(`g_t${s}${sl.k}`);
    const code = glslBody(sl.t, sl.o, sl.sm)
      .replace(/\bP\./g, `${n}p.`).replace(/\bQ\./g, `${n}q.`).replace(/\bM \*/g, `${n}m *`)
      .replace(/\bR\./g, `${n}r.`).replace(/\bI\./g, `${n}i.`);
    body.push(`  if (fit >= ${n}i.x && fit < ${n}i.y) { // ${s}${sl.k}: ${STEP_NAMES[sl.t]}${sl.sm ? ' (smooth)' : ''}
    float h = 0.0;
    ${code}
    stepHit(h, ${n}q.w);
    g_t${s}${sl.k} = min(g_t${s}${sl.k}, dot(z, z));
  }`);
  }
  return {
    decl: decl.join('\n') + (traps.length ? `\nfloat ${traps.join(', ')};` : ''),
    fn: `vec3 stack${S}(vec3 z, float s, vec3 c, int it, inout float dr) {\n  float fit = float(it);\n${body.join('\n')}\n  return z;\n}`,
    reset: traps.map(t => `${t} = 1e10;`).join(' '),
    sum: traps.map((t, i) => `(${t} < 1e9 ? u_${s}${slots[i].k}q.w * ${t} : 0.0)`).join(' + ') || '0.0',
  };
}

// ── CPU port (mirrors glslBody line for line) ───────────────────────────────
const sNZ = s => (Math.abs(s) < 1e-6 ? (s < 0 ? -1e-6 : 1e-6) : s);
const fmodG = (x, y) => x - y * Math.floor(x / y); // GLSL mod()

function cpuStep(t, o, z, D, s, c, it = 0, sm = 0) {
  let h = 0, k = 1; // k: derivative factor (Sphere Inversion only)
  const [x0, y0, w0] = z;
  let x = x0, y = y0, w = w0;
  const kk2 = sm ? D.q[1] * D.q[1] : 0;
  switch (t) {
    case T.ABS: {
      const m = ABS_MASKS[o];
      if (sm) {
        const v = [x, y, w];
        for (let i = 0; i < 3; i++) if (m.includes('XYZ'[i])) { if (v[i] < 0) h++; v[i] = Math.sqrt(v[i] * v[i] + kk2); }
        [x, y, w] = v;
        break;
      }
      if (m.includes('X') && x < 0) { x = -x; h++; }
      if (m.includes('Y') && y < 0) { y = -y; h++; }
      if (m.includes('Z') && w < 0) { w = -w; h++; }
      break;
    }
    case T.SWAP: {
      if (sm) {
        const v = [x, y, w];
        SWAP_PAIRS.forEach(([i, j], n) => {
          if (!(o === 0 || o === n + 1)) return;
          const st = v[i] - v[j]; if (st < 0) h++;
          const q = 0.5 * (st - Math.sqrt(st * st + kk2)); v[i] -= q; v[j] += q;
        });
        [x, y, w] = v;
        break;
      }
      if ((o === 0 || o === 1) && x < y) { [x, y] = [y, x]; h++; }
      if ((o === 0 || o === 2) && x < w) { [x, w] = [w, x]; h++; }
      if ((o === 0 || o === 3) && y < w) { [y, w] = [w, y]; h++; }
      break;
    }
    case T.SIERP: {
      if (sm) {
        const v = [x, y, w];
        for (const [i, j] of SWAP_PAIRS) {
          const st = v[i] + v[j]; if (st < 0) h++;
          const q = 0.5 * (Math.sqrt(st * st + kk2) - st); v[i] += q; v[j] += q;
        }
        [x, y, w] = v;
        break;
      }
      if (x + y < 0) { [x, y] = [-y, -x]; h++; }
      if (x + w < 0) { [x, w] = [-w, -x]; h++; }
      if (y + w < 0) { [y, w] = [-w, -y]; h++; }
      break;
    }
    case T.OCTA: {
      const a = cpuStep(T.ABS, 0, z, D, s, c, it, sm), b = cpuStep(T.SWAP, 0, a.z, D, s, c, it, sm);
      return { z: b.z, h: a.h + b.h, k: 1 };
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
      if (sm) {
        if (tp < 0) h++;
        const f = D.q[0] * (Math.sqrt(tp * tp + kk2) - tp); x += f * P[0]; y += f * P[1]; w += f * P[2];
      } else if (tp < 0) { const f = 2 * D.q[0] * tp; x -= f * P[0]; y -= f * P[1]; w -= f * P[2]; h++; }
      break;
    }
    case T.ZTRICK: {
      if (o === 1) { if (s * w <= 0.5 * c[2] * (s - 1)) { w += c[2] * (s - 1) / sNZ(s); h++; } }
      else {
        const hz = 0.5 * c[2] * (s - 1) / sNZ(s), dz = w - hz;
        if (sm) { if (s * dz < 0) h++; w = hz + (s < 0 ? -1 : 1) * Math.sqrt(dz * dz + kk2); }
        else if (s * dz < 0) { w = hz - dz; h++; }
      }
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
    case T.INV: {
      const P = D.p, a = D.q[0], L = D.q[1], R = D.r;
      const d0 = x - P[0], d1 = y - P[1], d2 = w - P[2];
      const r2 = Math.max(d0 * d0 + d1 * d1 + d2 * d2, 1e-6);
      const f = P[3] * P[3] / r2;
      if (r2 < P[3] * P[3]) h++;
      x += (P[0] + d0 * f - x) * a; y += (P[1] + d1 * f - y) * a; w += (P[2] + d2 * f - w) * a;
      k = 1 + ((L > 0 ? Math.min(f, L) : f) - 1) * a;
      x = (x + R[0]) * R[3]; y = (y + R[1]) * R[3]; w = (w + R[2]) * R[3];
      k *= Math.abs(R[3]);
      break;
    }
    case T.TETRA: {
      for (let ip = 0; ip < 4; ip++) {
        if (x < y) { [x, y] = [y, x]; h++; }
        if (y < w) { [y, w] = [w, y]; h++; }
        if (y + w < 0) { [y, w] = [-w, -y]; h++; }
      }
      break;
    }
    case T.CHIR_T: case T.CHIR_O: case T.CHIR_I: {
      const base = { [T.CHIR_T]: T.TETRA, [T.CHIR_O]: T.OCTA, [T.CHIR_I]: T.ICOSA }[t];
      const r = cpuStep(base, 0, z, D, s, c);
      let [a, b, e] = r.z;
      if (r.h % 2 === 1) {
        if (t === T.CHIR_T) [b, e] = [-e, -b];
        else if (t === T.CHIR_O) e = -e;
        else a = -a;
      }
      return { z: [a, b, e], h: r.h, k: 1 };
    }
    case T.CYCLIC: {
      const sec = 2 * Math.PI / D.p[0];
      const idx = [[1, 2], [2, 0], [0, 1]][o];
      const v = [x, y, w];
      const u0 = v[idx[0]], u1 = v[idx[1]];
      const a0 = Math.atan2(u1, u0), ck = Math.floor(a0 / sec);
      if (ck !== 0) h++;
      const a1 = a0 - ck * sec, rr = Math.hypot(u0, u1);
      v[idx[0]] = rr * Math.cos(a1); v[idx[1]] = rr * Math.sin(a1);
      [x, y, w] = v;
      break;
    }
    case T.KLEIN: {
      const P = D.p, f = (a, l) => { if (a > l) { h++; return 2 * l - a; } if (a < -l) { h++; return -2 * l - a; } return a; };
      x = f(x, P[0]); y = f(y, P[1]); w = f(w, P[2]);
      const r2 = Math.max(x * x + y * y + w * w, 1e-12);
      const kk = Math.max(P[3] * P[3] / r2, 1);
      if (kk > 1) h++;
      x *= kk; y *= kk; w *= kk; k = kk;
      x += D.r[0]; y += D.r[1]; w += D.r[2];
      break;
    }
    case T.PERIOD: {
      const tri = (a, L) => { if (!(L > 0)) return a; if (Math.abs(a) > L) h++; return Math.abs(fmodG(a - L, 4 * L) - 2 * L) - L; };
      x = tri(x, D.p[0]); y = tri(y, D.p[1]); w = tri(w, D.p[2]);
      break;
    }
    case T.NFLAKE: {
      const V = FLAKE_VERTS[o] || FLAKE_VERTS[0];
      let bi = 0, bd = x * V[0][0] + y * V[0][1] + w * V[0][2];
      for (let i = 1; i < V.length; i++) { const e = x * V[i][0] + y * V[i][1] + w * V[i][2]; if (e > bd) { bd = e; bi = i; } }
      h += bi;
      const f = 1 - 1 / sNZ(s), R = D.p[0];
      x -= f * (R * V[bi][0] - c[0]); y -= f * (R * V[bi][1] - c[1]); w -= f * (R * V[bi][2] - c[2]);
      break;
    }
    default: break;
  }
  return { z: [x, y, w], h, k };
}

// Returns (z, s, c, acc, it) => z for a compiled stack. acc: { fold, colOn,
// traps, w, dr } — dr is multiplied by any Sphere Inversion's factor.
export function cpuStack(v, s, slots) {
  const data = slots.map(sl => slotData(v, s, sl));
  return (z, sc, c, acc, it = 0) => {
    for (let i = 0; i < slots.length; i++) {
      if (!(it >= data[i].it[0] && it < data[i].it[1])) continue;
      const r = cpuStep(slots[i].t, slots[i].o, z, data[i], sc, c, it, slots[i].sm | 0);
      z = r.z;
      if (r.k !== 1) acc.dr = (acc.dr ?? 1) * r.k;
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
// Shapes 0–8 keep the DE a bound: exact distances (sphere, box, shell, box
// frame, axis cross, torus, capsule) or plane-distance lower bounds
// (octahedron, tetrahedron). Kleinian is Knighty's heuristic: an estimate.
// Shape 10, Square Cross, is three infinite square tubes (exact distance), the
// carving tool of the Menger sponge. Shapes 11–13 are Knighty's fold-and-cut
// uniform polyhedra (POLY below).
export const SHAPES = ['Sphere', 'Box', 'Octahedron', 'Tetrahedron', 'Shell', 'Box Frame', 'Axis Cross', 'Torus', 'Capsule', 'Kleinian (Knighty)',
  'Square Cross', 'Polyhedron · Tetrahedral (Td)', 'Polyhedron · Octahedral (Oh)', 'Polyhedron · Icosahedral (Ih)'];
export const ESTIMATE_SHAPES = [9];
export const POLY_SHAPES = [11, 12, 13];
// Torus / capsule axis: swizzle so the chosen axis is a.z.
const AXIS_SWZ = 'vec3 a = u_shapeAx == 0 ? z.yzx : u_shapeAx == 1 ? z.zxy : z;';
export const SHAPE_GLSL = [
  'return length(z) - u_shapeR;',
  'vec3 q = abs(z) - u_shapeR * u_shapeBox; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);',
  'return (abs(z.x) + abs(z.y) + abs(z.z) - u_shapeR) * 0.57735027;',
  'return (max(max(-z.x - z.y - z.z, z.x + z.y - z.z), max(z.x - z.y + z.z, -z.x + z.y + z.z)) - u_shapeR) * 0.57735027;',
  'return abs(length(z) - u_shapeR) - u_shapeT;',
  // Box frame (Inigo Quilez): the twelve edges of the box, thickness T.
  `vec3 pb = abs(z) - u_shapeR * u_shapeBox; vec3 qb = abs(pb + u_shapeT) - u_shapeT;
  return min(min(length(max(vec3(pb.x, qb.y, qb.z), 0.0)) + min(max(pb.x, max(qb.y, qb.z)), 0.0),
                 length(max(vec3(qb.x, pb.y, qb.z), 0.0)) + min(max(qb.x, max(pb.y, qb.z)), 0.0)),
                 length(max(vec3(qb.x, qb.y, pb.z), 0.0)) + min(max(qb.x, max(qb.y, pb.z)), 0.0));`,
  // Axis cross: three capsules from −R to R along x, y, z, radius T.
  `vec3 aa = abs(z);
  float dx = length(vec3(max(aa.x - u_shapeR, 0.0), aa.y, aa.z));
  float dy = length(vec3(aa.x, max(aa.y - u_shapeR, 0.0), aa.z));
  float dz = length(vec3(aa.x, aa.y, max(aa.z - u_shapeR, 0.0)));
  return min(dx, min(dy, dz)) - u_shapeT;`,
  `${AXIS_SWZ} return length(vec2(length(a.xy) - u_shapeR, a.z)) - u_shapeT;`,
  `${AXIS_SWZ} a.z -= clamp(a.z, -u_shapeR, u_shapeR); return length(a) - u_shapeT;`,
  'float rxy = length(z.xy); return max(rxy - u_shapeT, abs(rxy * z.z) / max(length(z), 1e-12));',
  `vec3 sa = abs(z) - u_shapeR;
  return min(min(length(max(sa.xy, 0.0)) + min(max(sa.x, sa.y), 0.0), length(max(sa.yz, 0.0)) + min(max(sa.y, sa.z), 0.0)),
             length(max(sa.zx, 0.0)) + min(max(sa.z, sa.x), 0.0));`,
  'return polyDE0(z, u_shapeR);',
  'return polyDE1(z, u_shapeR);',
  'return polyDE2(z, u_shapeR);',
];
export function shapeFn(v) {
  const r = v.shapeR ?? 1, b = [v.shapeBX ?? 1, v.shapeBY ?? 1, v.shapeBZ ?? 1], t = v.shapeT ?? 0.1;
  const ax = v.shapeAx ?? 2;
  const swz = z => (ax === 0 ? [z[1], z[2], z[0]] : ax === 1 ? [z[2], z[0], z[1]] : z);
  const len = (a, b2, c) => Math.hypot(a, b2, c);
  switch (v.shape | 0) {
    case 1: return z => {
      const q = [Math.abs(z[0]) - r * b[0], Math.abs(z[1]) - r * b[1], Math.abs(z[2]) - r * b[2]];
      return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
    };
    case 2: return z => (Math.abs(z[0]) + Math.abs(z[1]) + Math.abs(z[2]) - r) * 0.57735027;
    case 3: return z => (Math.max(-z[0] - z[1] - z[2], z[0] + z[1] - z[2], z[0] - z[1] + z[2], -z[0] + z[1] + z[2]) - r) * 0.57735027;
    case 4: return z => Math.abs(Math.hypot(z[0], z[1], z[2]) - r) - t;
    case 5: return z => {
      const pb = [0, 1, 2].map(i => Math.abs(z[i]) - r * b[i]), qb = pb.map(x => Math.abs(x + t) - t);
      const e = (a2, b2, c2) => len(Math.max(a2, 0), Math.max(b2, 0), Math.max(c2, 0)) + Math.min(Math.max(a2, b2, c2), 0);
      return Math.min(e(pb[0], qb[1], qb[2]), e(qb[0], pb[1], qb[2]), e(qb[0], qb[1], pb[2]));
    };
    case 6: return z => {
      const a = z.map(Math.abs);
      return Math.min(len(Math.max(a[0] - r, 0), a[1], a[2]), len(a[0], Math.max(a[1] - r, 0), a[2]), len(a[0], a[1], Math.max(a[2] - r, 0))) - t;
    };
    case 7: return z => { const a = swz(z); return Math.hypot(Math.hypot(a[0], a[1]) - r, a[2]) - t; };
    case 8: return z => { const a = swz(z); return len(a[0], a[1], a[2] - Math.max(-r, Math.min(r, a[2]))) - t; };
    case 9: return z => { const rxy = Math.hypot(z[0], z[1]); return Math.max(rxy - t, Math.abs(rxy * z[2]) / Math.max(Math.hypot(z[0], z[1], z[2]), 1e-12)); };
    case 10: return z => {
      const a = z.map(x => Math.abs(x) - r);
      const b2 = (p, q) => Math.hypot(Math.max(p, 0), Math.max(q, 0)) + Math.min(Math.max(p, q), 0);
      return Math.min(b2(a[0], a[1]), b2(a[1], a[2]), b2(a[2], a[0]));
    };
    case 11: case 12: case 13: return polyFn(v, (v.shape | 0) - 11, r);
    default: return z => Math.hypot(z[0], z[1], z[2]) - r;
  }
}

// ── Wythoff centre ──────────────────────────────────────────────────────────
// The scale centre placed by weights on the corners of one mirror cell, for
// the Tetrahedral Planes (Td), Octahedral Planes (Oh) and Icosahedral Planes
// (Ih) folds (and their chiral versions). On a corner → a vertex-type copy
// layout; on an edge or inside → truncated, cantellated, omnitruncated forms.
const nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
export const WYTHOFF = [
  { name: 'Tetrahedral (Td)', corners: [nrm([1, 1, 1]), nrm([1, 1, -1]), [1, 0, 0]], labels: ['3-fold A (1,1,1)', '3-fold B (1,1,−1)', '2-fold (1,0,0)'] },
  { name: 'Octahedral (Oh)', corners: [[1, 0, 0], nrm([1, 1, 0]), nrm([1, 1, 1])], labels: ['4-fold (1,0,0)', '2-fold (1,1,0)', '3-fold (1,1,1)'] },
  { name: 'Icosahedral (Ih)', corners: [nrm([0, 1, PHI]), [0, 0, 1], nrm([PHI, 0, 2 * PHI + 1])], labels: ['5-fold (0,1,φ)', '2-fold (0,0,1)', '3-fold (φ,0,2φ+1)'] },
];
export const CENTER_MODES = ['Manual', 'Wythoff (cell corners)'];

// ── Fold-and-cut polyhedra (after Knighty) ──────────────────────────────────
// Fold into one mirror cell of Td / Oh / Ih (the same cells as the Wythoff
// centre). The vertex is the Wythoff point P = R·normalize(Σ wᵢ cornerᵢ), so
// the three weights choose which uniform polyhedron appears. Parts:
//   faces    — planes through P with the cell's corner directions as normals;
//              the max of the three is a lower bound (each face type can be off)
//   edges    — segments from P perpendicular to each mirror: exact
//   vertices — a ball at P: exact
// For two points in the same mirror cell the nearest copy of one is the other
// itself, so these in-cell distances are distances to the whole polyhedron.
export const POLY = [
  { fold: T.TETRA, mirrors: [nrm([1, -1, 0]), nrm([0, 1, -1]), nrm([0, 1, 1])] },
  { fold: T.OCTA, mirrors: [nrm([1, -1, 0]), nrm([0, 1, -1]), [0, 0, 1]] },
  { fold: T.ICOSA, mirrors: [[1, 0, 0], [0, 1, 0], ICO_N] },
];
export const POLY_PARTS = ['Face A', 'Face B', 'Face C', 'Edges', 'Vertices'];
// Unit vertex direction of group g's polyhedron (own weights, or the Wythoff
// centre's when Link is on).
export function polyDir(v, g) {
  const link = !!v.polyLink;
  const w = link ? [v.wyA ?? 1, v.wyB ?? 0, v.wyC ?? 0] : [v.polyA ?? 1, v.polyB ?? 1, v.polyC ?? 0];
  const C = WYTHOFF[g].corners;
  const d = [0, 1, 2].map(i => C.reduce((a, cc, k) => a + Math.max(0, w[k]) * cc[i], 0));
  const l = Math.hypot(...d);
  return l > 1e-12 ? d.map(x => x / l) : C[0];
}
const polyFaces = v => [v.polyF1 ?? true, v.polyF2 ?? true, v.polyF3 ?? true].map(b => (b ? 1 : 0));
const polyEV = v => [v.polyE ? 1 : 0, v.polyV ? 1 : 0, Math.max(0, v.polyER ?? 0.03), Math.max(0, v.polyVR ?? 0.08)];
// CPU distance; the returned function's .part is the nearest part of the last call.
export function polyFn(v, g, R) {
  const dir = polyDir(v, g), F = polyFaces(v), EV = polyEV(v), C = WYTHOFF[g].corners, N = POLY[g].mirrors;
  const D = { q: [1, 0, 0, 1] };
  const f = z => {
    const fz = cpuStep(POLY[g].fold, 0, z, D, 2, [0, 0, 0]).z;
    const q = [fz[0] - R * dir[0], fz[1] - R * dir[1], fz[2] - R * dir[2]];
    const dt = n => q[0] * n[0] + q[1] * n[1] + q[2] * n[2];
    let d = 1e10, part = 0, fc = -1e10, fp = 0;
    for (let i = 0; i < 3; i++) if (F[i]) { const t = dt(C[i]); if (t > fc) { fc = t; fp = i; } }
    if (fc > -1e9) { d = fc; part = fp; }
    if (EV[0]) {
      const e = Math.min(...N.map(n => { const m = Math.min(0, dt(n)); return Math.hypot(q[0] - m * n[0], q[1] - m * n[1], q[2] - m * n[2]); })) - EV[2];
      if (e < d) { d = e; part = 3; }
    }
    if (EV[1]) { const e = Math.hypot(...q) - EV[3]; if (e < d) { d = e; part = 4; } }
    f.part = part;
    return d;
  };
  f.part = 0;
  return f;
}
const vec3Lit = v => `vec3(${v.map(x => x.toFixed(10)).join(', ')})`;
export function polyGLSL(g) {
  const C = WYTHOFF[g].corners.map(vec3Lit), N = POLY[g].mirrors.map(vec3Lit);
  const fold = glslBody(POLY[g].fold, 0);
  const edge = n => `length(q - min(0.0, dot(q, ${n})) * ${n})`;
  return `
// Fold-and-cut polyhedron, ${WYTHOFF[g].name} cell (after Knighty).
float polyDE${g}(vec3 z, float R) {
  float h = 0.0;
  ${fold}
  vec3 q = z - R * u_polyDir${g};
  float d = 1e10, part = 0.0, fc = -1e10, fp = 0.0;
  if (u_polyFace.x > 0.5) { fc = dot(q, ${C[0]}); }
  if (u_polyFace.y > 0.5) { float t = dot(q, ${C[1]}); if (t > fc) { fc = t; fp = 1.0; } }
  if (u_polyFace.z > 0.5) { float t = dot(q, ${C[2]}); if (t > fc) { fc = t; fp = 2.0; } }
  if (fc > -1e9) { d = fc; part = fp; }
  if (u_polyEV.x > 0.5) {
    float e = min(min(${edge(N[0])}, ${edge(N[1])}), ${edge(N[2])}) - u_polyEV.z;
    if (e < d) { d = e; part = 3.0; }
  }
  if (u_polyEV.y > 0.5) { float e = length(q) - u_polyEV.w; if (e < d) { d = e; part = 4.0; } }
  g_polyPart = part;
  return d;
}`;
}
export const polyUniforms = v => ({
  u_polyDir0: polyDir(v, 0), u_polyDir1: polyDir(v, 1), u_polyDir2: polyDir(v, 2),
  u_polyFace: polyFaces(v), u_polyEV: polyEV(v),
});

// ── Shapes at every level ───────────────────────────────────────────────────
// A second shape, evaluated in each iteration i in [From, Until) after its
// folds and before its scale (level i: the folded frame, its distance divided
// by that level's dr), as in Knighty's iterated polyhedra and NewMenger, and
// combined with the final shape. Union and intersection of 1-Lipschitz lower
// bounds are 1-Lipschitz lower bounds; so is carving (max(d, −dᵢ)), since
// |dᵢ| never exceeds the distance to that shape's boundary; and the polynomial
// smooth union (its gradient is a convex blend of the two). So the DE stays exact.
export const LEVEL_MODES = ['Off', 'Union (add at every level)', 'Smooth Union', 'Carve (subtract at every level)', 'Intersect'];
export const levelShapeValues = v => ({ ...v, shape: v.lvShape | 0, shapeR: v.lvR ?? 0.5, shapeT: v.lvT ?? 0.05, shapeAx: v.lvAx ?? 2,
  shapeBX: v.lvBX ?? 1, shapeBY: v.lvBY ?? 1, shapeBZ: v.lvBZ ?? 1 });
// Polynomial smooth min (Inigo Quilez); k ≤ 0 → min.
export function smin(a, b, k) {
  if (!(k > 0)) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
}
// Effective Stack A centre for the current values.
export function stackCenter(v) {
  if ((v.ctrMode | 0) !== 1) return [v.centerX, v.centerY, v.centerZ];
  const g = WYTHOFF[v.wyGroup | 0] || WYTHOFF[1];
  const w = [Math.max(0, v.wyA ?? 1), Math.max(0, v.wyB ?? 0), Math.max(0, v.wyC ?? 0)];
  let c = [0, 1, 2].map(i => w[0] * g.corners[0][i] + w[1] * g.corners[1][i] + w[2] * g.corners[2][i]);
  const l = Math.hypot(...c);
  c = l > 1e-12 ? c.map(x => x / l) : g.corners[0];
  const R = v.wyR ?? 1;
  return c.map(x => x * R);
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
  { name: 'Tetrahedral  Td — full mirror cell', steps: [{ t: T.TETRA }], set: { scale: 2, centerX: 1, centerY: 0.4, centerZ: 0, shape: 0, shapeR: 0.9 } },
  { name: 'Chiral tetrahedral  T (23)', steps: [{ t: T.CHIR_T }], set: { scale: 2, centerX: 1, centerY: 0.5, centerZ: 0.2, shape: 0, shapeR: 0.9 } },
  { name: 'Chiral octahedral  O (432)', steps: [{ t: T.CHIR_O }], set: { scale: 2.4, centerX: 1, centerY: 0.6, centerZ: 0.3, shape: 0, shapeR: 0.9 } },
  { name: 'Chiral icosahedral  I (532)', steps: [{ t: T.CHIR_I }], set: { scale: 2.2, centerX: 0.3, centerY: 0.5, centerZ: 0.85, shape: 0, shapeR: 0.9 } },
  { name: 'Cyclic pinwheel  C5h', steps: [{ t: T.ABS, abs: 6 }, { t: T.CYCLIC, ax: 2, n: 5 }], set: { scale: 2.3, centerX: 1, centerY: 0.35, centerZ: 0.5, shape: 0, shapeR: 0.7 } },
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
