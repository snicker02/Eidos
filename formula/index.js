// Eidos — the Kaleidoscopic IFS fold-stack formula as an Organon formula
// module. Importing this file defines Eidos's parameters, builds its presets
// and installs the formula into the engine (core/engine/formula.js).

import { installFormula } from '../core/engine/formula.js';
import './params.js'; // defineParams() — must run before anything reads PARAMS
import { UNIFORMS, source, defines, spec, specKey, DEFAULT_SPEC } from './glsl.js';
import { uniforms } from './uniforms.js';
import { localDE } from './de.js';
import { BIOMES, PRESET_GROUPS, symmetryValues, rebirthCandidate, REBIRTH_TARGET } from './presets.js';
import { importFract } from './mbimport.js';
import { setupUI } from './ui.js';

export const VERSION = '1.4.0';

const formula = {
  id: 'eidos',
  name: 'Eidos',
  version: VERSION,
  brand: { globalName: '__eidos', discoveryPrefix: 'EIDOS1:' },

  // Shader + uniforms (glsl.js, uniforms.js).
  glsl: { uniforms: UNIFORMS, source, defines },
  uniforms,
  spec,
  specKey,
  defaultSpec: spec(DEFAULT_SPEC),

  // CPU distance estimator (de.js), in lock-step with mapLocal().
  localDE,

  // Presets (presets.js). First visit opens on the Sierpinski preset (the
  // defaults are the same formula; the preset adds its lighting).
  presets: BIOMES,
  presetGroups: PRESET_GROUPS.map(([label, g]) => [label, k => BIOMES[k].group === g]),
  firstPreset: 'sierpinski',
  rebirth: { candidate: rebirthCandidate, target: REBIRTH_TARGET },

  // Mandelbulber import (mbimport.js).
  importFract,
  importTitle: 'Load a Mandelbulber .fract settings file (Kaleidoscopic IFS, Menger Sponge or Sierpinski 3D, or a two-formula hybrid of them)',

  // Formula panel extras (ui.js).
  setupUI,
  shaderFallback: {
    message: 'Shader build failed for this fold stack — reverting to the Sierpinski stack in surface mode',
    values: () => ({ ...symmetryValues(0), hybridMode: 0 }),
  },
};

export default installFormula(formula);
