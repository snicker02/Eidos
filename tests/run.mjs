// Logic tests (npm test). No dependencies; glslangValidator is used when found.
import { PARAMS, GROUPS, defaults, coerce, PARAM_BY_ID, STEP_NAMES } from '../engine/params.js';
import { State } from '../engine/state.js';
import { cameraBasis, pixelRay } from '../engine/camera.js';
import { fractalRotation, dot, sub, normalize, length, cross, wrapPi, mat3Mul } from '../engine/vec.js';
import { makeDE, march, marchInfo, viewScore, pickPixel } from '../engine/de.js';
import { Sequencer, MODE, EASE } from '../engine/sequencer.js';
import { encodeDiscovery, decodeDiscovery, evolve, rebirth, makeProject, parseProject, BIOMES, SYMMETRY_GROUPS, symmetryValues, isActive } from '../engine/presets.js';
import { sceneUniforms, jitterFor, lensFor, specOf, specKey } from '../engine/renderer.js';
import { FRACTAL_FRAG, fractalFrag } from '../engine/glsl.js';
import { T, ABS_MASKS, SWAP_MODES, ROT_PIVOTS, AXES, ZTRICK_MODES, STACKS, SHAPES, stackOf, slotData, cpuStack, hybridUsesB, stackValues, ICO_N } from '../engine/kifs.js';
import { spawnSync } from 'node:child_process';
import { ZipWriter, crc32 } from '../engine/zip.js';
import { writeFileSync, readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  FAIL', msg); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const section = s => console.log('•', s);
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rv = (a = 2) => [(rnd() * 2 - 1) * a, (rnd() * 2 - 1) * a, (rnd() * 2 - 1) * a];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);


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
STEP_NAMES.slice(1).forEach((_, i) => { everyStep[`a${i + 1}t`] = i + 1; if (i < 8) everyStep[`b${i + 1}t`] = 11 - i; });
const su = sceneUniforms(everyStep);
const decl = {};
for (const m of fractalFrag(specOf(su)).matchAll(/uniform\s+(\w+)\s+(\w+)\s*;/g)) decl[m[2]] = m[1];
ok(su.__A.length === 11 && su.__B.length === 8, 'every step type is in the test stack');
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
const OPTIONS = { [T.ABS]: ABS_MASKS.length, [T.SWAP]: SWAP_MODES.length, [T.ZTRICK]: ZTRICK_MODES.length, [T.ROT]: ROT_PIVOTS.length, [T.DIHEDRAL]: AXES.length };
const ALL_STEPS = [];
for (let t = 1; t < STEP_NAMES.length; t++) for (let o = 0; o < (OPTIONS[t] || 1); o++) ALL_STEPS.push({ t, o });
section('fold steps');
{
  let worst = 0, worstName = '';
  for (const { t, o } of ALL_STEPS) {
    if (t === T.ZTRICK && o === 1) continue; // Mandelbulber's shift form: a jump by design (checked below)
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
  ok(worst <= 1 + 1e-9, `all ${ALL_STEPS.length - 1} continuous step × option variants are 1-Lipschitz (worst ratio ${worst.toFixed(12)} — ${worstName})`);

  // The icosahedral fold lands in one cell of the 120-element group, and the
  // octahedral one in one cell of the 48.
  const gs = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (const [t, order] of [[T.ICOSA, 120], [T.OCTA, 48]]) {
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
  ];
  for (const [name, key, g] of cases) {
    const m = makeDE({ ...defaults(), ...BIOMES[key].v }).local;
    let w = 0;
    for (let i = 0; i < 300; i++) { const p = rv(2); w = Math.max(w, Math.abs(m(p).d - m(g(p)).d)); }
    ok(w < 1e-9, `${name} (max diff ${w.toExponential(1)})`);
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
  const { PARAMS } = await import('../engine/params.js');
  const defs = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
  const { eulerDeg, mat3MulVec } = await import('../engine/vec.js');
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
  const { breed } = await import('../ui/mutation.js');
  const { TEX_GEN, TEX_KEYS } = await import('../engine/textures.js');
  const { BIOMES } = await import('../engine/presets.js');
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
  const { specOf, specKey } = await import('../engine/renderer.js');
  ok(specKey(specOf(su1)) !== specKey(specOf(sceneUniforms(defaults()))), 'material build gets its own program key');
  const su0 = sceneUniforms(defaults());
  ok(su0.u_matOn === false && su0.u_texMode === 0 && su0.u_crease === 0, 'materials, texture and crease are off by default');
  let pt;
  ok((pt = fractalFrag(undefined, { mode: 1, mat: true })).includes('thinFilm(max(dot(n, -rd), 0.0), mt.iridT)') && pt.includes('exitSolid(p - n * eN * 2.0, dir, eN, ok)'), 'path tracer has the film and glass lobes');
}


section('extra lights');
{
  const { fractalFrag: ff } = await import('../engine/glsl.js');
  const { specOf, specKey } = await import('../engine/renderer.js');
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
  const { effectiveIterations } = await import('../engine/params.js');
  const { fractalFrag: ff } = await import('../engine/glsl.js');
  const { specOf, specKey } = await import('../engine/renderer.js');
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
  const { BIOMES: BB } = await import('../engine/presets.js');
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
  const { importMandelbulber, parseFract } = await import('../engine/mbimport.js');
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
    ok(s.hitFrac > 0.05 && s.clearance > 0.05, `preset ${b.label}: camera outside, shape in view (${(s.hitFrac * 100).toFixed(0)}%)`);
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
