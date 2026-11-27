// Eidos's GLSL: the KIFS formula uniforms and mapLocal(). The fold-step
// bodies come from formula/kifs.js, which also holds the CPU port. Organon
// (core/engine/glsl.js) wraps them with the shared renderer.
//
// The shader is SPECIALISED per fold stack: the spec emits straight-line code
// for exactly the steps in Stack A (and Stack B when a hybrid schedule is on),
// plus the chosen DE shape. Step types and their compile-time options are part
// of the program key (specKey); every continuous value is a uniform, so
// dragging a slider never recompiles.

import { glslStack, SHAPE_GLSL, ICO_N, stackKey } from './kifs.js';
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

// Icosahedral (H3) golden mirror; see ICO_N in engine/kifs.js.
const vec3 ICO_N = vec3(${ICO_N.map(x => x.toFixed(10)).join(', ')});

// Fold-count colouring: every reflection a step actually makes adds that
// step's Colour Weight (while the iteration counts toward colour). The count is
// piecewise constant over the surface, so a banded gradient gives crisp stripes.
void stepHit(float h, float w) { g_boxCol += g_colOn * w * h; }
// Scale used as a divisor (Menger z-trick): never exactly zero.
float sNZ(float s) { return abs(s) < 1e-6 ? (s < 0.0 ? -1e-6 : 1e-6) : s; }
`;

// Per-iteration body for one stack (A or B): its stack, its post-rotation,
// its scale and centre.
const iterBody = (S, rot, rotOn, sc, ctr) => `
      s = ${sc} + u_scaleStep * fi;
      c = ${ctr} + u_centerStep * fi;
      z = stack${S}(z, s, c, i, dr);
      if (rotOn && ${rotOn}) z = u_postRotC ? ${rot} * (z - c) + c : ${rot} * z;`;

function mapLocalSource(sum, reset, hasB, shapeBody) {
  const A = iterBody('A', 'u_postRot', 'u_postRotOn', 'u_scale', 'u_center');
  const B = hasB ? iterBody('B', 'u_postRotB', 'u_postRotBOn', 'u_scaleB', 'u_centerB') : '';
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

// Final shape: distance to the seed solid in the folded frame.
float shapeDE(vec3 z) {
  ${shapeBody}
}

float mapLocal(vec3 p, out float trap) {
#ifdef HAS_MAT
  g_texDone = false;
#endif
  g_boxCol = 0.0;
  g_sphCol = 0.0;
  ${reset}
  vec3 z = p;
  float dr = 1.0;
  trap = 1e10;
  mat3 spin = mat3(1.0);
  float s = u_scale;
  vec3 c = u_center;

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
    z = s * (z - c) + c;
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
  if (u_colorSource == 1) trap = g_boxCol * u_foldColW * 2.5;
  else if (u_colorSource == 2) trap += g_boxCol * u_foldColW * 2.5;
  else if (u_colorSource == 3) trap = ${sum};
  // Exact when every step is a fold (1-Lipschitz): dr = Π|s|. A Sphere
  // Inversion step multiplies in its own (conformal) stretch, as Mandelbulber does.
  return shapeDE(z) / max(dr, 1e-30);
}
`;
}

// Default spec: Stack A = one Sierpinski fold, tetrahedron shape.
export const DEFAULT_SPEC = { A: [{ k: 1, t: 3, o: 0 }], B: null, shape: 3 };

// Program defines for a canonical spec.
export const defines = f => `#define SHAPE ${f.shape | 0}\n` + (f.B ? '#define HAS_B\n' : '');

// Formula source for a canonical spec { A: [{ k, t, o }], B: [...] | null, shape }.
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
  return HELPERS + stacks + mapLocalSource(sum, A.reset + (hasB ? ' ' + B.reset : ''), hasB, SHAPE_GLSL[f.shape | 0] ?? SHAPE_GLSL[0]);
}

// ── Program spec ────────────────────────────────────────────────────────────
// Canonical spec from sceneUniforms().__f: the compiled stacks (types +
// options) and the DE shape. Anything else is a uniform.
export function spec(raw) {
  raw = raw || {};
  const norm = slots => (slots || []).map(x => ({ k: x.k, t: x.t | 0, o: x.o | 0 }));
  return { A: norm(raw.A ?? [{ k: 1, t: 3, o: 0 }]), B: raw.B ? norm(raw.B) : null, shape: raw.shape | 0 };
}
export const specKey = f => `A${stackKey(f.A)}|B${f.B ? stackKey(f.B) : '-'}|s${f.shape}`;

// ── Back-compat helpers (tests) ─────────────────────────────────────────────
// fractalFrag(spec, opts): spec is { A, B, shape } or a renderer specOf() result
// (only its formula part is used, as before); opts { mode, texLod, mat, xl, rep, dz }.
const fOf = s => (s && s.f ? s.f : spec(s || DEFAULT_SPEC));
export const fractalFrag = (s, opts = {}) => coreFrag({ f: fOf(s) }, opts);
export const fractalMapSource = (s, opts = {}) => coreMapSource({ f: fOf(s) }, opts);
