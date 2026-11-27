// CPU port of Eidos's distance estimator: the fold steps come from
// formula/kifs.js (the same table that emits the GLSL), and this loop mirrors
// mapLocal() in formula/glsl.js line for line; tests/browser.mjs compares the
// GPU and CPU values for every step type. Organon (core/engine/de.js) adds the
// object transform, repetition and marching.

import { fractalRotation } from '../core/engine/vec.js';
import { effectiveIterations } from '../core/engine/params.js';
import { stackOf, cpuStack, shapeFn, hybridUsesB, stackCenter } from './kifs.js';
export { makeDE, repHash, repeatMap, marchInfo, march, probePixel, pickPixel, viewScore, suggestVolumeShell } from '../core/engine/de.js';

const mv = (M, z) => [M[0] * z[0] + M[1] * z[1] + M[2] * z[2], M[3] * z[0] + M[4] * z[1] + M[5] * z[2], M[6] * z[0] + M[7] * z[1] + M[8] * z[2]];
const mm = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// The formula's own map p → { d, trap, orbit, folds, z, dr } in its local
// frame. `scaleOverride` carries the Scale Pulse.
export function localDE(v, scaleOverride) {
  const iters = effectiveIterations(v);
  const A = stackOf(v, 'a'), hasB = (v.hybridMode | 0) > 0, B = hasB ? stackOf(v, 'b') : [];
  const runA = cpuStack(v, 'a', A), runB = cpuStack(v, 'b', B);
  const useB = hybridUsesB(v);
  const PRE = fractalRotation(v.preAlpha, v.preBeta, v.preGamma);
  const preOn = v.preAlpha !== 0 || v.preBeta !== 0 || v.preGamma !== 0;
  const POST = fractalRotation(v.alpha, v.beta, v.gamma), postOn = v.alpha !== 0 || v.beta !== 0 || v.gamma !== 0;
  const POSTB = fractalRotation(v.alphaB || 0, v.betaB || 0, v.gammaB || 0), postBOn = !!(v.alphaB || v.betaB || v.gammaB);
  const SP = fractalRotation(v.spinX, v.spinY, v.spinZ);
  const spinOn = v.spinX !== 0 || v.spinY !== 0 || v.spinZ !== 0;
  const sA = scaleOverride ?? v.scale, sB = v.scaleB ?? 2;
  const cA = stackCenter(v), cB = [v.centerBX ?? 1, v.centerBY ?? 1, v.centerBZ ?? 1];
  const dS = v.scaleStep || 0, dC = [v.centerStepX || 0, v.centerStepY || 0, v.centerStepZ || 0];
  const bail2 = (v.bailout ?? 100) ** 2;
  const rotStart = v.rotStart | 0, colIters = v.colorIters ?? 40, src = v.colorSource | 0, fcw = v.foldColW ?? 1;
  const shape = shapeFn(v);

  const map = p => {
    let z = [p[0], p[1], p[2]], dr = 1, trap = 1e10;
    let spin = I3;
    const acc = { fold: 0, colOn: 1, traps: {}, w: {} };
    for (let i = 0; i < iters; i++) {
      acc.colOn = i < colIters ? 1 : 0;
      const rotOn = i >= rotStart;
      if (rotOn && preOn) z = mv(PRE, z);
      if (rotOn && spinOn) { z = mv(spin, z); spin = mm(spin, SP); }
      const b = hasB && useB(i);
      const s = (b ? sB : sA) + dS * i;
      const c = (b ? cB : cA).map((x, k) => x + dC[k] * i);
      acc.dr = 1;
      z = (b ? runB : runA)(z, s, c, acc, i);
      dr *= acc.dr;
      const R = b ? POSTB : POST, on = b ? postBOn : postOn;
      if (rotOn && on) z = v.postRotC ? mv(R, [z[0] - c[0], z[1] - c[1], z[2] - c[2]]).map((x, k) => x + c[k]) : mv(R, z);
      z = [s * (z[0] - c[0]) + c[0], s * (z[1] - c[1]) + c[1], s * (z[2] - c[2]) + c[2]];
      dr *= Math.abs(s);
      const zz = z[0] * z[0] + z[1] * z[1] + z[2] * z[2];
      trap = Math.min(trap, zz);
      if (zz > bail2) break;
    }
    const orbit = trap;
    if (src === 1) trap = acc.fold * fcw * 2.5;
    else if (src === 2) trap += acc.fold * fcw * 2.5;
    else if (src === 3) { trap = 0; for (const k in acc.traps) if (acc.traps[k] < 1e9) trap += acc.w[k] * acc.traps[k]; }
    return { d: shape(z) / Math.max(dr, 1e-30), trap, orbit, folds: acc.fold, z, dr };
  };
  return map;
}
