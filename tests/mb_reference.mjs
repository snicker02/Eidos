// Line-by-line ports of Mandelbulber 2's KIFS-family formulas and its distance
// evaluation, used only by the tests to check the .fract importer end to end.
// Written against Mandelbulber's own parameter names and code
// (formula/definition/fractal_kaleidoscopic_ifs.cpp, fractal_menger_sponge.cpp,
// fractal_sierpinski3d.cpp, src/compute_fractal.cpp, src/algebra.cpp,
// src/fractal.cpp) and NOT against Eidos's fold-stack code.

const DEG = Math.PI / 180;
const fabs = Math.abs;
const mmul = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
// CRotationMatrix::RotateX/Y/Z: matrix = matrix * rot.
const RX = a => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const RY = a => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const RZ = a => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
// SetRotation2: Z(r.z), Y(r.y), X(r.x).   SetRotation3: Z(r.x), Y(r.y), X(r.z).
export const SetRotation2 = deg => mmul(mmul(RZ(deg[2] * DEG), RY(deg[1] * DEG)), RX(deg[0] * DEG));
export const SetRotation3 = deg => mmul(mmul(RZ(deg[0] * DEG), RY(deg[1] * DEG)), RX(deg[2] * DEG));

const P = (s, k, d) => (s[k] !== undefined ? s[k].trim().split(/\s+/).map(x => Number(x.replace(',', '.'))) : d);
const B = (s, k, d) => (s[k] !== undefined ? s[k].trim() === 'true' : d);

// fractal.cpp RecalculateFractalParams + fractal_kaleidoscopic_ifs.cpp FormulaCode.
function kaleidoscopicIfs(z, f, aux) {
  if (B(f, 'IFS_abs_x', false)) z[0] = fabs(z[0]);
  if (B(f, 'IFS_abs_y', false)) z[1] = fabs(z[1]);
  if (B(f, 'IFS_abs_z', false)) z[2] = fabs(z[2]);
  for (let i = 0; i < 9; i++) {
    if (!B(f, `IFS_enabled_${i}`, false)) continue;
    z = mv(SetRotation3(P(f, `IFS_rotations_${i}`, [0, 0, 0])), z);
    let dir = P(f, `IFS_direction_${i}`, [1, 0, 0]);
    const l = Math.hypot(...dir); dir = dir.map(x => x / l);
    const length = z[0] * dir[0] + z[1] * dir[1] + z[2] * dir[2];
    const dist = P(f, `IFS_distance_${i}`, [0])[0], intensity = P(f, `IFS_intensity_${i}`, [1])[0];
    if (length < dist) z = z.map((x, k) => x - dir[k] * (2 * (length - dist) * intensity));
  }
  const O = P(f, 'IFS_offset', [1, 0, 0]);
  if (B(f, 'IFS_rotation_enabled', false)) {
    const M = SetRotation3(P(f, 'IFS_rotation', [0, 0, 0]));
    z = mv(M, z.map((x, k) => x - O[k])).map((x, k) => x + O[k]);
  }
  if (B(f, 'IFS_edge_enabled', false)) {
    const E = P(f, 'IFS_edge', [0, 0, 0]);
    for (let k = 0; k < 3; k++) if (E[k] > 0) z[k] = E[k] - fabs(E[k] - z[k]);
  }
  const s = P(f, 'IFS_scale', [2])[0];
  z = z.map(x => x * s);
  if (B(f, 'IFS_menger_sponge_mode', false)) {
    z[0] -= O[0] * (s - 1);
    z[1] -= O[1] * (s - 1);
    const ztemp = O[2] * (s - 1);
    if (z[2] > 0.5 * ztemp) z[2] -= ztemp;
  } else z = z.map((x, k) => x - O[k] * (s - 1));
  aux.DE *= fabs(s);
  return z;
}

// fractal_menger_sponge.cpp FormulaCode.
function mengerSponge(z, f, aux) {
  z = z.map(fabs);
  if (z[0] - z[1] < 0) [z[1], z[0]] = [z[0], z[1]];
  if (z[0] - z[2] < 0) [z[2], z[0]] = [z[0], z[2]];
  if (z[1] - z[2] < 0) [z[2], z[1]] = [z[1], z[2]];
  const s = P(f, 'transf_scale_3', [3])[0];
  z = z.map(x => x * s);
  z[0] -= 2; z[1] -= 2;
  if (z[2] > 1) z[2] -= 2;
  aux.DE *= s;
  return z;
}

// fractal_sierpinski3d.cpp FormulaCode.
function sierpinski3d(z, f, aux) {
  let [x, y, w] = z;
  if (B(f, 'transf_function_enabled', true)) {
    if (x + y < 0) { const t = x; x = -y; y = -t; }
    if (x + w < 0) { const t = x; x = -w; w = -t; }
    if (y + w < 0) { const t = y; y = -w; w = -t; }
  }
  if (B(f, 'transf_function_enabled_false', false)) {
    if (x - y < 0) [x, y] = [y, x];
    if (x - w < 0) [x, w] = [w, x];
    if (y - w < 0) [y, w] = [w, y];
  }
  const s = P(f, 'transf_scaleA_2', [2])[0];
  z = [x * s, y * s, w * s];
  const c = P(f, 'transf_offset_111', [1, 1, 1]);
  if (aux.i >= P(f, 'transf_start_iterations_C', [0])[0] && aux.i < P(f, 'transf_stop_iterations_C', [250])[0]) z = z.map((v, k) => v - c[k]);
  if (B(f, 'transf_function_enabledR_false', false)
      && aux.i >= P(f, 'transf_start_iterations_R', [0])[0] && aux.i < P(f, 'transf_stop_iterations_R', [250])[0])
    z = mv(SetRotation2(P(f, 'transf_rotation', [0, 0, 0])), z);
  aux.DE *= fabs(s);
  return z;
}

const FORMULA = { 10: kaleidoscopicIfs, 7: mengerSponge, 110: sierpinski3d };
const BAIL = { 10: 100, 7: 10, 110: 10 };

// compute_fractal.cpp: linear analytic DE (r / DE), formula sequence from
// hybrid_fractal_sequences.cpp (each formula repeated formula_iterations_n
// times, in slot order), fractal position / rotation as CalculateDistance.
// Point in Mandelbulber world coordinates.
export function mbDistance(S, pointMB) {
  const main = S.main_parameters;
  const fpos = P(main, 'fractal_position', [0, 0, 0]);
  const Rf = SetRotation2(P(main, 'fractal_rotation', [0, 0, 0]));
  let z = mv(Rf, pointMB.map((x, k) => x - fpos[k]));
  const seq = [];
  const slots = [];
  for (let n = 1; n <= 9; n++) {
    const id = main[`formula_${n}`] !== undefined ? P(main, `formula_${n}`, [0])[0] : 0;
    if (id > 0) slots.push({ n, id, it: P(main, `formula_iterations_${n}`, [1])[0] });
  }
  const used = B(main, 'hybrid_fractal_enable', false) ? slots : slots.slice(0, 1);
  for (const s of used) for (let k = 0; k < s.it; k++) seq.push(s);
  const N = P(main, 'N', [250])[0];
  const bail = B(main, 'use_default_bailout', true) ? Math.max(...used.map(s => BAIL[s.id])) : P(main, 'bailout', [10])[0];
  const aux = { DE: 1, i: 0 };
  let r = Math.hypot(...z);
  for (aux.i = 0; aux.i < N; aux.i++) {
    const s = seq[aux.i % seq.length];
    z = FORMULA[s.id](z, S[`fractal_${s.n}`] || {}, aux);
    r = Math.hypot(...z);
    if (r > bail) break;
  }
  return r / aux.DE;
}
