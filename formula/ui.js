// Eidos's formula-panel extras: symmetry-group presets for Stack A, the
// inversion / estimate warning, a description under every step type, the
// Wythoff corner names and the hybrid-schedule description. Organon calls
// setupUI() once, after the panel is built.

import { STEP_DESC, STEP_NAMES, STACKS, SHAPES, ESTIMATE_TYPES, ESTIMATE_SHAPES, POLY_SHAPES, POLY_PARTS, WYTHOFF, sid } from './kifs.js';
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
    const note = el('div', 'seq-hint', 'Each iteration: pre-rotation → spin → the steps below in order → post-rotation → scale about the centre. Folds (smooth or not), reflections and rotations keep the distance estimate exact (Step Factor 1); a Sphere Inversion, Kleinian, chiral, cyclic or n-flake step makes it an estimate.');
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
      if ((state.get('lvMode') | 0) > 0 && ESTIMATE_SHAPES.includes(state.get('lvShape') | 0)) names.add(`${SHAPES[state.get('lvShape') | 0]} level shape`);
      return [...names];
    };
    const sync = () => {
      const n = live();
      w.style.display = n.length ? '' : 'none';
      w.textContent = n.length ? `${n.join(', ')}: the DE is an estimate, not a bound. If you see holes or speckle, lower Step Factor (Iteration panel; now ${(+state.get('stepFactor')).toFixed(2)}).` : '';
    };
    state.onChange(id => { if (id == null || id === 'stepFactor' || id === 'hybridMode' || id === 'shape' || id === 'lvMode' || id === 'lvShape' || /^[ab]\d+t$/.test(id)) sync(); });
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
    // Fold-and-cut polyhedra: their controls show whenever the seed shape or
    // the level shape is a polyhedron (two different selects, so ui.js does
    // the gating). The corner names follow the polyhedron's mirror cell.
    const ids = ['polyLink', 'polyA', 'polyB', 'polyC', 'polyF1', 'polyF2', 'polyF3', 'polyE', 'polyER', 'polyV', 'polyVR'];
    const ctl = id => panel.controls.get(id);
    const head = el('div', 'sub-head');
    head.append(el('span', '', 'Polyhedron (fold & cut)'));
    const desc = el('div', 'fold-desc');
    ctl('polyLink').wrap.before(head, desc);
    const show = (node, on) => { if (!node) return; node.classList.add('gated'); node.classList.toggle('gate-hidden', !on); };
    const sync = () => {
      const seed = POLY_SHAPES.includes(state.get('shape') | 0);
      const lvl = (state.get('lvMode') | 0) > 0 && POLY_SHAPES.includes(state.get('lvShape') | 0);
      const on = seed || lvl;
      const g = (seed ? state.get('shape') : state.get('lvShape')) - 11;
      const W = WYTHOFF[Math.max(0, Math.min(2, g | 0))];
      const vis = { polyA: !state.get('polyLink'), polyB: !state.get('polyLink'), polyC: !state.get('polyLink'), polyER: !!state.get('polyE'), polyVR: !!state.get('polyV') };
      show(head, on); show(desc, on);
      for (const id of ids) {
        const c = ctl(id);
        show(c.wrap, on && vis[id] !== false);
        if (c.rc) show(c.rc, on && vis[id] !== false);
      }
      for (const row of new Set(ids.map(id => ctl(id).wrap.closest('.grid')).filter(Boolean))) show(row, on);
      desc.textContent = on ? `Knighty's fold-and-cut: fold into one ${W.name} mirror cell, put a vertex at the weighted corners (A: ${W.labels[0]}, B: ${W.labels[1]}, C: ${W.labels[2]}) at distance Size, and keep the faces, edges and vertices you tick. One weight → a regular polyhedron; two → truncated; three → omnitruncated. Fold-count colouring gives each part its own colour (${POLY_PARTS.join(', ')}).` : '';
    };
    state.onChange(i2 => { if (i2 == null || ['shape', 'lvMode', 'lvShape', 'polyLink', 'polyE', 'polyV'].includes(i2)) sync(); });
    sync();
  }
  {
    const d = el('div', 'fold-desc');
    panel.controls.get('lvMode').wrap.after(d);
    const TXT = [
      'Only the final shape counts. Pick a mode to join a second shape at every level of the fractal (level i is the folded space of iteration i, before its scale).',
      'Union: the level shape is added at every level, an ornament of rings, rods or balls at every scale. Exact.',
      'Smooth union: as Union, blended into the fractal with Blend Radius (in each level\'s own units). Exact.',
      'Carve: the level shape is cut out at every level, like the cross of tubes that makes a Menger sponge. Exact.',
      'Intersect: keep only what lies inside the level shape at every level. Exact.',
    ];
    const sync = () => { d.textContent = TXT[state.get('lvMode')] || ''; };
    state.onChange(i2 => { if (i2 === 'lvMode' || i2 == null) sync(); });
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
