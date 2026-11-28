// Eidos's GLSL: the KIFS formula uniforms and mapLocal(). The fold-step
// bodies come from formula/kifs.js, which also holds the CPU port. Organon
// (core/engine/glsl.js) wraps them with the shared renderer.
//
// The shader is SPECIALISED per fold stack: the spec emits straight-line code
// for exactly the steps in Stack A (and Stack B when a hybrid schedule is on),
// plus the chosen DE shape and, when on, the level shape and how it combines.
// Step types and their compile-time options are part of the program key
// (specKey); every continuous value is a uniform, so dragging a slider never
// recompiles.

import { glslStack, SHAPE_GLSL, ICO_N, stackKey, polyGLSL } from './kifs.js';
import { fractalFrag as coreFrag, fractalMapSource as coreMapSource } from '../core/engine/glsl.js';

// Formula uniforms (inserted after Organon's render-mode uniforms).
export const UNIFORMS = `// ── KIFS formula (one iteration: pre-rotation → spin → stack → post-rotation → scale) ──
uniform int   u_iterations;
uniform float u_scale;
uniform vec3  u_center;
uniform mat3  u_preRot;       // before the stack
uniform bool  u_preRotOn;
uniform mat3  u_postRot;      // after the stack, before scaling
uniform bool  u_postRotOn;
uniform bool  u_postRotC;     // post-rotation about the scale centre
uniform mat3  u_spinMatrix;   // iteration k uses spin^k
uniform bool  u_spinOn;
uniform int   u_rotStart;     // rotations apply from this iteration on
uniform float u_scaleStep;    // per-iteration variation
uniform vec3  u_centerStep;
uniform float u_bail2;        // bailout radius²
uniform float u_shapeR;       // DE shape size
uniform vec3  u_shapeBox;     // box proportions
uniform float u_shapeT;       // shell / frame / rod thickness, Kleinian offset
uniform int   u_shapeAx;      // torus / capsule axis (0 X, 1 Y, 2 Z)
// Fold-and-cut polyhedra: vertex direction per cell, face / edge / vertex parts.
uniform vec3  u_polyDir0;     // Td
uniform vec3  u_polyDir1;     // Oh
uniform vec3  u_polyDir2;     // Ih
uniform vec3  u_polyFace;     // face types A, B, C on (1) / off (0)
uniform vec4  u_polyEV;       // edges on, vertices on, edge radius, vertex radius
// Shapes at every level.
uniform float u_lvR;
uniform vec3  u_lvBox;
uniform float u_lvT;
uniform int   u_lvAx;
uniform vec3  u_lvOff;        // level shape position in the folded frame
uniform float u_lvK;          // smooth-union radius (level units)
uniform vec2  u_lvRange;      // levels [From, Until)
uniform float u_lvCol;        // colour offset per level where the level shape decides
#ifdef HAS_B
uniform float u_scaleB;
uniform vec3  u_centerB;
uniform mat3  u_postRotB;
uniform bool  u_postRotBOn;
uniform int   u_hybMode;      // 1 every Nth, 2 switch after N, 3 pattern
uniform int   u_hybN;
uniform int   u_hybLen;
uniform vec4  u_hybPat0;      // pattern iterations 1–4 (1 = Stack B)
uniform vec4  u_hybPat1;      // pattern iterations 5–8
#endif

`;

// Organon provides g_boxCol, g_sphCol (always 0 for KIFS; kept for the
// material "Fold Count" key), g_colOn and (HAS_MAT) the texture probe.
const HELPERS = `

// Icosahedral (H3) golden mirror; see ICO_N in formula/kifs.js.
const vec3 ICO_N = vec3(${ICO_N.map(x => x.toFixed(10)).join(', ')});

// Fold-count colouring: every reflection a step actually makes adds that
// step's Colour Weight (while the iteration counts toward colour). The count is
// piecewise constant over the surface, so a banded gradient gives crisp stripes.
void stepHit(float h, float w) { g_boxCol += g_colOn * w * h; }
// Scale used as a divisor (Menger z-trick, n-flake): never exactly zero.
float sNZ(float s) { return abs(s) < 1e-6 ? (s < 0.0 ? -1e-6 : 1e-6) : s; }
// Nearest part of the last polyhedron evaluated (faces 0–2, edges 3, vertices 4).
float g_polyPart;
// Polynomial smooth min (Inigo Quilez).
float sminK(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float hk = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, hk) - k * hk * (1.0 - hk);
}
`;

// Per-iteration body for one stack (A or B): its stack, its post-rotation,
// its scale and centre.
const iterBody = (S, rot, rotOn, sc, ctr) => `
      s = ${sc} + u_scaleStep * fi;
      c = ${ctr} + u_centerStep * fi;
      z = stack${S}(z, s, c, i, dr);
      if (rotOn && ${rotOn}) z = u_postRotC ? ${rot} * (z - c) + c : ${rot} * z;`;

// Level shape: how level i's distance dl joins the running level value lv
// (and records the deciding level in lvI).
const LEVEL_STEP = {
  1: 'if (dl < lv) { lv = dl; lvI = fi; }',
  2: 'if (dl < lv) lvI = fi; lv = sminK(lv, dl, u_lvK / max(dr, 1e-30));',
  3: 'if (-dl > lv) { lv = -dl; lvI = fi; }',
  4: 'if (dl > lv) { lv = dl; lvI = fi; }',
};
// …and how the level value joins the final shape's distance d.
const LEVEL_JOIN = {
  1: 'if (lv < d) { d = lv; lvWin = lvI + 1.0; }',
  2: 'if (lv < d) lvWin = lvI + 1.0; d = sminK(d, lv, u_lvK / max(dr, 1e-30));',
  3: 'if (lv > d) { d = lv; lvWin = lvI + 1.0; }',
  4: 'if (lv > d) { d = lv; lvWin = lvI + 1.0; }',
};

function mapLocalSource(sum, reset, hasB, shapeBody, lv, poly, polySeed) {
  const A = iterBody('A', 'u_postRot', 'u_postRotOn', 'u_scale', 'u_center');
  const B = hasB ? iterBody('B', 'u_postRotB', 'u_postRotBOn', 'u_scaleB', 'u_centerB') : '';
  const lvBody = lv ? SHAPE_GLSL[lv.s].replace(/u_shapeR/g, 'u_lvR').replace(/u_shapeBox/g, 'u_lvBox')
    .replace(/u_shapeT/g, 'u_lvT').replace(/u_shapeAx/g, 'u_lvAx') : '';
  return `
// ═══ Distance estimator ════════════════════════════════════════════════════
#ifdef HAS_B
bool hybridB(int i) {
  if (u_hybMode == 1) return i - (i / u_hybN) * u_hybN == u_hybN - 1;
  if (u_hybMode == 2) return i >= u_hybN;
  int k = i - (i / u_hybLen) * u_hybLen;
  float b = k == 0 ? u_hybPat0.x : k == 1 ? u_hybPat0.y : k == 2 ? u_hybPat0.z : k == 3 ? u_hybPat0.w
          : k == 4 ? u_hybPat1.x : k == 5 ? u_hybPat1.y : k == 6 ? u_hybPat1.z : u_hybPat1.w;
  return b > 0.5;
}
#endif
${poly.map(polyGLSL).join('\n')}

// Final shape: distance to the seed solid in the folded frame.
float shapeDE(vec3 z) {
  ${shapeBody}
}
${lv ? `
// Level shape, evaluated in each iteration in [From, Until) after the folds, before the scale.
float levelDE(vec3 z) {
  ${lvBody}
}
` : ''}
float mapLocal(vec3 p, out float trap) {
#ifdef HAS_MAT
  g_texDone = false;
#endif
  g_boxCol = 0.0;
  g_sphCol = 0.0;
  g_polyPart = 0.0;
  ${reset}
  vec3 z = p;
  float dr = 1.0;
  trap = 1e10;
  mat3 spin = mat3(1.0);
  float s = u_scale;
  vec3 c = u_center;
${lv ? `  float lv = ${lv.m >= 3 ? '-1e10' : '1e10'}, lvI = 0.0, lvWin = 0.0;
` : ''}
  for (int i = 0; i < 250; i++) {
    if (i >= u_iterations) break;
    g_colOn = i < u_colorIters ? 1.0 : 0.0;
    float fi = float(i);
    bool rotOn = i >= u_rotStart;
    if (rotOn && u_preRotOn) z = u_preRot * z;
    if (rotOn && u_spinOn) { z = spin * z; spin = spin * u_spinMatrix; }
${hasB ? `    if (hybridB(i)) {${B}
    } else {${A}
    }` : `    {${A}
    }`}
${lv ? `    // Level i: after this iteration's folds, before its scale.
    if (fi >= u_lvRange.x && fi < u_lvRange.y) {
      float dl = levelDE(z - u_lvOff) / max(dr, 1e-30);
      ${LEVEL_STEP[lv.m]}
    }
` : ''}    z = s * (z - c) + c;
    dr *= abs(s);

    trap = min(trap, dot(z, z));
#ifdef HAS_MAT
    if (g_texProbe && !g_texDone && i >= u_texFracStart) {
      vec3 zz = abs(z - p);
      if (max(zz.x, max(zz.y, zz.z)) < u_texFracCube) { g_texZ = z; g_texDone = true; }
      else if (length(z) > u_texFracCube * 100.0) { g_texZ = z / length(z); g_texDone = true; }
    }
#endif
    if (dot(z, z) > u_bail2) break;
  }
#ifdef HAS_MAT
  g_orbit = trap;
  if (g_texProbe && !g_texDone) g_texZ = z;
#endif
  // Exact when every step is a fold (1-Lipschitz): dr = Π|s|. A Sphere
  // Inversion step multiplies in its own (conformal) stretch, as Mandelbulber does.
  float d = shapeDE(z) / max(dr, 1e-30);
${polySeed ? `  // A polyhedron seed colours its faces, edges and vertices apart (fold count).
  g_boxCol += g_polyPart;
` : ''}${lv ? `  ${LEVEL_JOIN[lv.m]}
` : ''}  if (u_colorSource == 1) trap = g_boxCol * u_foldColW * 2.5;
  else if (u_colorSource == 2) trap += g_boxCol * u_foldColW * 2.5;
  else if (u_colorSource == 3) trap = ${sum};
${lv ? `  trap += lvWin * u_lvCol;
` : ''}  return d;
}
`;
}

// Default spec: Stack A = one Sierpinski fold, tetrahedron shape.
export const DEFAULT_SPEC = { A: [{ k: 1, t: 3, o: 0, sm: 0 }], B: null, shape: 3, lv: null };

// Program defines for a canonical spec.
export const defines = f => `#define SHAPE ${f.shape | 0}\n` + (f.B ? '#define HAS_B\n' : '');

// Polyhedron cells a spec uses (final shape and level shape).
const POLY0 = 11;
const polysOf = f => [...new Set([f.shape, f.lv ? f.lv.s : -1].filter(s => s >= POLY0 && s < POLY0 + 3).map(s => s - POLY0))].sort();

// Formula source for a canonical spec { A: [{ k, t, o, sm }], B: [...] | null, shape, lv }.
export function source(f) {
  const A = glslStack('a', f.A || []);
  const hasB = !!f.B;
  const B = hasB ? glslStack('b', f.B) : null;
  const stacks = `
// ── Stack A (${(f.A || []).length} steps) ──
${A.decl}
${A.fn}
` + (hasB ? `
// ── Stack B (${f.B.length} steps) ──
${B.decl}
${B.fn}
` : '');
  const sum = A.sum + (hasB ? ` + ${B.sum}` : '');
  return HELPERS + stacks + mapLocalSource(sum, A.reset + (hasB ? ' ' + B.reset : ''), hasB,
    SHAPE_GLSL[f.shape | 0] ?? SHAPE_GLSL[0], f.lv, polysOf(f), f.shape >= POLY0 && f.shape < POLY0 + 3);
}

// ── Program spec ────────────────────────────────────────────────────────────
// Canonical spec from sceneUniforms().__f: the compiled stacks (types +
// options), the DE shape and the level shape. Anything else is a uniform.
export function spec(raw) {
  raw = raw || {};
  const norm = slots => (slots || []).map(x => ({ k: x.k, t: x.t | 0, o: x.o | 0, sm: x.sm ? 1 : 0 }));
  const lv = raw.lv && (raw.lv.m | 0) > 0 ? { m: raw.lv.m | 0, s: Math.min(SHAPE_GLSL.length - 1, Math.max(0, raw.lv.s | 0)) } : null;
  return { A: norm(raw.A ?? [{ k: 1, t: 3, o: 0 }]), B: raw.B ? norm(raw.B) : null, shape: raw.shape | 0, lv };
}
export const specKey = f => `A${stackKey(f.A)}|B${f.B ? stackKey(f.B) : '-'}|s${f.shape}` + (f.lv ? `|l${f.lv.m}.${f.lv.s}` : '');

// ── Back-compat helpers (tests) ─────────────────────────────────────────────
// fractalFrag(spec, opts): spec is { A, B, shape, lv } or a renderer specOf()
// result (only its formula part is used, as before); opts { mode, texLod, mat, xl, rep, dz }.
const fOf = s => (s && s.f ? s.f : spec(s || DEFAULT_SPEC));
export const fractalFrag = (s, opts = {}) => coreFrag({ f: fOf(s) }, opts);
export const fractalMapSource = (s, opts = {}) => coreMapSource({ f: fOf(s) }, opts);
