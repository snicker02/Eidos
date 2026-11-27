// Eidos's formula-panel extras: symmetry-group presets for Stack A, the
// inversion / estimate warning, a description under every step type, the
// Wythoff corner names and the hybrid-schedule description. Organon calls
// setupUI() once, after the panel is built.

import { STEP_DESC, STEP_NAMES, STACKS, SHAPES, ESTIMATE_TYPES, ESTIMATE_SHAPES, WYTHOFF, sid } from './kifs.js';
import { SYMMETRY_GROUPS, symmetryValues } from './presets.js';

export function setupUI({ state, panel, el, toast, pushHistory }) {
  // ── Fold stack helpers ──────────────────────────────────────────────────────
  // Symmetry-group presets rewrite Stack A (undoable); a description under every
  // step's type explains what that fold does.
  {
    const g = panel.group('stack');
    const sel = el('select', 'preset-select');
    sel.append(Object.assign(el('option', '', 'Apply a symmetry group to Stack A…'), { value: '', disabled: true, selected: true }));
    SYMMETRY_GROUPS.forEach((sg, i) => sel.append(Object.assign(el('option', '', sg.name), { value: String(i) })));
    sel.addEventListener('change', () => {
      const i = +sel.value;
      if (!SYMMETRY_GROUPS[i]) return;
      pushHistory();
      state.setMany(symmetryValues(i));
      toast(`Stack A: ${SYMMETRY_GROUPS[i].name.split('  ')[0]}`, 2500);
      sel.value = '';
    });
    const note = el('div', 'seq-hint', 'Each iteration: pre-rotation → spin → the steps below in order → post-rotation → scale about the centre. Folds, reflections and rotations keep the distance estimate exact (Step Factor 1); a Sphere Inversion step makes it an estimate.');
    note.style.marginTop = '0';
    g.prepend(sel, note);
  }
  {
    // Inversion warning: shown while a Sphere Inversion is in a live stack.
    const w = el('div', 'fold-desc');
    w.style.borderColor = '#c9a227';
    panel.group('stack').querySelector('.seq-hint').after(w);
    // Which estimate-making steps / shape are live right now.
    const live = () => {
      const names = new Set();
      for (const [s, on] of [['a', true], ['b', (state.get('hybridMode') | 0) > 0]]) {
        if (!on) continue;
        for (let k = 1; k <= STACKS[s].n; k++) {
          const t = state.get(sid(s, k, 't')) | 0;
          if (!t) break;
          if (ESTIMATE_TYPES.includes(t)) names.add(STEP_NAMES[t]);
        }
      }
      if (ESTIMATE_SHAPES.includes(state.get('shape') | 0)) names.add(`${SHAPES[state.get('shape') | 0]} shape`);
      return [...names];
    };
    const sync = () => {
      const n = live();
      w.style.display = n.length ? '' : 'none';
      w.textContent = n.length ? `${n.join(', ')}: the DE is an estimate, not a bound. If you see holes or speckle, lower Step Factor (Iteration panel; now ${(+state.get('stepFactor')).toFixed(2)}).` : '';
    };
    state.onChange(id => { if (id == null || id === 'stepFactor' || id === 'hybridMode' || id === 'shape' || /^[ab]\d+t$/.test(id)) sync(); });
    sync();
  }
  for (const s of ['a', 'b']) {
    for (let k = 1; k <= STACKS[s].n; k++) {
      const id = sid(s, k, 't');
      const c = panel.controls.get(id);
      const d = el('div', 'fold-desc');
      c.wrap.after(d);
      panel.gateNode(d, { gate: id, gateEq: STEP_DESC.map((_, i) => i).slice(1) });
      const sync = () => { d.textContent = STEP_DESC[state.get(id)] || ''; };
      state.onChange(i2 => { if (i2 === id || i2 == null) sync(); });
      sync();
    }
  }
  {
    // Wythoff: name the three corners of the chosen mirror cell.
    const d = el('div', 'fold-desc');
    panel.controls.get('wyGroup').wrap.after(d);
    panel.gateNode(d, { gate: 'ctrMode', gateEq: 1 });
    const sync = () => {
      const g = WYTHOFF[state.get('wyGroup') | 0];
      d.textContent = `Weights on the corners of one ${g.name} mirror cell. A: ${g.labels[0]}, B: ${g.labels[1]}, C: ${g.labels[2]}. One weight → a corner; two → along an edge; three → inside. Use with the matching fold (${g.name.split(' ')[0]} Planes, or its chiral version).`;
    };
    state.onChange(i2 => { if (i2 === 'wyGroup' || i2 == null) sync(); });
    sync();
  }
  {
    const d = el('div', 'fold-desc');
    panel.controls.get('hybridMode').wrap.after(d);
    const TXT = [
      'Every iteration uses Stack A. Pick a schedule to interleave a second fold stack (Stack B, with its own scale, centre and post-rotation).',
      'Stack B replaces Stack A on every Nth iteration (N = 2: A, B, A, B …).',
      'Stack A for the first N iterations, then Stack B for the rest: coarse shape from A, fine detail from B.',
      'Repeat the pattern below: each checked iteration uses Stack B (Pattern Length sets how many of the boxes are used).',
    ];
    const sync = () => { d.textContent = TXT[state.get('hybridMode')] || ''; };
    state.onChange(i2 => { if (i2 === 'hybridMode' || i2 == null) sync(); });
    sync();
  }
}
