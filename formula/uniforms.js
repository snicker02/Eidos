// Eidos's uniforms and program-spec data (Organon merges these into
// sceneUniforms; keys starting with "__" select the program, the rest are
// uniforms). Per-slot uniforms are sent only for the steps the program has.

import { effectiveIterations } from '../core/engine/params.js';
import { fractalRotation, mat3ToColumnMajor } from '../core/engine/vec.js';
import { stackOf, slotData, hybridPattern, stackCenter } from './kifs.js';

export function uniforms(v, scaleOverride) {
  const A = stackOf(v, 'a');
  const hasB = (v.hybridMode | 0) > 0;
  const B = hasB ? stackOf(v, 'b') : null;
  const out = {
    // Program selection (glsl.js spec()).
    __f: { A, B, shape: v.shape | 0 },
    u_iterations: effectiveIterations(v),
    u_scale: scaleOverride ?? v.scale,
    u_center: stackCenter(v),
    u_preRot: mat3ToColumnMajor(fractalRotation(v.preAlpha, v.preBeta, v.preGamma)),
    u_preRotOn: v.preAlpha !== 0 || v.preBeta !== 0 || v.preGamma !== 0,
    u_postRot: mat3ToColumnMajor(fractalRotation(v.alpha, v.beta, v.gamma)),
    u_postRotOn: v.alpha !== 0 || v.beta !== 0 || v.gamma !== 0,
    u_postRotC: !!v.postRotC,
    u_spinMatrix: mat3ToColumnMajor(fractalRotation(v.spinX, v.spinY, v.spinZ)),
    u_spinOn: v.spinX !== 0 || v.spinY !== 0 || v.spinZ !== 0,
    u_rotStart: v.rotStart | 0,
    u_scaleStep: v.scaleStep || 0,
    u_centerStep: [v.centerStepX || 0, v.centerStepY || 0, v.centerStepZ || 0],
    u_bail2: (v.bailout ?? 100) * (v.bailout ?? 100),
    u_shapeR: v.shapeR ?? 1,
    u_shapeBox: [v.shapeBX ?? 1, v.shapeBY ?? 1, v.shapeBZ ?? 1],
    u_shapeT: v.shapeT ?? 0.1,
    u_shapeAx: v.shapeAx ?? 2,
  };
  if (hasB) Object.assign(out, {
    u_scaleB: v.scaleB ?? 2,
    u_centerB: [v.centerBX ?? 1, v.centerBY ?? 1, v.centerBZ ?? 1],
    u_postRotB: mat3ToColumnMajor(fractalRotation(v.alphaB || 0, v.betaB || 0, v.gammaB || 0)),
    u_postRotBOn: !!(v.alphaB || v.betaB || v.gammaB),
    u_hybMode: v.hybridMode | 0,
    u_hybN: Math.max(1, v.hybN | 0),
    u_hybLen: Math.max(1, Math.min(8, v.hybLen | 0)),
    u_hybPat0: hybridPattern(v).slice(0, 4),
    u_hybPat1: hybridPattern(v).slice(4, 8),
  });
  // Per-slot uniforms, only for the steps the program contains.
  for (const [s, slots] of [['a', A], ['b', B || []]]) {
    for (const sl of slots) {
      const d = slotData(v, s, sl);
      out[`u_${s}${sl.k}q`] = d.q;
      if (d.p) out[`u_${s}${sl.k}p`] = d.p;
      if (d.m) out[`u_${s}${sl.k}m`] = mat3ToColumnMajor(d.m);
      if (d.r) out[`u_${s}${sl.k}r`] = d.r;
      if (d.it) out[`u_${s}${sl.k}i`] = d.it;
    }
  }
  return out;
}
