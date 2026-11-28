// Logic tests (npm test). No dependencies; glslangValidator is used when found.
import { PARAMS, GROUPS, defaults, coerce, PARAM_BY_ID, STEP_NAMES } from './lib.mjs';
import { State } from './lib.mjs';
import { cameraBasis, pixelRay } from './lib.mjs';
import { fractalRotation, dot, sub, normalize, length, cross, wrapPi, mat3Mul } from './lib.mjs';
import { makeDE, march, marchInfo, viewScore, pickPixel } from './lib.mjs';
import { Sequencer, MODE, EASE } from './lib.mjs';
import { encodeDiscovery, decodeDiscovery, evolve, rebirth, makeProject, parseProject, BIOMES, SYMMETRY_GROUPS, symmetryValues, isActive } from './lib.mjs';
import { sceneUniforms, jitterFor, lensFor, specOf, specKey } from './lib.mjs';
import { FRACTAL_FRAG, fractalFrag } from './lib.mjs';
import { T, ABS_MASKS, SWAP_MODES, ROT_PIVOTS, AXES, ZTRICK_MODES, STACKS, SHAPES, stackOf, slotData, cpuStack, hybridUsesB, stackValues, ICO_N, ESTIMATE_TYPES, ESTIMATE_SHAPES, WYTHOFF, stackCenter, shapeFn, SMOOTH_TYPES, FLAKE_POLYS, FLAKE_VERTS, POLY, polyFn, polyDir, LEVEL_MODES, smin } from '../formula/kifs.js';
import { spawnSync } from 'node:child_process';
import { ZipWriter, crc32 } from './lib.mjs';
import { writeFileSync, readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL', msg); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const section = s => console.log('•', s);
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rv = (a = 2) => [(rnd() * 2 - 1) * a, (rnd() * 2 - 1) * a, (rnd() * 2 - 1) * a];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Does this scene use a step or shape that makes the DE an estimate?
const isEstimate = v => ESTIMATE_SHAPES.includes(v.shape | 0)
  || ['a', 'b'].some(s => (s === 'a' || (v.hybridMode | 0) > 0) && stackOf(v, s).some(x => ESTIMATE_TYPES.includes(x.t)));


// ── Schema ──────────────────────────────────────────────────────────────────
section('schema');
const gids = new Set(GROUPS.map(g => g.id));
const ids = new Set();
for (const p of PARAMS) {
  ok(!ids.has(p.id), `duplicate id ${p.id}`); ids.add(p.id);
  ok(gids.has(p.group), `${p.id} has unknown group`);
  ok(coerce(p, p.def) === p.def, `${p.id} default does not survive coerce`);
  if (p.gate) {
    const g = PARAM_BY_ID.get(p.gate);
    const eqs = Array.isArray(p.gateEq) ? p.gateEq : [p.gateEq];
    ok(g?.type === 'bool' || (g?.type === 'select' && eqs.every(e => Number.isInteger(e) && e >= 0 && e < g.options.length)), `${p.id} gate must be a bool, or a select with valid gateEq value(s)`);
  }
  if (p.fine) ok(p.type === 'range', `${p.id}: fine-tune only applies to ranges`);
  if (p.type === 'range') ok(p.min < p.max, `${p.id} min<max`);
}
ok(coerce(PARAM_BY_ID.get('iterations'), 999) === 250, 'iterations hard-clamped to shader loop bound');
ok(coerce(PARAM_BY_ID.get('maxSteps'), 9999) === 1024, 'maxSteps hard-clamped to shader loop bound');
ok(FRACTAL_FRAG.includes('for (int i = 0; i < 1024; i++)'), 'shader march loop bound matches maxSteps hardMax');
ok(FRACTAL_FRAG.includes('for (int i = 0; i < 250; i++)'), 'shader iteration loop bound matches iterations hardMax');
ok(coerce(PARAM_BY_ID.get('lightColor'), 'red') === undefined, 'bad colour rejected');

// Every uniform the JS sends must be declared in the shader with a compatible
// type — checked on a scene that uses every step type in both stacks.
const everyStep = { ...defaults(), hybridMode: 3 };
// Types 1–12 fill Stack A, the rest go in Stack B.
for (let t = 1; t < STEP_NAMES.length; t++) { if (t <= 12) everyStep[`a${t}t`] = t; else everyStep[`b${t - 12}t`] = t; }
const su = sceneUniforms(everyStep);
const decl = {};
for (const m of fractalFrag(specOf(su)).matchAll(/uniform\s+(\w+)\s+(\w+)\s*;/g)) decl[m[2]] = m[1];
ok(new Set([...su.__f.A, ...su.__f.B].map(x => x.t)).size === STEP_NAMES.length - 1, 'every step type is in the test stacks');
for (const [k, v] of Object.entries(su)) {
  if (k.startsWith('__')) continue;
  const t = decl[k];
  ok(!!t, `uniform ${k} not declared in shader`);
  if (!t) continue;
  const expect = typeof v === 'boolean' ? 'bool' : Array.isArray(v) ? { 2: 'vec2', 3: 'vec3', 4: 'vec4', 9: 'mat3' }[v.length] : null;
  if (expect) ok(t === expect, `uniform ${k}: shader ${t} vs js ${expect}`);
  else ok(t === 'float' || t === 'int', `uniform ${k}: numeric type ${t}`);
  ok(Array.isArray(v) ? v.every(Number.isFinite) : (typeof v === 'boolean' || Number.isFinite(v)), `uniform ${k} finite`);
}

// Path-tracer / volume uniforms live behind #if RENDER_MODE; check they are declared somewhere.
{
  const all = fractalFrag(undefined, { mode: 1 }) + fractalFrag(undefined, { mode: 2 });
  for (const k of Object.keys(su).filter(k => /^u_(pt|vol)/.test(k))) ok(all.includes(' ' + k + ';'), `uniform ${k} declared for its render mode`);
  ok(su.__tonemap === 0 && sceneUniforms({ ...defaults(), renderMode: 1 }).__tonemap === 1, 'path tracing forces the filmic tone curve');
}

// ── Camera ──────────────────────────────────────────────────────────────────
section('camera');
const base = { ...defaults(), rotX: 0, rotY: 0, dist: 5 }; // v1-parity view
let worstCenter = 0, worstOrtho = 0;
for (let i = 0; i < 500; i++) {
  const v = { ...base, rotX: (Math.random() * 2 - 1) * Math.PI, rotY: (Math.random() * 2 - 1) * 1.5, dist: 0.1 + Math.random() * 10,
    targetX: Math.random() * 4 - 2, targetY: Math.random() * 4 - 2, targetZ: Math.random() * 4 - 2 };
  const c = cameraBasis(v);
  const toT = normalize(sub(c.target, c.eye));
  worstCenter = Math.max(worstCenter, 1 - dot(c.forward, toT));
  worstOrtho = Math.max(worstOrtho, Math.abs(dot(c.right, c.up)), Math.abs(dot(c.right, c.forward)), Math.abs(dot(c.up, c.forward)),
    Math.abs(length(c.right) - 1), Math.abs(length(c.up) - 1));
  // right-handed: right × up = back
  const back = cross(c.right, c.up);
  worstOrtho = Math.max(worstOrtho, length(sub(back, c.forward.map(x => -x))));
}
ok(worstCenter < 1e-12, `orbit target centred (worst 1-cos = ${worstCenter})`);
ok(worstOrtho < 1e-9, `basis orthonormal & right-handed (worst ${worstOrtho})`);
{
  // v1 parity at the default view, and the v1 bug elsewhere.
  const c0 = cameraBasis(base);
  ok(near(c0.forward[2], -1) && near(c0.right[0], 1) && near(c0.up[1], 1), 'default view identical to v1');
  const b = 0.5, v = { ...base, rotX: b };
  const c = cameraBasis(v);
  const v1Forward = [Math.sin(b), 0, -Math.cos(b)]; // what v1's transposed matrix produced
  const angle = Math.acos(dot(v1Forward, normalize(sub(c.target, c.eye))));
  ok(near(angle, 2 * b, 1e-9), `confirmed v1 off-centre error = 2·rotX (${angle.toFixed(4)})`);
  // roll keeps orthonormality and rolls about forward when only rollZ is set
  const cr = cameraBasis({ ...base, rollZ: 0.7 });
  ok(near(dot(cr.forward, c0.forward), 1, 1e-12), 'rollZ keeps view direction');
  ok(near(dot(cr.right, c0.right), Math.cos(0.7), 1e-12), 'rollZ rotates right vector by angle');
}

// ── Fractal rotation ────────────────────────────────────────────────────────
section('fractal rotation');
{
  const R = fractalRotation(0.3, -1.1, 2.2);
  const RT = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const I = mat3Mul(R, RT);
  ok(I.every((x, i) => near(x, [1, 0, 0, 0, 1, 0, 0, 0, 1][i], 1e-12)), 'rotation is orthogonal');
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  ok(near(det, 1, 1e-12), 'rotation det = 1');
}

// ── Fractal rotation ────────────────────────────────────────────────────────
section('fractal rotation');
{
  const R = fractalRotation(0.3, -1.1, 2.2);
  const RT = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
  const I = mat3Mul(R, RT);
  ok(I.every((x, i) => near(x, [1, 0, 0, 0, 1, 0, 0, 0, 1][i], 1e-12)), 'rotation is orthogonal');
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  ok(near(det, 1, 1e-12), 'rotation det = 1');
}


// ── Fold steps ──────────────────────────────────────────────────────────────
// Every step type × compile-time option is 1-Lipschitz (folds, reflections,
// rotations, partial reflections): the property that makes the DE exact.
const OPTIONS = { [T.ABS]: ABS_MASKS.length, [T.SWAP]: SWAP_MODES.length, [T.ZTRICK]: ZTRICK_MODES.length, [T.ROT]: ROT_PIVOTS.length, [T.DIHEDRAL]: AXES.length, [T.CYCLIC]: AXES.length, [T.NFLAKE]: FLAKE_POLYS.length };
const ALL_STEPS = [];
for (let t = 1; t < STEP_NAMES.length; t++) for (let o = 0; o < (OPTIONS[t] || 1); o++) ALL_STEPS.push({ t, o });
// Smooth variants (Benesi) of every smoothable step × option (not the shift z-trick).
const SMOOTH_STEPS = ALL_STEPS.filter(x => SMOOTH_TYPES.includes(x.t) && !(x.t === T.ZTRICK && x.o === 1)).map(x => ({ ...x, sm: 1 }));
section('fold steps');
{
  let worst = 0, worstName = '';
  for (const { t, o } of ALL_STEPS) {
    if (t === T.ZTRICK && o === 1) continue; // Mandelbulber's shift form: a jump by design (checked below)
    if (ESTIMATE_TYPES.includes(t)) continue; // inversions / rotation-only folds: estimates, checked below
    for (let trial = 0; trial < 6; trial++) {
      const v = { ...defaults() };
      const st = { t, abs: o, swap: o, zm: o, pv: o, ax: o, nx: rnd() * 2 - 1, ny: rnd() * 2 - 1, nz: rnd() * 2 - 1, d: rnd() - 0.5, k: rnd(),
        ra: rnd() * 360 - 180, rb: rnd() * 360 - 180, rg: rnd() * 360 - 180, lx: rnd() * 2, ly: rnd() * 2, lz: rnd() * 2, n: 1 + Math.floor(rnd() * 9) };
      Object.assign(v, stackValues('a', [st]));
      const run = cpuStack(v, 'a', stackOf(v, 'a'));
      const s = (rnd() < 0.2 ? -1 : 1) * (1.2 + rnd() * 2), c = rv(1.5);
      for (let i = 0; i < 300; i++) {
        const a = rv(3), b = rnd() < 0.5 ? rv(3) : a.map(x => x + (rnd() - 0.5) * 0.02);
        const acc = { fold: 0, colOn: 1, traps: {}, w: {} };
        const fa = run(a, s, c, acc), fb = run(b, s, c, acc);
        const r = dist3(fa, fb) / Math.max(dist3(a, b), 1e-300);
        if (r > worst) { worst = r; worstName = `${STEP_NAMES[t]} opt ${o}`; }
      }
    }
  }
  ok(worst <= 1 + 1e-9, `all ${ALL_STEPS.filter(x => !ESTIMATE_TYPES.includes(x.t)).length - 1} fold step × option variants are 1-Lipschitz (worst ratio ${worst.toFixed(12)} — ${worstName})`);

  // The icosahedral fold lands in one cell of the 120-element group, and the
  // octahedral one in one cell of the 48.
  const gs = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (const [t, order] of [[T.ICOSA, 120], [T.OCTA, 48], [T.TETRA, 24], [T.CHIR_T, 12], [T.CHIR_O, 24], [T.CHIR_I, 60]]) {
    const v = { ...defaults(), ...stackValues('a', [{ t }]) };
    const run = cpuStack(v, 'a', stackOf(v, 'a'));
    let fixed = 0, idem = 0, n = 60000;
    for (let i = 0; i < n; i++) {
      let p = [gs(), gs(), gs()]; const l = Math.hypot(...p); p = p.map(x => x / l);
      const acc = { fold: 0, colOn: 1, traps: {}, w: {} };
      const f = run(p, 2, [1, 0, 0], acc), g = run(f, 2, [1, 0, 0], acc);
      if (dist3(f, p) < 1e-12) fixed++;
      if (dist3(f, g) < 1e-9) idem++;
    }
    ok(Math.abs(fixed / n * order - 1) < 0.08 && idem === n, `${STEP_NAMES[t]}: folds into one cell of ${order} (cell fraction ×${order} = ${(fixed / n * order).toFixed(3)}, idempotent ${idem === n})`);
  }
  ok(near(Math.hypot(...ICO_N), 1, 1e-12), 'icosahedral mirror normal is unit length');
}

// ── Exact distance estimate ─────────────────────────────────────────────────
// With a fixed number of iterations (bailout out of reach) shape(F(p)) / Π|s|
// is 1-Lipschitz in p and never positive on the surface: Step Factor 1 never
// overshoots. Checked on every preset (spin, hybrids, rotations, planes).
section('exact DE');
{
  for (const [key, b] of Object.entries(BIOMES)) {
    if (isEstimate({ ...defaults(), ...b.v })) continue; // estimates, not bounds (checked in 'estimates')
    const v = { ...defaults(), ...b.v, bailout: 1e6, iterations: Math.min(b.v.iterations, 8) };
    const m = makeDE(v).local;
    let worst = 0;
    for (let i = 0; i < 500; i++) {
      const p = rv(2.5), q = rnd() < 0.5 ? rv(2.5) : p.map(x => x + (rnd() - 0.5) * 0.05);
      worst = Math.max(worst, Math.abs(m(p).d - m(q).d) / Math.max(dist3(p, q), 1e-300));
    }
    ok(worst <= 1 + 1e-7, `${b.label}: DE is 1-Lipschitz (worst ${worst.toFixed(9)})`);
  }
  // Bailout on: rays still never step into the surface (sphere-ball test).
  for (const key of ['menger', 'icosa', 'hybrid', 'coral']) {
    const v = { ...defaults(), ...BIOMES[key].v };
    const m = makeDE(v).local;
    let bad = 0;
    for (let i = 0; i < 150; i++) {
      const p = rv(2.2), d = m(p).d;
      if (!(d > 1e-3)) continue;
      for (let k = 0; k < 12; k++) {
        const dir = normalize(rv(1)), q = p.map((x, j) => x + dir[j] * d * 0.999 * rnd());
        const hv = { ...v, bailout: 1e6, iterations: v.iterations };
        if (makeDE(hv).local(q).d < 0) bad++;
      }
      if (i > 40) break;
    }
    ok(bad === 0, `${BIOMES[key].label}: no surface inside the step ball`);
  }
  // Menger z-trick: mirror and Mandelbulber's shift give the same DE after abs.
  const mg = { ...defaults(), ...BIOMES.menger.v };
  const m0 = makeDE(mg).local, m1 = makeDE({ ...mg, a2zm: 1 }).local;
  let zw = 0;
  for (let i = 0; i < 400; i++) { const p = rv(1.6); zw = Math.max(zw, Math.abs(m0(p).d - m1(p).d)); }
  ok(zw < 1e-12, `Menger z-trick: mirror ≡ shift when abs follows (max diff ${zw.toExponential(1)})`);
}

// ── Sphere inversion ────────────────────────────────────────────────────────
// One step that reproduces both of Kyma's inversions; its stretch is tracked
// in dr exactly (it is conformal), and capped by DE Limit when set.
section('sphere inversion');
{
  const one = st => {
    const v = { ...defaults(), ...stackValues('a', [{ t: T.INV, ...st }]) };
    const run = cpuStack(v, 'a', stackOf(v, 'a'));
    return (z, it = 0) => { const acc = { fold: 0, colOn: 1, traps: {}, w: {}, dr: 1 }; const r = run(z, 2, [1, 1, 1], acc, it); return { z: r, k: acc.dr }; };
  };
  // Kyma's sphereInvert() (glsl.js, "Enable Inversion"), ported as written.
  const kymaInv = (z, dr, c, R, amt, lim) => {
    const dz = z.map((x, i) => x - c[i]), r2 = Math.max(dz[0] ** 2 + dz[1] ** 2 + dz[2] ** 2, 1e-6), f = R * R / r2;
    return { z: z.map((x, i) => x + (c[i] + dz[i] * f - x) * amt), dr: dr * (1 + (Math.min(f, lim) - 1) * amt) };
  };
  // Kyma's Mandelbulber inversion (u_vSInv*): z += O; z *= G/|z|²; z += A − O; z *= S.
  const mbInv = (z, dr, O, G, A, S) => {
    let w = z.map((x, i) => x + O[i]); const ri = Math.max(w[0] ** 2 + w[1] ** 2 + w[2] ** 2, 1e-20);
    w = w.map(x => x * G / ri); dr *= G / ri; w = w.map((x, i) => (x + A[i] - O[i]) * S); return { z: w, dr: dr * S };
  };
  let wk = 0, wm = 0;
  for (let i = 0; i < 300; i++) {
    const c = rv(1), R = 0.3 + rnd() * 1.5, amt = rnd(), lim = 1 + rnd() * 20, p = rv(2.5);
    const a = one({ icx: c[0], icy: c[1], icz: c[2], ir: R, ia: amt, il: lim })(p), b = kymaInv(p, 1, c, R, amt, lim);
    wk = Math.max(wk, dist3(a.z, b.z) / (1 + Math.hypot(...b.z)), Math.abs(a.k - b.dr) / b.dr);
    const O = rv(1), G = 0.2 + rnd() * 2, A = rv(1), S = 0.5 + rnd() * 1.5;
    const m = one({ icx: -O[0], icy: -O[1], icz: -O[2], ir: Math.sqrt(G), ia: 1, il: 0, iax: A[0], iay: A[1], iaz: A[2], is: S })(p), n = mbInv(p, 1, O, G, A, S);
    wm = Math.max(wm, dist3(m.z, n.z) / (1 + Math.hypot(...n.z)), Math.abs(m.k - n.dr) / n.dr);
  }
  ok(wk < 1e-12, `matches Kyma's inversion (Amount, DE Limit) to ${wk.toExponential(1)}`);
  ok(wm < 1e-12, `matches Kyma's Mandelbulber inversion (centre −O, R² = G, shift, scale) to ${wm.toExponential(1)}`);
  // Conformal: at full amount, every direction stretches by exactly the tracked factor.
  let wc = 0, wb = 0;
  for (let i = 0; i < 200; i++) {
    const c = rv(1), R = 0.4 + rnd(), S = 0.6 + rnd(), p = rv(2);
    if (dist3(p, c) < 0.2) continue;
    const st = one({ icx: c[0], icy: c[1], icz: c[2], ir: R, ia: 1, il: 0, is: S }), r0 = st(p);
    const part = one({ icx: c[0], icy: c[1], icz: c[2], ir: R, ia: 0.4, il: 0 }), q0 = part(p);
    for (let k = 0; k < 6; k++) {
      const d = normalize(rv(1)), e = 1e-6, q = p.map((x, j) => x + d[j] * e);
      wc = Math.max(wc, Math.abs(dist3(st(q).z, r0.z) / e / r0.k - 1));
      wb = Math.max(wb, dist3(part(q).z, q0.z) / e / q0.k - 1);
    }
  }
  ok(wc < 1e-4, `full inversion: tracked factor = the stretch in every direction (worst ${wc.toExponential(1)})`);
  ok(wb < 1e-4, `partial inversion: tracked factor bounds the stretch (worst excess ${wb.toExponential(1)})`);
  // Iteration range, and the presets that use it.
  const ir = one({ icz: 0.5, if: 1, iu: 2 });
  ok(dist3(ir([0.3, 0.2, 0.1], 0).z, [0.3, 0.2, 0.1]) === 0 && dist3(ir([0.3, 0.2, 0.1], 1).z, [0.3, 0.2, 0.1]) > 0.1, 'From / Until iteration range');
}

// ── Estimates: inversions, chiral / cyclic folds, Kleinian ───────────────────
// No bound exists, so measure: from points outside, a step of Step Factor × DE
// should almost never land inside the surface. Every estimate preset is checked
// at its own Step Factor.
section('estimates');
{
  for (const [key, b] of Object.entries(BIOMES)) {
    const v = { ...defaults(), ...b.v };
    if (!isEstimate(v)) continue;
    ok(v.stepFactor < 1, `${b.label}: estimate preset marches shorter than 1 (Step Factor ${v.stepFactor})`);
    const m = makeDE(v);
    let bad = 0, n = 0;
    const R = key === 'kleinian' ? 1 : 2.5, ctr = key === 'kleinian' ? [0, 0, 0] : [0, 0, 0];
    for (let i = 0; i < 160; i++) {
      const p = rv(R).map((x, j) => x + ctr[j]), d = m(p).d;
      if (!(d > 1e-4)) continue;
      for (let k = 0; k < 8; k++) { const dir = normalize(rv(1)), q = p.map((x, j) => x + dir[j] * d * v.stepFactor * rnd()); n++; if (m(q).d < 0) bad++; }
    }
    ok(n > 100 && bad / n < 0.01, `${b.label}: under 1% of Step-Factor steps land inside (${bad}/${n})`);
  }
  // Chiral folds are pure rotations (det +1 everywhere), so they keep handedness.
  for (const t of [T.CHIR_T, T.CHIR_O, T.CHIR_I, T.CYCLIC]) {
    const v = { ...defaults(), ...stackValues('a', [{ t, n: 5 }]) };
    const run = cpuStack(v, 'a', stackOf(v, 'a'));
    let improper = 0;
    for (let i = 0; i < 400; i++) {
      const p = rv(1.5), e = 1e-7, acc = () => ({ fold: 0, colOn: 1, traps: {}, w: {} });
      const f0 = run(p, 2, [1, 0, 0], acc());
      const J = [[e, 0, 0], [0, e, 0], [0, 0, e]].map(d => run(p.map((x, k) => x + d[k]), 2, [1, 0, 0], acc()).map((x, k) => (x - f0[k]) / e));
      const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
      if (!(Math.abs(det - 1) < 1e-4)) improper++;
    }
    ok(improper === 0, `${STEP_NAMES[t]}: a rotation everywhere (det +1 at 400 points)`);
  }
}

// ── Kleinian (Knighty) ──────────────────────────────────────────────────────
// Ported from Knighty's pseudo-Kleinian DE (Fragmentarium):
//   p = 2·clamp(p, −CSize, CSize) − p; k = max(Size / p·p, 1); p *= k;
//   DEfactor *= k; p += C;   …   rxy = |p.xy|;
//   return max(rxy − Offset, |rxy·p.z| / |p|) / DEfactor
section('kleinian');
{
  const knighty = (p, CS, Size, C, Off, MI) => {
    let f = 1;
    for (let i = 0; i < MI; i++) {
      p = p.map((x, k) => 2 * Math.max(-CS[k], Math.min(CS[k], x)) - x);
      const k = Math.max(Size / (p[0] ** 2 + p[1] ** 2 + p[2] ** 2), 1);
      p = p.map((x, j) => x * k + C[j]); f *= k;
    }
    const rxy = Math.hypot(p[0], p[1]);
    return Math.max(rxy - Off, Math.abs(rxy * p[2]) / Math.hypot(...p)) / f;
  };
  let w = 0;
  for (let trial = 0; trial < 5; trial++) {
    const CS = [0.7 + rnd() * 0.4, 0.7 + rnd() * 0.4, 0.7 + rnd() * 0.5], R = 0.8 + rnd() * 0.4, C = rv(0.2), Off = rnd() * 0.1, MI = 6 + (trial % 5);
    const v = { ...defaults(), ...stackValues('a', [{ t: T.KLEIN, lx: CS[0], ly: CS[1], lz: CS[2], kr: R, kcx: C[0], kcy: C[1], kcz: C[2] }]),
      scale: 1, centerX: 0, centerY: 0, centerZ: 0, shape: 9, shapeT: Off, iterations: MI, bailout: 1e12 };
    const m = makeDE(v).local;
    for (let i = 0; i < 200; i++) { const p = rv(1.5), ref = knighty(p, CS, R * R, C, Off, MI); w = Math.max(w, Math.abs(m(p).d - ref) / Math.max(1e-12, Math.abs(ref))); }
  }
  ok(w < 1e-9, `Kleinian step + shape match Knighty's pseudo-Kleinian DE (worst rel ${w.toExponential(1)})`);
}

// ── Iteration ranges, Wythoff centres, seed shapes ──────────────────────────
section('ranges, wythoff, shapes');
{
  // A step outside its range does nothing; the two-phase preset is pure
  // octahedral for its first three iterations.
  const tp = { ...defaults(), ...BIOMES.twophase.v };
  const octOnly = { ...tp, ...stackValues('a', [{ t: T.OCTA }]) };
  let w3 = 0, w4 = 0;
  for (let i = 0; i < 200; i++) {
    const p = rv(2);
    w3 = Math.max(w3, Math.abs(makeDE({ ...tp, iterations: 3 }).local(p).d - makeDE({ ...octOnly, iterations: 3 }).local(p).d));
    w4 = Math.max(w4, Math.abs(makeDE({ ...tp, iterations: 5 }).local(p).d - makeDE({ ...octOnly, iterations: 5 }).local(p).d));
  }
  ok(w3 < 1e-12 && w4 > 1e-3, `From / Until: Sierpinski joins at iteration 3 (diff before ${w3.toExponential(1)}, after ${w4.toFixed(3)})`);
  ok(specKey(specOf(sceneUniforms({ ...defaults(), a1if: 2, a1iu: 5 }))) === specKey(specOf(sceneUniforms(defaults()))), 'iteration ranges are uniforms (no recompile)');
  // Wythoff: the centre lies in the cell its fold maps into, at the right corner.
  const foldOf = [T.TETRA, T.OCTA, T.ICOSA];
  for (let g = 0; g < WYTHOFF.length; g++) {
    const v = { ...defaults(), ...stackValues('a', [{ t: foldOf[g] }]) };
    const run = cpuStack(v, 'a', stackOf(v, 'a'));
    let wIn = 0;
    for (let i = 0; i < 300; i++) {
      const c = stackCenter({ ctrMode: 1, wyGroup: g, wyA: rnd(), wyB: rnd(), wyC: rnd(), wyR: 0.5 + rnd() * 2 });
      wIn = Math.max(wIn, dist3(run(c, 2, [1, 0, 0], { fold: 0, colOn: 1, traps: {}, w: {} }), c));
    }
    const corner = k => stackCenter({ ctrMode: 1, wyGroup: g, wyA: +(k === 0), wyB: +(k === 1), wyC: +(k === 2), wyR: 1.7 });
    const cornersOk = [0, 1, 2].every(k => dist3(corner(k), WYTHOFF[g].corners[k].map(x => x * 1.7)) < 1e-12);
    ok(wIn < 1e-12 && cornersOk, `Wythoff ${WYTHOFF[g].name}: centres stay in the fold's cell, corners exact`);
  }
  ok(dist3(stackCenter({ ...defaults(), ctrMode: 0, centerX: 0.3, centerY: -0.2, centerZ: 0.9 }), [0.3, -0.2, 0.9]) === 0, 'manual centre unchanged');
  // Seed shapes 0–8 are exact distances: 1-Lipschitz, and |d| = distance to
  // the zero set where it was checked by bisection along a ray.
  const BOUND_ONLY = [2, 3, 11, 12, 13]; // plane-distance lower bounds (polyhedra: their faces)
  for (let sh = 0; sh < SHAPES.length; sh++) {
    if (ESTIMATE_SHAPES.includes(sh)) continue;
    const f = shapeFn({ shape: sh, shapeR: 0.8, shapeT: 0.12, shapeBX: 1.2, shapeBY: 0.7, shapeBZ: 1, shapeAx: sh % 3 });
    let lip = 0, under = 0;
    for (let i = 0; i < 2000; i++) {
      const a = rv(2), b = rnd() < 0.5 ? rv(2) : a.map(x => x + (rnd() - 0.5) * 0.02);
      lip = Math.max(lip, Math.abs(f(a) - f(b)) / dist3(a, b));
    }
    // Exactness: moving d along the gradient from outside reaches the surface.
    for (let i = 0; i < 300; i++) {
      const p = rv(2), d = f(p);
      if (!(d > 0.01)) continue;
      const e = 1e-6, g = [0, 1, 2].map(k => (f(p.map((x, j) => x + (j === k ? e : 0))) - f(p.map((x, j) => x - (j === k ? e : 0)))) / (2 * e));
      const gl = Math.hypot(...g), q = p.map((x, k) => x - g[k] / gl * d);
      // Octahedron / tetrahedron are plane-distance lower bounds: never past the surface.
      if (BOUND_ONLY.includes(sh) ? f(q) < -1e-4 : Math.abs(f(q)) > 1e-4) under++;
    }
    ok(lip <= 1 + 1e-6 && under === 0, `shape ${SHAPES[sh]}: ${BOUND_ONLY.includes(sh) ? 'lower bound' : 'exact distance'} (Lipschitz ${lip.toFixed(6)}, gradient steps ${BOUND_ONLY.includes(sh) ? 'never cross' : 'land on'} the surface)`);
  }
}


// ── 1.5.0: smooth folds, periodic fold, n-flake, polyhedra, level shapes ──────
// Ports of the FragM (Fragmentarium) originals these come from, written as the
// .frag files do it, and brute-force checks of the polyhedron distances.
section('smooth folds');
{
  const runStep = (st, s = 2.3, c = [1, 0.7, 0.4]) => {
    const v = { ...defaults(), ...stackValues('a', [st]) };
    const run = cpuStack(v, 'a', stackOf(v, 'a'));
    return z => run(z, s, c, { fold: 0, colOn: 1, traps: {}, w: {} });
  };
  let worst = 0, worstName = '', zeroK = 0, dev = 0;
  for (const { t, o } of SMOOTH_STEPS) {
    for (let trial = 0; trial < 6; trial++) {
      const k = rnd() * 0.4;
      const st = { t, abs: o, swap: o, zm: o, sm: true, sk: k, nx: rnd() * 2 - 1, ny: rnd() * 2 - 1, nz: rnd() * 2 - 1, d: rnd() - 0.5, k: rnd() };
      const s = (rnd() < 0.2 ? -1 : 1) * (1.2 + rnd() * 2), c = rv(1.5);
      const f = runStep(st, s, c), f0 = runStep({ ...st, sk: 0 }, s, c), hard = runStep({ ...st, sm: false }, s, c);
      for (let i = 0; i < 300; i++) {
        const a = rv(3), b = rnd() < 0.5 ? rv(3) : a.map(x => x + (rnd() - 0.5) * 0.02);
        const r = dist3(f(a), f(b)) / Math.max(dist3(a, b), 1e-300);
        if (r > worst) { worst = r; worstName = `${STEP_NAMES[t]} opt ${o}`; }
        zeroK = Math.max(zeroK, dist3(f0(a), hard(a)));
        dev = Math.max(dev, dist3(f(a), hard(a)) / Math.max(k, 1e-9));
      }
    }
  }
  ok(worst <= 1 + 1e-9, `all ${SMOOTH_STEPS.length} smooth step × option variants are 1-Lipschitz (worst ${worst.toFixed(12)} — ${worstName})`);
  ok(zeroK < 1e-12, `Softness 0 gives the hard fold exactly (max diff ${zeroK.toExponential(1)})`);
  ok(dev <= 2.2, `smooth folds stay within ~k of the hard fold (worst ${dev.toFixed(3)}·k)`);
  // Benesi's MengerSmooth.frag (no rotation or spheric options), as written:
  // abs → √(x² + s); three soft swaps; soft z-trick; scale about C = (1, 1, .5).
  const benesi = (z, sc, sv, n) => {
    const sc1 = sc - 1, sc2 = sc1 / sc, C = [1, 1, 0.5];
    let [x, y, w] = z, W = 1;
    for (let i = 0; i < n; i++) {
      x = Math.sqrt(x * x + sv); y = Math.sqrt(y * y + sv); w = Math.sqrt(w * w + sv);
      let t = x - y; t = 0.5 * (t - Math.sqrt(t * t + sv)); x -= t; y += t;
      t = x - w; t = 0.5 * (t - Math.sqrt(t * t + sv)); x -= t; w += t;
      t = y - w; t = 0.5 * (t - Math.sqrt(t * t + sv)); y -= t; w += t;
      w = w - C[2] * sc2; w = -Math.sqrt(w * w + sv); w = w + C[2] * sc2;
      x = sc * x - C[0] * sc1; y = sc * y - C[1] * sc1; w = sc * w;
      W *= sc;
    }
    return Math.hypot(x, y, w) / W;
  };
  let wb = 0;
  for (let trial = 0; trial < 4; trial++) {
    const sv = 0.001 + rnd() * 0.01, sc = 2.6 + rnd() * 0.6, n = 4 + trial;
    const v = { ...defaults(), ...stackValues('a', [{ t: T.OCTA, sm: true, sk: Math.sqrt(sv) }, { t: T.ZTRICK, sm: true, sk: Math.sqrt(sv) }]),
      scale: sc, centerX: 1, centerY: 1, centerZ: 1, shape: 0, shapeR: 0, iterations: n, bailout: 1e12 };
    const m = makeDE(v).local;
    for (let i = 0; i < 200; i++) { const p = rv(1.5), ref = benesi(p, sc, sv, n); wb = Math.max(wb, Math.abs(m(p).d - ref) / Math.max(ref, 1e-9)); }
  }
  ok(wb < 1e-9, `smooth Octahedral + z-trick match Benesi's MengerSmooth (worst rel ${wb.toExponential(1)})`);
  ok(specKey(specOf(sceneUniforms({ ...defaults(), a1sm: true }))) !== specKey(specOf(sceneUniforms(defaults()))), 'Smooth is compiled in');
  ok(specKey(specOf(sceneUniforms({ ...defaults(), a1sm: true, a1sk: 0.1 }))) === specKey(specOf(sceneUniforms({ ...defaults(), a1sm: true, a1sk: 0.3 }))), 'Softness is a uniform');
  ok(specKey(specOf(sceneUniforms({ ...defaults(), a1t: T.ICOSA, a1sm: true }))) === specKey(specOf(sceneUniforms({ ...defaults(), a1t: T.ICOSA }))), 'Smooth on a step without a smooth form is ignored');
}

section('periodic mirror fold');
{
  const v = { ...defaults(), ...stackValues('a', [{ t: T.PERIOD, lx: 0.7, ly: 1.3, lz: 0 }]) };
  const run = cpuStack(v, 'a', stackOf(v, 'a'));
  const f = z => run(z, 2, [0, 0, 0], { fold: 0, colOn: 1, traps: {}, w: {} });
  let idIn = 0, per = 0, inBox = true, lip = 0, mir = 0;
  for (let i = 0; i < 2000; i++) {
    const p = rv(8);
    const q = [p[0] * 0.7 / 8, p[1] * 1.3 / 8, p[2]];
    idIn = Math.max(idIn, dist3(f(q), q)); // identity on [−L, L] (and on the free axis)
    per = Math.max(per, dist3(f(p), f([p[0] + 4 * 0.7, p[1] - 4 * 1.3, p[2]])));
    const fp = f(p); inBox = inBox && Math.abs(fp[0]) <= 0.7 + 1e-12 && Math.abs(fp[1]) <= 1.3 + 1e-12 && fp[2] === p[2];
    mir = Math.max(mir, dist3(fp, f([2 * 0.7 - p[0], p[1], p[2]]))); // mirror at x = L
    const b = p.map(x => x + (rnd() - 0.5) * 0.05);
    lip = Math.max(lip, dist3(fp, f(b)) / dist3(p, b));
  }
  ok(idIn < 1e-12 && inBox, 'identity on the box ±L, folds everything into it, L = 0 leaves the axis alone');
  ok(per < 1e-9 && mir < 1e-9, `period 4L, mirror at x = L (diffs ${per.toExponential(1)}, ${mir.toExponential(1)})`);
  ok(lip <= 1 + 1e-9, `1-Lipschitz (worst ${lip.toFixed(12)})`);
}

section('n-flake');
{
  // Each vertex set: unit vectors, the right count, and the right number of
  // nearest neighbours (tetra 3, octa 4, cube 3, icosa 5, dodeca 3).
  const NB = [3, 4, 3, 5, 3], COUNT = [4, 6, 8, 12, 20];
  FLAKE_VERTS.forEach((V, i) => {
    const unit = V.every(v => near(Math.hypot(...v), 1, 1e-12));
    const nb = V.map(a => { const ds = V.map(b => dist3(a, b)).filter(d => d > 1e-9); const m = Math.min(...ds); return ds.filter(d => d < m + 1e-9).length; });
    ok(V.length === COUNT[i] && unit && nb.every(n => n === NB[i]), `${FLAKE_POLYS[i]}: ${V.length} unit vertices, ${NB[i]} nearest neighbours each`);
  });
  // Syntopia's Tetrahedron-Alternative.frag: z = Scale·z − c·(Scale − 1) with c
  // the nearest of (±1, ±1, ±1) (even sign changes), DE = |z|·Scale⁻ⁿ.
  const verts = [[1, 1, 1], [-1, -1, 1], [1, -1, -1], [-1, 1, -1]];
  const syntopia = (z, S, n) => {
    for (let k = 0; k < n; k++) {
      let c = verts[0], dist = 0;
      verts.forEach((v, i) => { const d = dist3(z, v); if (i === 0 || d < dist) { c = v; dist = d; } });
      z = z.map((x, j) => S * x - c[j] * (S - 1));
    }
    return Math.hypot(...z) * S ** -n;
  };
  let w = 0;
  for (const S of [2, 2.3]) {
    const v = { ...defaults(), ...stackValues('a', [{ t: T.NFLAKE, fp: 0, fr: Math.sqrt(3) }]), scale: S, centerX: 0, centerY: 0, centerZ: 0, shape: 0, shapeR: 0, iterations: 9, bailout: 1e12 };
    const m = makeDE(v).local;
    for (let i = 0; i < 300; i++) { const p = rv(2), ref = syntopia(p, S, 9); w = Math.max(w, Math.abs(m(p).d - ref) / ref); }
  }
  ok(w < 1e-9, `N-Flake matches Syntopia's Tetrahedron-Alternative (worst rel ${w.toExponential(1)})`);
  // Any scale centre: the step makes the iteration s·(z − V) + V.
  const v2 = { ...defaults(), ...stackValues('a', [{ t: T.NFLAKE, fp: 3, fr: 1.2 }]), scale: 2.6, centerX: 0.3, centerY: -0.4, centerZ: 0.2 };
  const run = cpuStack(v2, 'a', stackOf(v2, 'a'));
  let wc = 0;
  for (let i = 0; i < 300; i++) {
    const p = rv(2), c = [0.3, -0.4, 0.2], y = run(p, 2.6, c, { fold: 0, colOn: 1, traps: {}, w: {} });
    const V = FLAKE_VERTS[3].reduce((b, q) => (dot(p, q) > dot(p, b) ? q : b)).map(x => x * 1.2);
    wc = Math.max(wc, dist3(y.map((x, j) => 2.6 * (x - c[j]) + c[j]), p.map((x, j) => 2.6 * (x - V[j]) + V[j])));
  }
  ok(wc < 1e-12, 'with any centre, one iteration is s·(z − V) + V for the nearest vertex V');
}

section('fold-and-cut polyhedra');
{
  const reflect = (p, n) => { const t = 2 * dot(p, n); return p.map((x, i) => x - t * n[i]); };
  const key = p => p.map(x => x.toFixed(7)).join(',');
  // Orbit of a point under the group generated by the cell's three mirrors.
  const orbit = (P, N) => {
    const seen = new Map([[key(P), P]]), q = [P];
    while (q.length) { const a = q.pop(); for (const n of N) { const b = reflect(a, n), k = key(b); if (!seen.has(k)) { seen.set(k, b); q.push(b); } } }
    return [...seen.values()];
  };
  const segD = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-30))); return dist3(p, a.map((x, i) => x + t * ab[i])); };
  const ORDER = [24, 48, 120];
  for (let g = 0; g < 3; g++) {
    const N = POLY[g].mirrors;
    ok(N.every(n => near(Math.hypot(...n), 1, 1e-12)) && WYTHOFF[g].corners.every(c => N.every(n => dot(c, n) >= -1e-12)), `${WYTHOFF[g].name}: unit mirrors, corners inside the cell`);
    ok(orbit([0.31, 0.17, 0.05].map((x, i) => x + i * 1e-3), N).length === ORDER[g] || orbit(WYTHOFF[g].corners.reduce((a, c, k) => a.map((x, i) => x + [0.5, 0.3, 0.2][k] * c[i]), [0, 0, 0]), N).length === ORDER[g], `${WYTHOFF[g].name}: the mirrors generate a group of ${ORDER[g]}`);
    for (let trial = 0; trial < 3; trial++) {
      const w = [rnd(), rnd(), rnd()], R = 0.6 + rnd(), ER = 0.01 + rnd() * 0.05, VR = 0.02 + rnd() * 0.08;
      const base = { polyA: w[0], polyB: w[1], polyC: w[2] };
      const P = polyDir(base, g).map(x => x * R);
      const V = orbit(P, N);
      // Edges: P to its mirror image across each mirror, and every copy.
      const E0 = N.map(n => [P, reflect(P, n)]).filter(([a, b]) => dist3(a, b) > 1e-9);
      const ek = ([a, b]) => [key(a), key(b)].sort().join('|');
      const seenE = new Map(E0.map(e => [ek(e), e])), qe = [...E0];
      while (qe.length) { const [a, b] = qe.pop(); for (const n of N) { const e = [reflect(a, n), reflect(b, n)], k2 = ek(e); if (!seenE.has(k2)) { seenE.set(k2, e); qe.push(e); } } }
      const E = [...seenE.values()];
      const fE = polyFn({ ...base, polyF1: false, polyF2: false, polyF3: false, polyE: true, polyER: ER }, g, R);
      const fV = polyFn({ ...base, polyF1: false, polyF2: false, polyF3: false, polyV: true, polyVR: VR }, g, R);
      const fF = polyFn({ ...base }, g, R);
      let we = 0, wv = 0, fOk = true, lip = 0;
      for (let i = 0; i < 300; i++) {
        const p = rv(2);
        we = Math.max(we, Math.abs(fE(p) - (Math.min(...E.map(([a, b]) => segD(p, a, b))) - ER)));
        wv = Math.max(wv, Math.abs(fV(p) - (Math.min(...V.map(a => dist3(p, a))) - VR)));
        // Faces: a lower bound — never more than the distance to a vertex.
        fOk = fOk && fF(p) <= Math.min(...V.map(a => dist3(p, a))) + 1e-9;
        const q = p.map(x => x + (rnd() - 0.5) * 0.05);
        lip = Math.max(lip, Math.abs(fF(p) - fF(q)) / dist3(p, q));
      }
      const onV = V.every(a => Math.abs(fF(a)) < 1e-9);
      ok(we < 1e-9 && wv < 1e-9, `${WYTHOFF[g].name} polyhedron (${V.length} vertices, ${E.length} edges): edges & vertices exact vs brute force (${we.toExponential(1)}, ${wv.toExponential(1)})`);
      ok(fOk && onV && lip <= 1 + 1e-9, `${WYTHOFF[g].name} polyhedron: faces a 1-Lipschitz bound through every vertex (bound ${fOk}, on vertices ${onV}, Lipschitz ${lip.toFixed(9)})`);
    }
  }
  // Regular cases: Oh corner A → the octahedron, corner C → the cube.
  const oct = shapeFn({ shape: 2, shapeR: 1 }), box = shapeFn({ shape: 1, shapeR: 1 / Math.sqrt(3) });
  const pO = polyFn({ polyA: 1, polyB: 0, polyC: 0 }, 1, 1), pC = polyFn({ polyA: 0, polyB: 0, polyC: 1 }, 1, 1);
  let sgn = 0, bnd = true;
  for (let i = 0; i < 2000; i++) {
    const p = rv(2);
    if (Math.abs(oct(p)) > 1e-6 && Math.sign(oct(p)) !== Math.sign(pO(p))) sgn++;
    if (Math.abs(box(p)) > 1e-6 && Math.sign(box(p)) !== Math.sign(pC(p))) sgn++;
    bnd = bnd && pO(p) >= oct(p) - 1e-7 && pC(p) <= box(p) + 1e-9; // octahedron shape uses 0.57735027 for 1/√3
  }
  ok(sgn === 0 && bnd, `Oh corner A is the octahedron, corner C the cube (sign disagreements ${sgn}, bounds ${bnd})`);
  ok(near(polyFn({ polyA: 1, polyB: 0, polyC: 0 }, 2, 1)([0, 0, 0]), -1 / Math.sqrt(3) * (1 / Math.sqrt(3)) * Math.sqrt(3) * Math.sqrt((5 + 2 * Math.sqrt(5)) / 15) * Math.sqrt(3), 1e-9)
    || near(-polyFn({ polyA: 1, polyB: 0, polyC: 0 }, 2, 1)([0, 0, 0]), dot(WYTHOFF[2].corners[0], WYTHOFF[2].corners[2]), 1e-9), 'Ih corner A: the icosahedron (inradius = cos of the vertex–face-centre angle)');
  const lk = { wyA: 0.2, wyB: 0.7, wyC: 0.1, polyLink: true };
  ok(dist3(polyDir(lk, 1), polyDir({ polyA: 0.2, polyB: 0.7, polyC: 0.1 }, 1)) < 1e-12, 'Link takes the vertex weights from the Wythoff centre');
  ok(specKey(specOf(sceneUniforms({ ...defaults(), shape: 12, polyA: 0.3 }))) === specKey(specOf(sceneUniforms({ ...defaults(), shape: 12, polyA: 0.9, polyE: true }))), 'polyhedron weights and parts are uniforms');
}

section('shapes at every level');
{
  const base = { ...defaults(), ...BIOMES.octa.v, bailout: 1e6, iterations: 7 };
  const lvl = m => ({ ...base, lvMode: m, lvShape: 7, lvR: 0.5, lvT: 0.06, lvOX: 0.4, lvOY: 0.1 });
  const m0 = makeDE(base).local, mU = makeDE(lvl(1)).local, mS = makeDE({ ...lvl(2), lvK: 0.2 }).local, mC = makeDE(lvl(3)).local, mI = makeDE(lvl(4)).local;
  const mE = makeDE({ ...lvl(1), lvFrom: 3, lvUntil: 3 }).local;
  let order = true, empty = 0, lip = 0, changed = 0;
  for (let i = 0; i < 400; i++) {
    const p = rv(2.2), d0 = m0(p).d;
    order = order && mS(p).d <= mU(p).d + 1e-12 && mU(p).d <= d0 + 1e-12 && mC(p).d >= d0 - 1e-12 && mI(p).d >= d0 - 1e-12;
    empty = Math.max(empty, Math.abs(mE(p).d - d0));
    if (Math.abs(mU(p).d - d0) > 1e-6) changed++;
    const q = p.map(x => x + (rnd() - 0.5) * 0.05);
    for (const m of [mU, mS, mC, mI]) lip = Math.max(lip, Math.abs(m(p).d - m(q).d) / dist3(p, q));
  }
  ok(order, 'smooth union ≤ union ≤ final shape ≤ carve, intersect');
  ok(empty === 0 && changed > 20, `an empty level range changes nothing; a full one does (${changed}/400 points)`);
  ok(lip <= 1 + 1e-7, `union, smooth union, carve and intersect stay 1-Lipschitz (worst ${lip.toFixed(9)})`);
  // NewMenger.frag (Offset 0, no rotation) on the folded cell, and the
  // Eidos lattice: periodic fold L = 1, scale 3 about 0, carve a square cross
  // of half-width 1/3 at every level. Same solid (the .frag uses Chebyshev
  // distances, so compare signs).
  const newMenger = (p, n) => {
    p = p.map(x => x * 0.5 + 0.5);
    let pp = p.map(x => Math.abs(x - 0.5) - 0.5), k = 1, d = Math.max(...pp);
    for (let i = 0; i < n; i++) {
      const pa = p.map(x => fmod(3 * x * k, 3)); k *= 3;
      pp = pa.map(x => 0.5 - Math.abs(x - 1.5));
      d = Math.max(d, Math.min(Math.max(pp[0], pp[2]), Math.max(pp[0], pp[1]), Math.max(pp[1], pp[2])) / k);
    }
    return d;
  };
  const fmod = (x, y) => x - y * Math.floor(x / y);
  const tri = x => Math.abs(fmod(x - 1, 4) - 2) - 1;
  const lat = { ...defaults(), ...stackValues('a', [{ t: T.PERIOD, lx: 1, ly: 1, lz: 1 }]), scale: 3, centerX: 0, centerY: 0, centerZ: 0,
    shape: 1, shapeR: 10, lvMode: 3, lvShape: 10, lvR: 1 / 3, iterations: 4, bailout: 1e6 };
  const mL = makeDE(lat).local;
  let bad = 0, n = 0;
  for (let i = 0; i < 3000; i++) {
    const p = rv(5), ref = newMenger(p.map(tri), 4), d = mL(p).d;
    if (Math.abs(ref) < 1e-4 || Math.abs(d) < 1e-6) continue;
    n++; if (Math.sign(ref) !== Math.sign(d)) bad++;
  }
  ok(n > 2000 && bad === 0, `periodic fold + carved square cross = NewMenger's sponge, tiled (${n} points, ${bad} disagree)`);
  // SphereSponge.frag: d = max over levels of (Bubble − |mod(z·k, 4) − 2|)/k,
  // z offset by (1, 1, 1), k = 2·3^i: the same lattice with a sphere carved.
  const sphereSponge = (z, n, B) => {
    z = z.map(x => x + 1);
    let k = 2, d = 0;
    for (let l = 0; l < n; l++) { const p2 = z.map(x => fmod(x * k, 4) - 2); d = Math.max(d, (B - Math.hypot(...p2)) / k); k *= 3; }
    return d;
  };
  const B = 2.07;
  const sp = { ...lat, lvShape: 0, lvR: B / 2 };
  const mSp = makeDE(sp).local;
  bad = 0; n = 0;
  for (let i = 0; i < 3000; i++) {
    const p = rv(5), ref = sphereSponge(p, 4, B), d = mSp(p).d;
    if (Math.abs(ref) < 1e-4 || Math.abs(d) < 1e-6) continue;
    n++; if ((ref > 0) !== (d > 0)) bad++;
  }
  ok(n > 2000 && bad === 0, `periodic fold + carved sphere = SphereSponge (${n} points, ${bad} disagree)`);
  // Knighty's iterated polyhedra: d = min over levels of D(fold(pos))·Scale⁻ⁱ
  // — a level union of the polyhedron with no other folds.
  ok(specKey(specOf(sceneUniforms(lvl(1)))) !== specKey(specOf(sceneUniforms(base))) && specKey(specOf(sceneUniforms({ ...lvl(1), lvR: 0.9, lvFrom: 2 }))) === specKey(specOf(sceneUniforms(lvl(1)))), 'level mode and shape compiled in; sizes and ranges are uniforms');
  ok(LEVEL_MODES.length === 5 && near(smin(1, 2, 0), 1) && smin(1, 1, 0.5) < 1, 'smooth min');
}

// ── FragM preset ports ──────────────────────────────────────────────────────
// Each preset against its .frag DE loop, transcribed (rotationMatrix3 as
// Fragmentarium builds it: column-major, so `rot * z` turns by −angle).
section('fragm ports');
{
  const fragRot = (axis, deg) => { // the GLSL mat3 as a JS function of `rot * z`
    const l = Math.hypot(...axis), [x, y, z] = axis.map(a => a / l), c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), C = 1 - c;
    const col = [[c + C * x * x, C * x * y - s * z, C * x * z + s * y], [C * x * y + s * z, c + C * y * y, C * y * z - s * x], [C * x * z - s * y, C * y * z + s * x, c + C * z * z]];
    return { mul: v => [0, 1, 2].map(r => col[0][r] * v[0] + col[1][r] * v[1] + col[2][r] * v[2]), // rot * v
      pre: v => [0, 1, 2].map(r => col[r][0] * v[0] + col[r][1] * v[1] + col[r][2] * v[2]) }; // v * rot
  };
  const compare = (key, ref, R = 1.6, o = {}) => {
    const v = { ...defaults(), ...BIOMES[key].v, ...o };
    const m = makeDE(v).local;
    let w = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const p = rv(R), a = m(p).d, b = ref(p);
      if (!Number.isFinite(b)) continue;
      w = Math.max(w, Math.abs(a - b) / Math.max(Math.abs(b), 1e-6)); n++;
    }
    ok(n > 300 && w < 1e-9, `${BIOMES[key].label}: matches the .frag DE (worst rel ${w.toExponential(1)})`);
  };
  // Knighty, Koch01.frag
  const kr = fragRot([0.25, 0.43333, 0.5], 0); // its preset: RotAngle 0
  compare('koch', p => {
    let z = [...p], n = 0;
    const O = [2, 0.54944, -0.06592], S = 2.37624, Y = 0.333333;
    while (n < 12 && dot(z, z) < 10000) {
      z = [Math.abs(z[0]), Math.abs(z[1]), z[2]];
      if (z[1] > z[0]) z = [z[1], z[0], z[2]];
      z[1] = Y - Math.abs(z[1] - Y);
      z[0] += 1 / 3; if (z[2] > z[0]) z = [z[2], z[1], z[0]]; z[0] -= 1 / 3;
      z[0] -= 1 / 3; if (z[2] > z[0]) z = [z[2], z[1], z[0]]; z[0] += 1 / 3;
      z = z.map((x, j) => S * (x - O[j]) + O[j]);
      z = kr.mul(z);
      n++;
    }
    return Math.abs(Math.hypot(...z) - Math.hypot(...O)) * S ** -n;
  }, 2.5);
  // Kali, Treebroccoli.frag (its preset)
  const br = fragRot([0.2174, 1, 0.02174], 93.2544);
  compare('broccoli', p => {
    let z = [...p];
    const F = [0.13008, 0.04564315], J = [-0.03034482, -0.80827584, -0.15862068], S = 1.44915;
    let l = 0;
    for (let i = 0; i < 20; i++) {
      z = br.pre(z);
      z = [Math.abs(z[0] + F[0]) - F[0], Math.abs(z[1] + F[1]) - F[1], z[2]];
      z = z.map((x, j) => x * S + J[j]);
      l = Math.hypot(...z);
    }
    return l * S ** -20;
  }, 1.6, { bailout: 1e6 });
  // Syntopia, Kaleidoscopic IFS/Octahedron.frag
  compare('synocta', p => {
    let z = [...p];
    for (let n = 0; n < 13; n++) {
      if (z[0] + z[1] < 0) z = [-z[1], -z[0], z[2]];
      if (z[0] + z[2] < 0) z = [-z[2], z[1], -z[0]];
      if (z[0] - z[1] < 0) z = [z[1], z[0], z[2]];
      if (z[0] - z[2] < 0) z = [z[2], z[1], z[0]];
      z = z.map((x, j) => x * 2 - [1, 0, 0][j]);
    }
    return Math.hypot(...z) * 2 ** -13;
  }, 1.6, { bailout: 1e6 });
  // Syntopia, Kaleidoscopic IFS/Dodecahedron.frag (Phi exact). The .frag
  // returns |z|·Scale^(−n−1), one extra 1/Scale for points that never bail
  // out, so compare the folded point instead.
  {
    const PHI = (1 + Math.sqrt(5)) / 2, S = 2.617924;
    const N = [[-1, PHI - 1, 1 / (PHI - 1)], [PHI - 1, 1 / (PHI - 1), -1], [1 / (PHI - 1), -1, PHI - 1]].map(normalize);
    const v = { ...defaults(), ...BIOMES.syndodeca.v, iterations: 6, bailout: 1e9 };
    const m = makeDE(v).local;
    let w = 0;
    for (let i = 0; i < 300; i++) {
      const p = rv(1.5);
      let z = [...p];
      for (let n = 0; n < 6; n++) {
        for (let k = 0; k < 9; k++) { const nn = N[k % 3], t = Math.min(0, dot(z, nn)); z = z.map((x, j) => x - 2 * t * nn[j]); }
        z = z.map(x => x * S - (S - 1));
      }
      w = Math.max(w, dist3(m(p).z, z) / (1 + Math.hypot(...z)));
    }
    ok(w < 1e-9, `${BIOMES.syndodeca.label}: same fold sequence as the .frag (worst ${w.toExponential(1)})`);
  }
  // Tryptophan, MultiIFS.frag (default, Mode 0)
  compare('multiifs', p => {
    const J = [0.0495, -0.14852, 0.28712], F = [0, 0, -0.45098], O = [-0.21976 + 1, 0.92304, 0.04392], S = 2;
    let z = [...p];
    for (let n = 0; n < 6; n++) {
      z = z.map(Math.abs);
      if (z[0] < z[1]) z = [z[1], z[0], z[2]];
      if (z[0] < z[2]) z = [z[2], z[1], z[0]];
      if (z[1] < z[2]) z = [z[0], z[2], z[1]];
      z = z.map((x, j) => x + J[j]);
      if (z[0] + z[1] < 0) z = [-z[1], -z[0], z[2]];
      if (z[0] - z[1] < 0) z = [z[1], z[0], z[2]];
      if (z[0] - z[2] < 0) z = [z[2], z[1], z[0]];
      z = z.map((x, j) => Math.abs(x + F[j]) - F[j]);
      z = z.map((x, j) => x - J[j]);
      z = z.map((x, j) => x * S - O[j] * (S - 1));
    }
    const d = z.map(x => Math.abs(x) - 1);
    return (Math.min(Math.max(...d), 0) + Math.hypot(...d.map(x => Math.max(x, 0)))) * S ** -6;
  }, 2.5, { bailout: 1e6 });
}

// ── Symmetry ────────────────────────────────────────────────────────────────
// The DE of each group's stack is invariant under that group's operations.
section('symmetry');
{
  const axisRot = (ax, th) => { const [x, y, z] = normalize(ax), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
    return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C]; };
  const mv = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
  const PHI = (1 + Math.sqrt(5)) / 2;
  const cases = [
    ['Icosahedral flake: 5-fold about a vertex', 'icosa', p => mv(axisRot([0, 1, PHI], 2 * Math.PI / 5), p)],
    ['Icosahedral flake: 3-fold about (1,1,1)', 'icosa', p => mv(axisRot([1, 1, 1], 2 * Math.PI / 3), p)],
    ['Icosahedral flake: 2-fold about z', 'icosa', p => [-p[0], -p[1], p[2]]],
    ['Octahedral flake: axis permutation + sign flip', 'octa', p => [-p[2], p[0], p[1]]],
    ['Menger: 4-fold about y', 'menger', p => [p[2], p[1], -p[0]]],
    ['Sierpinski: mirror x + y = 0', 'sierpinski', p => [-p[1], -p[0], p[2]]],
    ['Hexagonal drum: 6-fold about z', 'hex', p => mv(axisRot([0, 0, 1], Math.PI / 3), p)],
    ['Twisted icosahedral (chiral): 5-fold about a vertex', 'chiralico', p => mv(axisRot([0, 1, PHI], 2 * Math.PI / 5), p)],
    ['Snub octahedral (chiral): 4-fold about x', 'snub', p => mv(axisRot([1, 0, 0], Math.PI / 2), p)],
    ['Pentagonal pinwheel: 5-fold about z', 'pinwheel', p => mv(axisRot([0, 0, 1], 2 * Math.PI / 5), p)],
  ];
  for (const [name, key, g] of cases) {
    const m = makeDE({ ...defaults(), ...BIOMES[key].v }).local;
    let w = 0;
    for (let i = 0; i < 300; i++) { const p = rv(2); w = Math.max(w, Math.abs(m(p).d - m(g(p)).d)); }
    ok(w < 1e-9, `${name} (max diff ${w.toExponential(1)})`);
  }
  // Chiral shapes are handed: their mirror image is a different shape.
  for (const [key, mir] of [['chiralico', p => [-p[0], p[1], p[2]]], ['snub', p => [p[0], p[1], -p[2]]], ['pinwheel', p => [p[0], -p[1], p[2]]]]) {
    const m = makeDE({ ...defaults(), ...BIOMES[key].v }).local;
    let w = 0;
    for (let i = 0; i < 300; i++) { const p = rv(2); w = Math.max(w, Math.abs(m(p).d - m(mir(p)).d)); }
    ok(w > 1e-3, `${BIOMES[key].label}: not mirror-symmetric (it is handed; max diff ${w.toFixed(3)})`);
  }
  for (let i = 0; i < SYMMETRY_GROUPS.length; i++) {
    const v = { ...defaults(), ...symmetryValues(i) };
    const s = viewScore({ ...v, rotX: 0.6, rotY: -0.4, dist: 3.5 }, 9);
    ok(s.hitFrac > 0.04 && s.clearance > 0.02, `symmetry group "${SYMMETRY_GROUPS[i].name.split('  ')[0]}" gives a visible shape (${(s.hitFrac * 100).toFixed(0)}% of rays hit)`);
  }
}

// ── Compilation keys ────────────────────────────────────────────────────────
section('spec keys');
{
  const base0 = defaults();
  const k = v => specKey(specOf(sceneUniforms(v)));
  ok(k(base0) === k({ ...base0, scale: 2.7, centerX: 0.3, alpha: 0.2, a1cw: 1.5 }), 'continuous values never change the program');
  ok(k(base0) !== k({ ...base0, a1t: T.OCTA }), 'step type changes the program');
  ok(k({ ...base0, a1t: T.ABS, a1abs: 0 }) !== k({ ...base0, a1t: T.ABS, a1abs: 2 }), 'abs mask is compiled in');
  ok(k({ ...base0, a1t: T.PLANE, a1abs: 0 }) === k({ ...base0, a1t: T.PLANE, a1abs: 3 }), "another type's option does not split the cache");
  ok(k(base0) === k({ ...base0, a3t: T.ICOSA }), 'steps after an Off slot are ignored (hidden in the panel)');
  ok(k(base0) === k({ ...base0, b1t: T.ICOSA }), 'Stack B is ignored while the schedule is Off');
  ok(k({ ...base0, hybridMode: 1 }) !== k(base0) && k({ ...base0, hybridMode: 1 }) === k({ ...base0, hybridMode: 3 }), 'hybrid schedule mode is a uniform; Stack B on/off is compiled');
  ok(k({ ...base0, shape: 1 }) !== k(base0), 'DE shape is compiled in');
  const su = sceneUniforms({ ...base0, a2t: T.PLANE, a2nx: 3, a2ny: 4, a2nz: 0, a2k: 0.5 });
  ok(near(Math.hypot(...su.u_a2p.slice(0, 3)), 1, 1e-12) && su.u_a2q[0] === 0.5, 'plane normal is normalised, strength sent');
  ok(!('u_a3q' in su), 'no uniforms for steps the program does not contain');
}

// ── Hybrid schedules & colouring ────────────────────────────────────────────
section('hybrids & colour');
{
  const seqOf = v => Array.from({ length: 12 }, (_, i) => (hybridUsesB(v)(i) ? 'B' : 'A')).join('');
  ok(seqOf({ hybridMode: 1, hybN: 3 }) === 'AABAABAABAAB', 'B every 3rd iteration');
  ok(seqOf({ hybridMode: 2, hybN: 4 }) === 'AAAABBBBBBBB', 'A for 4 iterations, then B');
  ok(seqOf({ hybridMode: 3, hybLen: 5, hybP2: true, hybP5: true }) === 'ABAABABAABAB', 'pattern ABAAB repeats');
  ok(seqOf({ hybridMode: 0, hybN: 1 }) === 'AAAAAAAAAAAA', 'schedule off: Stack A only');
  // The hybrid preset really alternates: its DE differs from either stack alone.
  const hv = { ...defaults(), ...BIOMES.hybrid.v };
  const p = [0.31, -0.42, 0.77];
  const dH = makeDE(hv)(p).d, dA = makeDE({ ...hv, hybridMode: 0 })(p).d, dB = makeDE({ ...hv, hybridMode: 2, hybN: 0 })(p).d;
  ok(dH !== dA && dH !== dB, 'hybrid DE differs from Stack A or Stack B alone');
  // Per-step traps: Σ weight × min |z|² after that step.
  const cv = { ...defaults(), ...BIOMES.coral.v, colorSource: 3, a1cw: 2, a2cw: 0, a3cw: 0.5, a4cw: 0 };
  const m = makeDE(cv);
  const r = m.local([0.2, 0.1, -0.3]);
  ok(Number.isFinite(r.trap) && r.trap > 0, 'per-step orbit traps give a finite colour index');
  ok(makeDE({ ...cv, a1cw: 0, a3cw: 0 }).local([0.2, 0.1, -0.3]).trap === 0, 'zero weights → zero per-step colour');
  const fc = makeDE({ ...defaults(), ...BIOMES.menger.v, colorSource: 1, foldColW: 1, colorIters: 3 }).local([0.4, 0.2, 0.9]);
  ok(fc.trap === fc.folds * 2.5 && Number.isInteger(fc.folds), `fold count colour = weighted reflections (${fc.folds})`);
}

// ── Shader compilation (every step × option × render mode) ──────────────────
section('glsl');
{
  const probe = spawnSync('glslangValidator', ['--version']);
  if (probe.status === 0) {
    let bad = 0, n = 0;
    const combos = [];
    for (const st of ALL_STEPS) for (const mode of [0, 1, 2]) combos.push([{ A: [{ k: 1, ...st }], B: null, shape: (st.t + st.o) % 4 }, { mode, texLod: mode !== 1 }]);
    for (let shape = 0; shape < SHAPES.length; shape++) for (const mode of [0, 1, 2]) combos.push([{ A: [], B: null, shape }, { mode }]);
    for (const st of SMOOTH_STEPS) combos.push([{ A: [{ k: 1, ...st }], B: null, shape: st.t % 4 }, { mode: st.o % 3 }]);
    for (let m = 1; m < LEVEL_MODES.length; m++) for (let ls = 0; ls < SHAPES.length; ls++)
      combos.push([{ A: [{ k: 1, t: T.OCTA, o: 0 }], B: null, shape: (ls * 3 + m) % SHAPES.length, lv: { m, s: ls } }, { mode: (m + ls) % 3, mat: ls % 2 === 0 }]);
    const big = ALL_STEPS.slice(0, 12).map((s, i) => ({ k: i + 1, ...s }));
    const bigB = ALL_STEPS.slice(12, 20).map((s, i) => ({ k: i + 1, ...s }));
    for (const mode of [0, 1, 2]) for (const mat of [false, true]) for (const extra of [{}, { rep: true, dz: true, xl: true }])
      combos.push([{ A: big, B: bigB, shape: mode + 1 }, { mode, mat, texLod: mat, ...extra }], [{ A: big.slice(0, 3), B: [], shape: 0 }, { mode, mat, ...extra }]);
    for (const [spec, opts] of combos) {
      writeFileSync('/tmp/eidos-combo.frag', '#version 100\n' + fractalFrag(spec, opts));
      const r = spawnSync('glslangValidator', ['/tmp/eidos-combo.frag']);
      n++;
      if (r.status !== 0) { bad++; console.log(`   glslang fail ${JSON.stringify(spec)} ${JSON.stringify(opts)}:\n${r.stdout}`); }
    }
    ok(bad === 0, `glslangValidator: all ${n} specialised programs compile`);
    console.log(`    glslang: ${n} specialised programs compiled`);
  } else console.log('    (glslangValidator not found — skipping per-program shader check)');
}

// ── Rotations ───────────────────────────────────────────────────────────────
section('rotations');
{
  const b0 = { ...defaults(), ...BIOMES.octa.v };
  const p0 = [0.41, -0.33, 0.27];
  const d0 = makeDE(b0)(p0).d;
  ok(makeDE({ ...b0, spinX: 0.2, preAlpha: 0.5, alpha: 0.3, rotStart: 99 })(p0).d === d0, 'rotStart past iterations disables all rotations');
  ok(makeDE({ ...b0, preAlpha: 0.4 })(p0).d !== d0, 'pre-rotation changes the DE');
  ok(makeDE({ ...b0, alpha: 0.4 })(p0).d !== d0, 'post-rotation changes the DE');
  ok(makeDE({ ...b0, beta: 0.4, postRotC: true })(p0).d !== makeDE({ ...b0, beta: 0.4 })(p0).d, 'post-rotation pivot matters');
  ok(makeDE({ ...b0, spinZ: 0.1 })(p0).d !== d0, 'iteration spin changes the DE');
  ok(makeDE({ ...b0, iterations: 1, spinZ: 0.3 })(p0).d === makeDE({ ...b0, iterations: 1 })(p0).d, 'spin starts at identity');
  ok(makeDE({ ...b0, scaleStep: 0.05 })(p0).d !== d0 && makeDE({ ...b0, centerStepY: 0.05 })(p0).d !== d0, 'per-iteration scale and centre drift change the DE');
  ok(makeDE({ ...b0, iterations: 1, scaleStep: 0.05, centerStepY: 0.05 })(p0).d === makeDE({ ...b0, iterations: 1 })(p0).d, 'variation starts at iteration 0 with the base values');
}

// ── Sequencer ───────────────────────────────────────────────────────────────
section('sequencer');
{
  const sq = new Sequencer();
  const k = (o) => ({ ...base, ...o });
  sq.add(k({ dist: 2, rotX: 3.0, palette: 1, lightColor: '#000000', iterations: 10 }));
  sq.add(k({ dist: 4, rotX: -3.0, palette: 5, lightColor: '#ffffff', iterations: 20 }));
  sq.add(k({ dist: 8, rotX: -2.0, palette: 2, lightColor: '#ff0000', iterations: 30 }));
  const seg = 2;
  for (const ease of [EASE.LINEAR, EASE.SMOOTH, EASE.EASE]) {
    ok(near(sq.sample(0, seg, MODE.ONCE, ease).dist, 2), `ease ${ease}: key0 exact`);
    ok(near(sq.sample(seg, seg, MODE.ONCE, ease).dist, 4), `ease ${ease}: key1 exact`);
    ok(near(sq.sample(2 * seg, seg, MODE.ONCE, ease).dist, 8), `ease ${ease}: key2 exact`);
  }
  const mid = sq.sample(seg / 2, seg, MODE.ONCE, EASE.LINEAR);
  ok(near(mid.dist, 3), 'linear midpoint');
  ok(near(Math.abs(mid.rotX), Math.PI, 1e-9), `angle takes shortest arc through ±π (got ${mid.rotX})`);
  ok(mid.palette === 1, 'step params latch from start key');
  ok(mid.iterations === 15, 'int params rounded');
  ok(mid.lightColor === '#808080', `colour lerp (${mid.lightColor})`);
  ok(sq.duration(seg, MODE.ONCE) === 4 && sq.duration(seg, MODE.LOOP) === 6 && sq.duration(seg, MODE.PINGPONG) === 8, 'durations');
  const lp = sq.sample(6, seg, MODE.LOOP, EASE.SMOOTH);
  ok(near(lp.dist, 2, 1e-9), 'loop closes back onto key0');
  const lpm = sq.sample(5, seg, MODE.LOOP, EASE.LINEAR);
  ok(near(lpm.dist, 5), 'loop closing segment interpolates last→first');
  const pp1 = sq.sample(3, seg, MODE.PINGPONG, EASE.LINEAR), pp2 = sq.sample(5, seg, MODE.PINGPONG, EASE.LINEAR);
  ok(near(pp1.dist, pp2.dist), 'ping-pong symmetric');
  // Catmull-Rom can overshoot; hard limits must still hold.
  const s2 = new Sequencer();
  s2.add(k({ dist: 0.001 })); s2.add(k({ dist: 10 })); s2.add(k({ dist: 0.001 }));
  let minD = Infinity;
  for (let t = 0; t <= 4; t += 0.01) minD = Math.min(minD, s2.sample(t, 2, MODE.ONCE, EASE.SMOOTH).dist);
  ok(minD >= PARAM_BY_ID.get('dist').hardMin, 'catmull overshoot clamped by hard limits');
  // playback advance
  sq.play();
  let last = null;
  for (let i = 0; i < 1000 && sq.playing; i++) last = sq.update(0.01, seg, MODE.ONCE, EASE.LINEAR);
  ok(!sq.playing && near(last.dist, 8), 'once-mode stops on last key');
  // keyframes keep fly target (v1 dropped it)
  const s3 = new Sequencer(); s3.add(k({ targetX: 1.5 }));
  ok(s3.keys[0].targetX === 1.5, 'keyframe captures fly target');
  ok(s3.keys[0].maxSamples === undefined, 'keyframe excludes quality settings');
}

// ── State ───────────────────────────────────────────────────────────────────
section('state');
{
  const st = new State();
  const v0 = st.version;
  st.set('maxSamples', 10);
  ok(st.version === v0, 'noReset params do not restart accumulation');
  st.set('scale', 2.5);
  ok(st.version === v0 + 1, 'render params bump version');
  ok(!st.set('scale', 2.5), 'unchanged set is a no-op');
  ok(!st.set('scale', NaN) && st.get('scale') === 2.5, 'NaN ignored');
}

// ── Discovery codec / project ───────────────────────────────────────────────
section('discovery');
{
  ok(decodeDiscovery(encodeDiscovery(base)).scale === base.scale, 'defaults round-trip');
  ok(encodeDiscovery(defaults()) === 'EIDOS1:e30', 'defaults encode to empty object');
  for (let trial = 0; trial < 50; trial++) {
    const v = { ...base };
    for (const p of PARAMS) {
      if (Math.random() < 0.5) continue;
      if (p.type === 'bool') v[p.id] = Math.random() < 0.5;
      else if (p.type === 'select') v[p.id] = Math.floor(Math.random() * p.options.length);
      else if (p.type === 'color') v[p.id] = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      else v[p.id] = coerce(p, p.min + Math.random() * (p.max - p.min)) ?? p.def;
    }
    const back = decodeDiscovery(encodeDiscovery(v));
    let same = true;
    for (const p of PARAMS) {
      const a = v[p.id], b = back[p.id];
      if (typeof a === 'number' ? Math.abs(a - b) > Math.abs(a) * 1e-6 + 1e-9 : a !== b) { same = false; console.log('   mismatch', p.id, a, b); }
    }
    ok(same, `random round-trip ${trial}`);
  }
  let threw = false;
  try { decodeDiscovery('hello'); } catch { threw = true; }
  ok(threw, 'junk rejected');
  const evil = decodeDiscovery('{"iterations": 1e9, "bogus": 1, "lightColor": "javascript:"}');
  ok(evil.iterations === 250 && !('bogus' in evil) && evil.lightColor === base.lightColor, 'hostile values sanitised');
  const proj = makeProject({ ...base, scale: 1.7 }, [{ dist: 3 }, { dist: 4 }]);
  const pp = parseProject(JSON.stringify(proj));
  ok(pp.params.scale === 1.7 && pp.keyframes.length === 2, 'project round-trip');
}


section('object transform');
{
  const { PARAMS } = await import('./lib.mjs');
  const defs = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
  const { eulerDeg, mat3MulVec } = await import('./lib.mjs');
  const base = { ...defs };
  const xf = { ...defs, objX: 0.7, objY: -0.4, objZ: 1.1, objRotX: 25, objRotY: -40, objRotZ: 15, objScale: 1.7 };
  const m0 = makeDE(base), m1 = makeDE(xf);
  const R = eulerDeg(25, -40, 15);
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const q = [Math.sin(i * 1.3) * 2, Math.cos(i * 0.7) * 2, Math.sin(i * 2.1) * 2];
    // Placing local point q at world p = pos + s·R·q must give s × the untransformed DE.
    const p = mat3MulVec(R, q).map((x, k) => x * 1.7 + [0.7, -0.4, 1.1][k]);
    const a = m1(p).d, b = m0(q).d * 1.7;
    worst = Math.max(worst, Math.abs(a - b) / Math.max(1e-9, Math.abs(b)));
  }
  ok(worst < 1e-6, `object transform: DE(pos + s·R·q) = s·DE(q) at 200 points (worst rel ${worst.toExponential(1)})`);
  ok(makeDE(base) && makeDE({ ...defs, objScale: 1 }).length === makeDE(base).length, 'identity transform keeps the plain DE');
}


section('mutation grid / textures / materials');
{
  const { breed } = await import('./lib.mjs');
  const { TEX_GEN, TEX_KEYS } = await import('./lib.mjs');
  const { BIOMES } = await import('./lib.mjs');
  const parent = { ...defaults(), ...BIOMES.sierpinski.v };
  const kids = breed(parent, 8, 0.08);
  ok(kids.length === 8 && kids.every(k => Object.keys(k).length >= 1), `breed: 8 children, each changes ≥1 gene (${kids.map(k => Object.keys(k).length).join(',')})`);
  ok(kids.every(k => Object.keys(k).every(id => PARAM_BY_ID.get(id)?.mutate)), 'breed only touches mutable parameters');
  const usable = kids.filter(k => { const s = viewScore({ ...parent, ...k }, 4); return s.clearance > 0.02 && s.hitFrac > 0.01; }).length;
  ok(usable >= 6, `breed: ${usable}/8 children keep a usable view`);
  ok(new Set(kids.map(k => JSON.stringify(k))).size === 8, 'breed: children are all different');
  const locked = breed(parent, 12, 0.1, { lockColour: true });
  ok(locked.every(k => !('colorShift' in k)), 'Lock colour keeps colorShift out of the mutations');
  const pl = breed({ ...parent, a2t: 6 }, 30, 0.1).some(k => Object.keys(k).some(id => /^a2(nx|ny|nz|d)$/.test(id)));
  ok(pl, 'a custom plane step joins the mutation pool once it is in the stack');
  ok(!breed(parent, 30, 0.1).some(k => Object.keys(k).some(id => /^a[2-9]|^a1[0-2]|^b\d/.test(id))), 'hidden (inactive) step controls are never mutated');

  // Procedural textures must tile: value at x = 1 equals x = 0 (and y).
  for (const key of TEX_KEYS.slice(1)) {
    const f = TEX_GEN[key]();
    let worst = 0, range = 0;
    for (let i = 0; i < 64; i++) {
      const u = i / 64;
      const a = f(0, u), b = f(1, u), c = f(u, 0), d = f(u, 1);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]), Math.abs(c[k] - d[k]));
      const g = f(u, (u * 7.3) % 1); range = Math.max(range, Math.abs(g[0] - a[0]) + Math.abs(g[1] - a[1]));
    }
    ok(worst < 1e-9 && range > 0.02, `texture ${key}: tiles seamlessly (edge mismatch ${worst.toExponential(1)}) and is not flat`);
  }

  // Shader: material / texture / crease code is opt-in — the classic path is untouched.
  // Material code is compiled in only for HAS_MAT programs; the classic build
  // must not contain any of it (it is the v2.15 shader exactly).
  const live = src => {
    const out = [], st = [];
    for (const line of src.split('\n')) {
      const t = line.trim(), on = st.every(x => x);
      if (/^#ifdef HAS_MAT\b/.test(t)) { st.push(!!/^#define HAS_MAT/m.test(src)); continue; }
      if (/^#if/.test(t)) { st.push(true); if (on) out.push(line); continue; }
      if (/^#endif/.test(t)) { st.pop(); if (on) out.push(line); continue; }
      if (/^#else/.test(t) && st.length) { if (on) out.push(line); continue; }
      if (on) out.push(line);
    }
    return out.join('\n').replace(/\/\/.*$/gm, '');
  };
  for (const mode of [0, 1, 2]) {
    const cls = live(fractalFrag(undefined, { mode })), mat = live(fractalFrag(undefined, { mode, mat: true }));
    ok(!/HAS_MAT|u_matOn|evalSurface|g_texProbe|u_texMode/.test(cls), `mode ${mode}: classic build has no material code`);
    ok(/#define HAS_MAT/.test(fractalFrag(undefined, { mode, mat: true })) && /u_matOn/.test(mat), `mode ${mode}: material build defines HAS_MAT`);
    // D3D (Windows WebGL) inlines every map() call: keep the material build's extra call sites few.
    const calls = x => (x.match(/[^\w.]map\(/g) || []).length;
    const extra = calls(mat) - calls(cls);
    ok(extra <= 4, `mode ${mode}: material build adds ${extra} map() call sites (≤ 4)`);
  }
  const su1 = sceneUniforms({ ...defaults(), texMode: 1 }), su2 = sceneUniforms({ ...defaults(), creaseAmt: 0.2 }), su3 = sceneUniforms({ ...defaults(), matOn: true });
  ok(!sceneUniforms(defaults()).__mat && su1.__mat && su2.__mat && su3.__mat, 'material build only when materials, texture or crease is on');
  const { specOf, specKey } = await import('./lib.mjs');
  ok(specKey(specOf(su1)) !== specKey(specOf(sceneUniforms(defaults()))), 'material build gets its own program key');
  const su0 = sceneUniforms(defaults());
  ok(su0.u_matOn === false && su0.u_texMode === 0 && su0.u_crease === 0, 'materials, texture and crease are off by default');
  let pt;
  ok((pt = fractalFrag(undefined, { mode: 1, mat: true })).includes('thinFilm(max(dot(n, -rd), 0.0), mt.iridT)') && pt.includes('exitSolid(p - n * eN * 2.0, dir, eN, ok)'), 'path tracer has the film and glass lobes');
}


section('extra lights');
{
  const { fractalFrag: ff } = await import('./lib.mjs');
  const { specOf, specKey } = await import('./lib.mjs');
  const strip = (src, defs) => {
    const out = [], st = [];
    for (const line of src.split('\n')) {
      const t = line.trim(), on = st.every(x => x);
      const m = t.match(/^#ifdef (\w+)/);
      if (m) { st.push(defs.includes(m[1]) || m[1] === 'HAS_TEX_LOD'); continue; }
      if (/^#if/.test(t)) { st.push(true); if (on) out.push(line); continue; }
      if (/^#else/.test(t)) { const top = st.pop(); st.push(!top); continue; }
      if (/^#endif/.test(t)) { st.pop(); continue; }
      if (on) out.push(line);
    }
    return out.join('\n').replace(/\/\/.*$/gm, '');
  };
  const sites = (x, fn) => (x.match(new RegExp(`[^\\w.]${fn}\\(`, 'g')) || []).length;
  for (const mode of [0, 1, 2]) {
    const cls = strip(ff(undefined, { mode }), []), xl = strip(ff(undefined, { mode, xl: true }), ['HAS_XLIGHTS']);
    const both = strip(ff(undefined, { mode, xl: true, mat: true }), ['HAS_XLIGHTS', 'HAS_MAT']);
    ok(!/u_l2Pos|extraLights|xvol/.test(cls), `mode ${mode}: classic build has no extra-light code`);
    ok(/u_l2Pos/.test(xl) && /#define HAS_XLIGHTS/.test(ff(undefined, { mode, xl: true })), `mode ${mode}: light build defines HAS_XLIGHTS`);
    // D3D (Windows) inlines every call: keep the extra shadow-ray sites few.
    const extraShadow = sites(xl, 'softShadow') + sites(xl, 'shadowVis') - sites(cls, 'softShadow') - sites(cls, 'shadowVis');
    ok(extraShadow <= 2, `mode ${mode}: extra lights add ${extraShadow} shadow-ray call sites (≤ 2)`);
    const extraMap = sites(both, 'map') - sites(cls, 'map');
    ok(extraMap <= 4, `mode ${mode}: materials + lights add ${extraMap} map() call sites (≤ 4)`);
  }
  const d = defaults();
  const off = sceneUniforms(d);
  ok(!off.__xl && off.u_lOn[0] === 0 && off.u_lOn[1] === 0, 'extra lights are off by default (classic program)');
  const on = sceneUniforms({ ...d, light2On: true, light2Color: '#ff0000', light2Int: 2, light3On: false });
  ok(on.__xl && on.u_lOn[0] === 1 && Math.abs(on.u_l2Col[0] - 2) < 1e-9 && on.u_l2Col[1] === 0, 'Light 2 colour × intensity reaches the shader');
  ok(on.u_l2Pos[0] === d.light2X && on.u_l2Pos[1] === d.light2Y && on.u_l2Pos[2] === d.light2Z, 'Light 2 sits at its world position');
  const rel = sceneUniforms({ ...d, light3On: true, light3Relative: true, light3X: 0, light3Y: 0, light3Z: 0 });
  ok(rel.u_l3Pos.every((c, i) => Math.abs(c - rel.u_camPos[i]) < 1e-9), 'Light 3 "Follows Camera" at offset 0 sits on the camera');
  ok(specKey(specOf(on)) !== specKey(specOf(off)) && specKey(specOf(on)).endsWith('|xl'), 'light build gets its own program key');
  ok(['light2On', 'light2X', 'light2Color', 'light2Int', 'light2Shadows', 'light2Relative', 'light3On', 'light3Z'].every(id => PARAM_BY_ID.get(id)?.group === 'light'), 'Light 2 / 3 controls live in Atmosphere & Light');
}


section('repetition / deep zoom');
{
  const { effectiveIterations } = await import('./lib.mjs');
  const { fractalFrag: ff } = await import('./lib.mjs');
  const { specOf, specKey } = await import('./lib.mjs');
  const base = { ...defaults(), iterations: 10 };
  const one = makeDE(base);
  // Grid: the copy in cell (i, j, k) is the original moved by (i·SX, j·SY, k·SZ).
  const grid = { ...base, repMode: 1, repCountX: 2, repCountY: 1, repCountZ: 2, repSpaceX: 6, repSpaceY: 5, repSpaceZ: 7 };
  const g = makeDE(grid);
  let worst = 0;
  for (const [i, j, k] of [[0, 0, 0], [1, 0, -2], [-2, 1, 2], [2, -1, 0]]) {
    for (let n = 0; n < 40; n++) {
      const q = [Math.sin(n) * 1.2, Math.cos(n * 1.3) * 1.2, Math.sin(n * 0.7) * 1.2];
      const p = [q[0] + i * 6, q[1] + j * 5, q[2] + k * 7];
      const a = one(q).d, b = g(p).d;
      if (a < 1.2) worst = Math.max(worst, Math.abs(a - b) / Math.max(a, 1e-9)); // well inside the cell: equal
    }
  }
  ok(worst < 1e-9, `grid: each copy is the original moved into its cell (max rel diff ${worst.toExponential(1)})`);
  // Each copy is cut at its cell walls: the array's distance is never more than
  // its own copy's distance or the distance to the nearest wall (+ the tiny pad),
  // so rays stop at a wall and resume against the next cell's copy.
  let viol = 0;
  for (let n = 0; n < 600; n++) {
    const p = [Math.sin(n * 1.7) * 16, Math.sin(n * 0.37 + 1) * 8, Math.cos(n * 2.3) * 18];
    const idx = [[6, 2], [5, 1], [7, 2]].map(([sp, c], k) => Math.min(Math.max(Math.floor(p[k] / sp + 0.5), -c), c));
    const own = one([p[0] - idx[0] * 6, p[1] - idx[1] * 5, p[2] - idx[2] * 7]).d;
    viol = Math.max(viol, g(p).d - own);
  }
  ok(viol <= 1e-12, `grid: never steps past its own copy (max excess ${viol.toExponential(1)})`);
  // A compact formula spaced wider than its size: identical to the full union of copies.
  const { BIOMES: BB } = await import('./lib.mjs');
  const cbase = { ...defaults(), ...BB.icosa.v };
  // The icosahedral flake reaches 1 from its centre, so spacing 9 keeps every copy inside its cell.
  const cone = makeDE(cbase), cg = makeDE({ ...cbase, repMode: 1, repCountX: 2, repCountY: 1, repCountZ: 2, repSpaceX: 9, repSpaceY: 9, repSpaceZ: 9 });
  // Safe step: inside the ball of radius (array DE) around any point there is
  // no surface of any copy. "Surface" = a copy's own DE below 1e-4.
  const solidGrid = q => {
    const c = [Math.round(q[0] / 9), Math.round(q[1] / 9), Math.round(q[2] / 9)];
    for (let i = c[0] - 1; i <= c[0] + 1; i++) for (let j = c[1] - 1; j <= c[1] + 1; j++) for (let k = c[2] - 1; k <= c[2] + 1; k++) {
      if (Math.abs(i) > 2 || Math.abs(j) > 1 || Math.abs(k) > 2) continue;
      if (cone([q[0] - i * 9, q[1] - j * 9, q[2] - k * 9]).d < 1e-4) return true;
    }
    return false;
  };
  let crossings = 0, tested = 0;
  for (let n = 0; n < 160; n++) {
    const p = [Math.sin(n * 1.7) * 20, Math.sin(n * 0.37 + 1) * 9, Math.cos(n * 2.3) * 20];
    const R = cg(p).d;
    if (!(R > 0)) continue; // started inside a solid copy (the KIFS DE is signed)
    for (let m = 0; m < 24; m++) {
      const dir = [Math.sin(m * 2.4 + n), Math.cos(m * 1.7 - n), Math.sin(m * 0.9 + 2 * n)];
      const L = Math.hypot(...dir), f = R * 0.999 * Math.cbrt(((m * 0.618) % 1));
      const q = [p[0] + dir[0] / L * f, p[1] + dir[1] / L * f, p[2] + dir[2] / L * f];
      tested++;
      if (solidGrid(q)) crossings++;
    }
  }
  ok(crossings === 0, `grid of a compact shape: no surface inside any step ball (${tested} samples)`);
  // Ring: copy k is the original rotated by k·360°/N about the axis, then moved out by R.
  const ring = { ...base, repMode: 2, repRingN: 6, repRingR: 5, repRingAxis: 1, repRingRotate: true };
  const r = makeDE(ring);
  let wr = 0;
  for (let k = 0; k < 6; k++) {
    const th = k * Math.PI / 3, c = Math.cos(th), sn = Math.sin(th);
    for (let n = 0; n < 30; n++) {
      const q = [Math.sin(n) * 1.1, Math.cos(n * 1.3) * 1.1, Math.sin(n * 0.7) * 1.1];
      // local frame of the Y axis ring: w = (z, x, y); copy centre at angle th on the w.xy plane.
      const wx = q[2] + 5, wy = q[0];
      const W = [wx * c - wy * sn, wx * sn + wy * c, q[1]];
      const p = [W[1], W[2], W[0]];
      const a = one(q).d, b = r(p).d;
      if (a < 1.0) wr = Math.max(wr, Math.abs(a - b) / Math.max(a, 1e-9));
    }
  }
  ok(wr < 1e-9, `ring: each copy is the original turned and moved onto the ring (max rel diff ${wr.toExponential(1)})`);
  const cring = makeDE({ ...cbase, repMode: 2, repRingN: 6, repRingR: 5, repRingAxis: 1, repRingRotate: true });
  const solidRing = q => {
    for (let k = 0; k < 6; k++) {
      const th = -k * Math.PI / 3, c = Math.cos(th), sn = Math.sin(th);
      const W = [q[2], q[0], q[1]];
      const L = [W[0] * c - W[1] * sn - 5, W[0] * sn + W[1] * c, W[2]];
      if (cone([L[1], L[2], L[0]]).d < 1e-4) return true;
    }
    return false;
  };
  let crossR = 0, testedR = 0;
  for (let n = 0; n < 160; n++) {
    const p = [Math.sin(n * 1.7) * 8, Math.sin(n * 0.37 + 1) * 3, Math.cos(n * 2.3) * 8];
    const R = cring(p).d;
    if (!(R > 0)) continue;
    for (let m = 0; m < 24; m++) {
      const dir = [Math.sin(m * 2.4 + n), Math.cos(m * 1.7 - n), Math.sin(m * 0.9 + 2 * n)];
      const L = Math.hypot(...dir), f = R * 0.999 * Math.cbrt(((m * 0.618) % 1));
      testedR++;
      if (solidRing([p[0] + dir[0] / L * f, p[1] + dir[1] / L * f, p[2] + dir[2] / L * f])) crossR++;
    }
  }
  ok(crossR === 0, `ring of a compact shape: no surface inside any step ball (${testedR} samples)`);
  const varied = makeDE({ ...grid, repRotVar: 40, repScaleVar: 0.3, repColVar: 1, repSeed: 7 });
  let fin = true, trapDiff = 0;
  for (let n = 0; n < 200; n++) {
    const p = [Math.sin(n) * 14, Math.cos(n * 1.3) * 6, Math.sin(n * 0.7) * 16];
    const a = varied(p);
    if (!(a.d >= 0) || !Number.isFinite(a.d)) fin = false;
    trapDiff += Math.abs(a.trap - g(p).trap);
  }
  ok(fin && trapDiff > 0, 'per-copy rotation, scale and colour variation: finite DE, colour shifts per copy');
  const su = sceneUniforms(grid);
  ok(su.__rep && !sceneUniforms(defaults()).__rep && specKey(specOf(su)).includes('|rep'), 'repetition builds its own program only when on');

  // Deep zoom.
  ok(effectiveIterations({ iterations: 20, deepZoom: false, deepIters: 1, dist: 0.001 }) === 20, 'Deep Zoom off: iterations unchanged');
  ok(effectiveIterations({ iterations: 20, deepZoom: true, deepIters: 1, dist: 5 / 1024 }) === 30, 'Deep Zoom: +1 iteration per halving of the view distance');
  ok(effectiveIterations({ iterations: 245, deepZoom: true, deepIters: 2, dist: 1e-6 }) === 250, 'Deep Zoom: capped at 250 iterations');
  const dz = sceneUniforms({ ...defaults(), deepZoom: true, dist: 0.01 });
  ok(dz.__dz && dz.u_iterations === effectiveIterations({ ...defaults(), deepZoom: true, dist: 0.01 }) && specKey(specOf(dz)).includes('|dz'), 'Deep Zoom builds its own program and sends the extra iterations');
  for (const mode of [0, 1, 2]) {
    const cls = ff(undefined, { mode });
    ok(!/#define (DEEP_ZOOM|HAS_REP)/.test(cls), `mode ${mode}: classic build has neither repetition nor deep zoom`);
    ok(/#define DEEP_ZOOM/.test(ff(undefined, { mode, dz: true })) && /#define HAS_REP/.test(ff(undefined, { mode, rep: true })), `mode ${mode}: flags define their code`);
  }
  // The CPU marcher uses the pixel-sized threshold in Deep Zoom (picking matches the GPU).
  const tiny = { ...defaults(), dist: 0.002, deepZoom: true, detail: 1 };
  const coarse = marchInfo(makeDE(tiny), [0, 0, 3], [0, 0, -1], { ...tiny, deepZoom: false });
  const fine = marchInfo(makeDE(tiny), [0, 0, 3], [0, 0, -1], { ...tiny, __pix: 1 / 800 / 1e3 });
  ok(fine.reason !== 'nan' && (fine.t < 0 || coarse.t < 0 || fine.t >= coarse.t - 1e-12), 'Deep Zoom threshold is never coarser than the classic one');
  const pk = pickPixel({ ...defaults(), ...BIOMES.menger.v }, 400, 225, 800, 450);
  ok(pk.t > 0 && Math.abs(Math.hypot(...pk.n) - 1) < 1e-9 && pk.n.reduce((a, x, i) => a + x * (pk.eye[i] - pk.p[i]), 0) > 0, 'pick: hit point with a unit normal facing the camera');
}


// ── Mandelbulber import ─────────────────────────────────────────────────────
section('mandelbulber import');
{
  const { importMandelbulber, parseFract } = await import('./lib.mjs');
  const { mbDistance } = await import('./mb_reference.mjs');
  const dir = new URL('./fixtures/', import.meta.url);
  const expect = {
    kifs_dodeca: 'Kaleidoscopic IFS', kifs_menger_mode: 'Kaleidoscopic IFS', menger: 'Menger Sponge',
    sierpinski: 'Sierpinski 3D', hybrid_kifs_menger: 'Kaleidoscopic IFS + Menger Sponge',
  };
  for (const [name, formula] of Object.entries(expect)) {
    const txt = readFileSync(new URL(name + '.fract', dir), 'utf8');
    const r = importMandelbulber(txt);
    ok(r.ok && r.formula === formula, `${name}: imports as ${r.formula || r.error}`);
    if (!r.ok) continue;
    const S = parseFract(txt), m = S.main_parameters;
    const v = defaults();
    for (const p of PARAMS) if (p.id in r.params) v[p.id] = coerce(p, r.params[p.id]);
    const de = makeDE(v), W = r.world;
    const toK = q => [W[0] * q[0] + W[1] * q[1] + W[2] * q[2], W[3] * q[0] + W[4] * q[1] + W[5] * q[2], W[6] * q[0] + W[7] * q[1] + W[8] * q[2]];
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const p = rv(2.5);
      const ref = mbDistance(S, p);
      worst = Math.max(worst, Math.abs(de(toK(p)).d - ref) / Math.max(1e-12, Math.abs(ref)));
    }
    ok(worst < 1e-9, `${name}: DE matches the Mandelbulber port at 400 points (worst rel ${worst.toExponential(1)})`);
    const nums = s => s.trim().split(/\s+/).map(x => Number(x.replace(',', '.')));
    const tgt = nums(m.target), cam = nums(m.camera);
    const b = cameraBasis(v), eye = toK(cam), fw = toK(tgt.map((x, k) => x - cam[k])), fl = Math.hypot(...fw), top = toK(nums(m.camera_top));
    const eyeErr = Math.hypot(...b.eye.map((x, k) => x - eye[k]));
    const fwdErr = Math.hypot(...b.forward.map((x, k) => x - fw[k] / fl));
    // camera_top projected onto the image plane (Mandelbulber writes it orthogonal; the fixtures are hand-written).
    const tf = top.reduce((s2, x, k) => s2 + x * fw[k] / fl, 0), topP = top.map((x, k) => x - tf * fw[k] / fl);
    const upDot = b.up.reduce((s2, x, k) => s2 + x * topP[k], 0) / Math.hypot(...topP);
    ok(eyeErr < 1e-9 && fwdErr < 1e-9 && upDot > 1 - 1e-9, `${name}: camera eye / direction / roll exact`);
  }
  const hy = importMandelbulber(readFileSync(new URL('hybrid_kifs_menger.fract', dir), 'utf8')).params;
  ok(hy.hybridMode === 3 && hy.hybLen === 3 && !hy.hybP1 && !hy.hybP2 && hy.hybP3, 'hybrid 2 + 1 iterations → pattern AAB');
  const mm = importMandelbulber(readFileSync(new URL('kifs_menger_mode.fract', dir), 'utf8')).params;
  ok(mm.groundType === 1 && mm.a1t === T.ABS && mm.a2t === T.PLANE && mm.a2d === 0.1 && mm.a3t === T.ROT && mm.a4t === T.PLANE && mm.a5t === T.PLANE && mm.a5k === 0.7 && mm.a6t === T.ZTRICK && mm.a6zm === 1, 'per-plane rotation, distance, intensity, Menger mode and plane primitive come across');
  const dd = importMandelbulber(readFileSync(new URL('kifs_dodeca.fract', dir), 'utf8')).params;
  ok(/^0\.0000:#1a2b6d/.test(dd.gradStops) && dd.gradRepeat === 2, 'material gradient imported');
  ok(dd.bailout === 100 && importMandelbulber(readFileSync(new URL('menger.fract', dir), 'utf8')).params.bailout === 10
    && importMandelbulber(readFileSync(new URL('sierpinski.fract', dir), 'utf8')).params.bailout === 20, "bailout: each formula's default, or the file's when it overrides");
  const sp = importMandelbulber(readFileSync(new URL('sierpinski.fract', dir), 'utf8')).params;
  ok(sp.rotStart === 3 && sp.preAlpha !== 0, 'Sierpinski 3D rotation (start 2) → pre-rotation from iteration 3');
  const mb = importMandelbulber(readFileSync(new URL('mandelbox.fract', dir), 'utf8'));
  ok(!mb.ok && /not one Eidos can import/.test(mb.error), 'unsupported formulas are rejected with a reason');
  ok(!importMandelbulber('hello').ok, 'non-Mandelbulber text is rejected');
}

section('evolve / rebirth');
{
  const eb = { ...defaults(), ...BIOMES.coral.v };
  for (let i = 0; i < 200; i++) {
    const m = evolve(eb);
    for (const id in m) {
      const p = PARAM_BY_ID.get(id);
      ok(m[id] >= p.min - 1e-12 && m[id] <= p.max + 1e-12, `evolve ${id} in range`);
      ok(isActive(p, eb), `evolve only mutates live controls (${id})`);
    }
  }
  const t0 = performance.now();
  let good = 0;
  for (let i = 0; i < 6; i++) {
    const r = rebirth(defaults());
    const s = r.score;
    if (s.clearance > 0.02 && s.hitFrac >= 0.25 && s.hitFrac <= 0.9) good++;
    for (const id in r.values) ok(coerce(PARAM_BY_ID.get(id), r.values[id]) !== undefined, `rebirth ${id} valid`);
  }
  console.log(`    rebirth: ${good}/6 met the visibility target, avg ${((performance.now() - t0) / 6).toFixed(0)} ms each`);
  ok(good >= 4, 'rebirth usually finds a visible, non-enclosed view');
  for (const [k, b] of Object.entries(BIOMES)) {
    const s = viewScore({ ...defaults(), ...b.v }, 6);
    if (b.inside) ok(s.hitFrac > 0.9 && s.clearance > 0.02, `preset ${b.label}: camera in a cavity of the lattice (clearance ${s.clearance.toFixed(3)})`);
    else ok(s.hitFrac > 0.05 && s.clearance > 0.05, `preset ${b.label}: camera outside, shape in view (${(s.hitFrac * 100).toFixed(0)}%)`);
  }
}

// ── Sampling sequences ──────────────────────────────────────────────────────
section('sampling');
{
  let inRange = true, sumX = 0;
  for (let n = 0; n < 1024; n++) {
    const j = jitterFor(n), l = lensFor(n);
    if (Math.abs(j[0]) > 0.5 || Math.abs(j[1]) > 0.5 || l[0] < 0 || l[0] >= 1 || l[1] < 0 || l[1] >= 1) inRange = false;
    sumX += j[0];
  }
  ok(inRange, 'jitter/lens samples in range');
  ok(Math.abs(sumX / 1024) < 0.01, 'jitter unbiased');
  ok(jitterFor(0)[0] === 0 && jitterFor(0)[1] === 0, 'first sample at pixel centre (matches v1 while moving)');
  ok(near(wrapPi(3 * Math.PI), Math.PI, 1e-12) || near(wrapPi(3 * Math.PI), -Math.PI, 1e-12), 'wrapPi');
}

// ── ZIP ─────────────────────────────────────────────────────────────────────
section('zip');
{
  ok(crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'crc32 check value');
  const z = new ZipWriter();
  const a = new Uint8Array(1000).map((_, i) => i * 7);
  z.add('frame_00000.png', a);
  z.add('frame_00001.png', new TextEncoder().encode('hello surf'));
  const parts = z.finish();
  const buf = Array.isArray(parts) ? Buffer.concat(parts.map(p => Buffer.from(p))) : Buffer.from(await parts.arrayBuffer());
  writeFileSync('/tmp/surf-test.zip', buf);
  ok(buf.length > 1000, 'zip written to /tmp/surf-test.zip (verified by python zipfile in CI step)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
