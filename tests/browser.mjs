// Optional headless-GPU validation (dev only; needs Playwright + Chrome):
//   python3 -m http.server 8000 &   then   node tests/browser.mjs [outDir]
// Checks: page boots without console errors, progressive accumulation runs,
// GLSL map() matches the CPU port in engine/de.js for every fold step, the
// tiled exporter is pixel-identical to the live renderer, every preset and
// symmetry group renders, Mandelbulber import works through the UI, and the
// phone (390×844, 844×390, touch) and desktop (1440×900) layouts hold.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.EIDOS_URL || 'http://localhost:8000/index.html';
const OUT = process.argv[2] || '/tmp/eidos-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 720, height: 450 } });
page.setDefaultTimeout(600000); // SwiftShader on small machines blocks the page for long stretches
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

await page.goto(URL);
await page.waitForFunction(() => window.__eidos && window.__eidos.renderer.live.samples > 0, null, { timeout: 600000 });
const fmt = await page.evaluate(() => window.__eidos.renderer.fmt.name);
ok(true, `booted, accumulation format ${fmt}`);

// Progressive accumulation advances when idle.
await page.evaluate(() => window.__eidos.state.set('maxSamples', 6));
await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 6, null, { timeout: 600000 });
ok(true, 'accumulated 6 samples while idle');
await page.screenshot({ path: `${OUT}/default.png` });

// GLSL ↔ CPU distance-estimator parity.
const parity = await page.evaluate(async () => {
  const { fractalMapSource, VERT } = await import('/engine/glsl.js');
  const { compileProgram, setUniforms } = await import('/engine/gl.js');
  const { sceneUniforms } = await import('/engine/renderer.js');
  const { makeDE } = await import('/engine/de.js');
  const { BIOMES } = await import('/engine/presets.js');
  const { defaults } = await import('/engine/params.js');
  const { specOf } = await import('/engine/renderer.js');
  const { stackValues, STEP_NAMES, T } = await import('/engine/kifs.js');
  const tail = `
uniform vec3 u_p;
vec4 pack(float v) { vec4 e = fract(v * vec4(1.0, 255.0, 65025.0, 16581375.0)); e -= e.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0); return e; }
void main() { float tr; float d = map(u_p, tr); gl_FragColor = pack(clamp(d / 16.0, 0.0, 0.999999)); }`;
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const px = new Uint8Array(4);
  // Every step type (and compile option) after an Abs, every preset, hybrids,
  // variation, shapes, object transform and repetition.
  const OPTS = { 1: 7, 2: 4, 7: 2, 8: 2, 11: 3 };
  const stepSets = [];
  for (let t = 1; t < STEP_NAMES.length; t++) for (let o = 0; o < (OPTS[t] || 1); o++)
    stepSets.push([`${STEP_NAMES[t].split(' ')[0]} ${o}`.padEnd(14), { ...BIOMES.octa.v, ...stackValues('a', [{ t: T.ABS, abs: 1 }, { t, abs: o, swap: o, zm: o, pv: o, ax: o, nx: 0.6, ny: -0.3, nz: 0.7, d: 0.15, k: 0.8, ra: 25, rb: -15, rg: 40, lx: 0.7, ly: 0.9, lz: 0.6, n: 5 }]), centerY: 0.4, centerZ: 0.3, shape: 0, shapeR: 0.8, iterations: 8 }]);
  const sets = [['default', {}], ...Object.entries(BIOMES).map(([k, b]) => [k, b.v]), ...stepSets,
    ['shape box', { ...BIOMES.menger.v, shape: 1, shapeBX: 0.6, shapeBY: 1.3, shapeBZ: 0.9 }],
    ['inversion full', { ...BIOMES.octa.v, ...stackValues('a', [{ t: T.OCTA }, { t: T.INV, icx: 0.3, icy: -0.2, icz: 0.5, ir: 0.8, ia: 0.7, il: 6, iax: 0.1, iay: 0.2, iaz: -0.1, is: 1.1, if: 1, iu: 5 }]) }],
    ['inversion in B', { ...BIOMES.hybrid.v, ...stackValues('b', [{ t: T.INV, icz: 1.2, ir: 1.1, il: 0 }, { t: T.SIERP }]) }],
    ['shape octa', { ...BIOMES.octa.v, shape: 2, shapeR: 1.2 }],
    ['hybrid switch', { ...BIOMES.hybrid.v, hybridMode: 2, hybN: 3, alphaB: 0.3, gammaB: -0.2 }],
    ['hybrid pattern', { ...BIOMES.hybrid.v, hybridMode: 3, hybLen: 5, hybP2: true, hybP3: false, hybP5: true, centerBY: 0.6 }],
    ['vary + spin + start', { ...BIOMES.octa.v, scaleStep: -0.04, centerStepX: 0.03, centerStepZ: -0.05, spinZ: 0.11, spinX: -0.05, rotStart: 2, preAlpha: 0.3, alpha: 0.4, postRotC: true }],
    ['object xform', { ...BIOMES.icosa.v, objX: 0.4, objY: -0.3, objZ: 0.2, objRotX: 20, objRotY: -35, objRotZ: 10, objScale: 1.3 }],
    ['rep grid', { ...BIOMES.icosa.v, repMode: 1, repCountX: 2, repCountY: 1, repCountZ: 2, repSpaceX: 4, repSpaceY: 3, repSpaceZ: 5 }],
    ['rep ring varied', { ...BIOMES.icosa.v, repMode: 2, repRingN: 5, repRingR: 7, repRingAxis: 0, repRingRotate: false, repRotVar: 90, repScaleVar: 0.2 }],
  ];
  const report = [];
  for (const [name, o] of sets) {
    const v = { ...defaults(), ...o };
    const su = sceneUniforms(v);
    const prog = compileProgram(gl, VERT, fractalMapSource(specOf(su), { rep: (v.repMode | 0) > 0 }) + tail);
    gl.useProgram(prog.prog);
    setUniforms(gl, prog, su);
    const map = makeDE(v);
    let worst = 0, n = 0;
    for (let i = 0; i < 4000 && n < 64; i++) {
      const R = i < 2000 ? 3 : 8; // widen the box for dense folds
      const p = [(Math.random() * 2 - 1) * R, (Math.random() * 2 - 1) * R, (Math.random() * 2 - 1) * R];
      const cpu = map(p).d;
      if (cpu > 15 || cpu < 0.005) continue; // outside packable range / ill-conditioned near surface
      // Points where a float32-sized change of the input moves the CPU result
      // by > 0.2% can't be reproduced by any 32-bit GPU (Gyroid Surf has many).
      const nudge = [1, -1].map(sg => map(p.map((x, j) => x * (1 + sg * 6e-8 * (j + 1)))).d);
      if (nudge.some(d2 => Math.abs(d2 - cpu) > 2e-3 * cpu)) continue;
      setUniforms(gl, prog, { u_p: p });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const gpu = (px[0] / 255 + px[1] / 65025 + px[2] / 16581375 + px[3] / 4228250625) * 16;
      worst = Math.max(worst, Math.abs(gpu - cpu) / Math.max(cpu, 0.05));
      n++;
    }
    report.push({ name, worst, n });
  }
  return report;
});
for (const r of parity) ok(r.worst < 0.02 && r.n >= 8, `DE parity ${r.name.padEnd(17)} worst rel err ${(r.worst * 100).toFixed(3)}% over ${r.n} pts`);

// Tiled exporter must equal the live renderer at 1 spp (checks tiling, offsets, Y flip).
const tile = await page.evaluate(async () => {
  const { renderImage } = await import('/engine/export.js');
  const { sceneUniforms } = await import('/engine/renderer.js');
  const s = window.__eidos;
  s.state.setMany({ maxSamples: 1, renderScale: 1, rotX: 0.6, rotY: 0.25, targetX: 0.3 });
  await new Promise(r => setTimeout(r, 400));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cv = document.getElementById('view');
  const W = cv.width, H = cv.height;
  const live = document.createElement('canvas'); live.width = W; live.height = H;
  live.getContext('2d').drawImage(cv, 0, 0);
  const a = live.getContext('2d').getImageData(0, 0, W, H).data;
  const out = await renderImage(s.renderer, sceneUniforms(s.state.values), W, H, 1, {});
  const b = out.getContext('2d').getImageData(0, 0, W, H).data;
  let maxd = 0, sum = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(a[i + c] - b[i + c]); maxd = Math.max(maxd, d); sum += d; }
  return { W, H, maxd, mean: sum / (W * H * 3) };
});
ok(tile.mean < 0.5 && tile.maxd <= 8, `tiled export == live (${tile.W}×${tile.H}, mean Δ ${tile.mean.toFixed(3)}, max Δ ${tile.maxd})`);

// Every render mode produces a finite, non-black image through the export path.
const modes = await page.evaluate(async () => {
  const { renderImage } = await import('/engine/export.js');
  const { sceneUniforms } = await import('/engine/renderer.js');
  const { defaults } = await import('/engine/params.js');
  const out = [];
  for (const mode of [0, 1, 2]) {
    const { BIOMES } = await import('/engine/presets.js');
    const v = { ...defaults(), ...BIOMES.menger.v, renderMode: mode, ptSky: 1.5 };
    const c = await renderImage(window.__eidos.renderer, sceneUniforms(v), 48, 32, 2, {});
    const d = c.getContext('2d').getImageData(0, 0, 48, 32).data;
    let sum = 0, min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; min = Math.min(min, l); max = Math.max(max, l); }
    out.push({ mode, mean: sum / (48 * 32), contrast: max - min });
  }
  return out;
});
for (const m of modes) ok(m.mean > 4 && m.contrast > 10, `render mode ${['surface', 'path traced', 'volumetric'][m.mode]}: mean ${m.mean.toFixed(1)}, contrast ${m.contrast.toFixed(0)}`);

// Biome screenshots (few samples, swiftshader is slow).
for (const key of ['default', ...Object.keys(await page.evaluate(async () => (await import('/engine/presets.js')).BIOMES))]) {
  await page.evaluate(async k => {
    const { BIOMES } = await import('/engine/presets.js');
    const s = window.__eidos;
    s.state.resetAll();
    if (k !== 'default') s.state.setMany(BIOMES[k].v);
    // 250-iteration Mandelbulber scenes take minutes a frame on SwiftShader.
    const heavy = s.state.values.iterations > 60;
    s.state.setMany(heavy ? { maxSamples: 1, renderScale: 0.2 } : { maxSamples: 4, renderScale: 0.5 });
  }, key);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__eidos.renderer.live.samples >= window.__eidos.state.values.maxSamples && !window.__eidos.renderer.isCompiling(), null, { timeout: 600000 });
  await page.screenshot({ path: `${OUT}/biome-${key}.png`, timeout: 600000 });
  console.log(`  shot  ${key} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
ok(true, `screenshots in ${OUT}`);
// Back to a cheap render before the layout checks: a full-res frame of the last
// preset can take most of a minute on SwiftShader and starve the resize check.
await page.evaluate(() => window.__eidos.state.setMany({ renderScale: 0.25, maxSamples: 1 }));
await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1, null, { timeout: 600000 });

// ── UI wiring: buttons that were dead in v1, keyframes, export downloads ──
page.on('dialog', d => d.accept());
// SwiftShader renders on the CPU: a reset back to full render scale and 64
// samples makes each frame take seconds and starves UI clicks. Keep resets
// lightweight for the rest of the run (test-only; the app is unchanged).
await page.evaluate(() => {
  const s = window.__eidos.state, orig = s.resetAll.bind(s);
  s.resetAll = (...a) => { orig(...a); s.setMany({ maxSamples: 1, renderScale: 0.25, exportSamples: 1 }); };
});
// Desktop layout with both docks open.
await page.setViewportSize({ width: 1600, height: 900 });
await page.evaluate(() => document.getElementById('app').classList.remove('no-left', 'no-right'));
await page.waitForTimeout(300);
const layout = await page.evaluate(() => {
  const r = id => document.getElementById(id).getBoundingClientRect();
  const c = document.getElementById('view');
  return { left: r('dockLeft'), right: r('dockRight'), stage: r('stage'), cw: c.width, ch: c.height };
});
ok(layout.left.right <= layout.stage.left + 1 && layout.stage.right <= layout.right.left + 1, `docks flank the viewer (L ${layout.left.width}px · stage ${layout.stage.width}px · R ${layout.right.width}px)`);
await page.waitForFunction(() => { const c = document.getElementById('view'); return c.width === c.clientWidth && c.height === c.clientHeight; }, null, { timeout: 600000 });
ok(true, 'canvas backing size tracks the centre cell');
// Every dock combination must give the viewer the remaining width.
for (const [cls, label] of [[[], 'both docks'], [['no-left'], 'left hidden'], [['no-right'], 'right hidden'], [['no-left', 'no-right'], 'both hidden']]) {
  const r = await page.evaluate(c => {
    const a = document.getElementById('app'); a.classList.remove('no-left', 'no-right'); c.forEach(k => a.classList.add(k));
    const st = document.getElementById('stage').getBoundingClientRect();
    const dl = document.getElementById('dockLeft').getBoundingClientRect(), dr = document.getElementById('dockRight').getBoundingClientRect();
    return { w: st.width, x: st.left, expect: innerWidth - (c.includes('no-left') ? 0 : dl.width) - (c.includes('no-right') ? 0 : dr.width) };
  }, cls);
  ok(Math.abs(r.w - r.expect) < 2, `viewer width with ${label}: ${r.w}px (expected ${r.expect}px)`);
}
await page.evaluate(() => document.getElementById('app').classList.remove('no-left', 'no-right'));
await page.keyboard.press('BracketLeft');
await page.waitForTimeout(200);
ok(await page.evaluate(() => document.getElementById('app').classList.contains('no-left')), '[ hides the left dock');
await page.keyboard.press('BracketLeft');
await page.screenshot({ path: `${OUT}/layout-docked.png`, timeout: 600000 });
await page.evaluate(() => { const s = window.__eidos; s.state.resetAll(); s.state.setMany({ maxSamples: 1, renderScale: 0.25, exportSamples: 1 }); });
const clickText = t => page.locator('button', { hasText: t }).first().click({ timeout: 180000, noWaitAfter: true });
const before = await page.evaluate(() => JSON.stringify(window.__eidos.state.values));
await clickText('Evolve');
const afterEvolve = await page.evaluate(() => JSON.stringify(window.__eidos.state.values));
ok(before !== afterEvolve, 'Evolve changes the scene');
await clickText('Rebirth');
await clickText('Undo');
const afterUndo = await page.evaluate(() => JSON.stringify(window.__eidos.state.values));
ok(afterUndo === afterEvolve, 'Undo restores pre-Rebirth state');
await clickText('Redo');
ok(await page.evaluate(() => JSON.stringify(window.__eidos.state.values)) !== afterEvolve, 'Redo re-applies Rebirth');

// Discovery copy → load round trip through the dialog.
const disc = await page.evaluate(async () => (await import('/engine/presets.js')).encodeDiscovery(window.__eidos.state.values));
await page.evaluate(() => window.__eidos.state.resetAll());
await clickText('Load String');
await page.fill('#discText', disc, { timeout: 600000 });
await page.click('#discLoad', { timeout: 180000, noWaitAfter: true });
const reloaded = await page.evaluate(async () => (await import('/engine/presets.js')).encodeDiscovery(window.__eidos.state.values));
ok(reloaded === disc, 'discovery string loads through the dialog');

// Keyframes: K adds, Space plays, sequence moves the camera.
await page.mouse.click(600, 300);
await page.evaluate(() => { const s = window.__eidos.state; s.resetAll(); s.setMany({ rotX: 0, dist: 5, seqDuration: 0.5, renderScale: 0.25, maxSamples: 1, exportSamples: 1 }); });
await page.keyboard.press('KeyK');
await page.evaluate(() => window.__eidos.state.setMany({ rotX: 1.0, dist: 3 }));
await page.keyboard.press('KeyK');
ok(await page.evaluate(() => window.__eidos.seq.length) === 2, 'K adds keyframes');
await page.keyboard.press('Space');
await page.waitForFunction(() => !window.__eidos.seq.playing, null, { timeout: 600000 });
const endDist = await page.evaluate(() => window.__eidos.state.values.dist);
ok(Math.abs(endDist - 3) < 1e-6, `sequence ends on last key (dist ${endDist})`);

// Offline frame export → zip download (small viewer so SwiftShader stays quick).
await page.selectOption('#saveRes', 'viewport');
// Right dock stays open (the button lives there); a narrow window keeps the viewer small.
await page.evaluate(() => { const a = document.getElementById('app'); a.classList.add('no-left'); a.classList.remove('no-right'); });
await page.evaluate(() => window.__eidos.state.setMany({ recSamples: 1, recRes: 0 })); // PNG frames use the Video & Frames settings
await page.setViewportSize({ width: 960, height: 300 });
await page.waitForTimeout(500);
const dl = page.waitForEvent('download', { timeout: 900000 }); // ~20 s a frame on SwiftShader
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Render PNG Frames')).click());
const zipFile = await dl;
const zipPath = `${OUT}/${zipFile.suggestedFilename()}`;
await zipFile.saveAs(zipPath);
ok(/eidos-frames-\d{3,}x\d{3,}-.*\.zip$/.test(zipPath), `frames zip downloaded: ${zipFile.suggestedFilename()}`);

// Save Image → PNG download (button lives in the right dock).
const dl2 = page.waitForEvent('download', { timeout: 600000 });
await clickText('Save Image');
const png = await dl2;
await png.saveAs(`${OUT}/${png.suggestedFilename()}`);
ok(/\.png$/.test(png.suggestedFilename()), `image downloaded: ${png.suggestedFilename()}`);

// Record Video: still view must still yield frames; with 2+ keys it plays the
// sequence from key 1 and stops/downloads by itself.
{
  const { execFileSync } = await import('node:child_process');
  const frames = f => { try { return +execFileSync('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','csv=p=0', f]).toString().trim(); } catch { return 0; } };
  await page.evaluate(() => { const s = window.__eidos; s.seq.clear(); s.state.setMany({ renderScale: 0.25, maxSamples: 1, recMode: 0, recRes: 1, recQuality: 1 }); });
  await page.waitForTimeout(1500);
  let dlv = page.waitForEvent('download', { timeout: 600000 });
  await page.click('#recVideo');
  await page.waitForTimeout(2000);
  await page.click('#recVideo');
  let vid = await dlv; let vp = `${OUT}/${vid.suggestedFilename()}`; await vid.saveAs(vp);
  const stillFrames = frames(vp);
  ok(stillFrames > 10, `record still view → ${vid.suggestedFilename()} has ${stillFrames} frames`);
  await page.evaluate(() => { const s = window.__eidos; s.state.setMany({ seqDuration: 1, seqMode: 1 }); s.seq.add(s.state.sceneSnapshot()); s.state.setMany({ rotX: s.state.values.rotX + 0.4 }); s.seq.add(s.state.sceneSnapshot()); });
  dlv = page.waitForEvent('download', { timeout: 600000 });
  await page.click('#recVideo');
  await page.waitForFunction(() => /REC/.test(document.getElementById('hud').textContent), null, { timeout: 30000 }).catch(() => {});
  const mid = await page.evaluate(() => ({ playing: window.__eidos.seq.playing, hud: document.getElementById('hud').textContent }));
  ok(mid.playing && /REC/.test(mid.hud), `record plays the sequence (${mid.hud.slice(0, 24)})`);
  vid = await dlv; vp = `${OUT}/seq-${vid.suggestedFilename()}`; await vid.saveAs(vp);
  const after = await page.evaluate(() => ({ playing: window.__eidos.seq.playing, label: document.getElementById('recVideo').textContent }));
  ok(frames(vp) > 2 && !after.playing && after.label === 'Record Video', `sequence recording auto-stopped (${frames(vp)} frames, Loop = one cycle)`);
  await page.evaluate(() => window.__eidos.seq.clear());

  // Real-time at a chosen resolution: the drawing buffer is resized for the
  // recording (letterboxed on screen) and handed back to the layout afterwards.
  await page.evaluate(() => window.__eidos.state.setMany({ recMode: 0, recRes: 2, recFormat: 1 }));
  dlv = page.waitForEvent('download', { timeout: 600000 });
  await page.evaluate(() => document.getElementById('recVideo').click());
  // Wait for real frames (a 720p SwiftShader frame can take longer than any fixed delay),
  // then a few seconds so software VP9 emits something.
  await page.waitForFunction(() => document.getElementById('view').width === 1280, null, { timeout: 600000 }); // resized (accumulation reset)
  await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1, null, { timeout: 600000 }); // and drawn
  await page.waitForTimeout(4000);
  const during = await page.evaluate(() => [canvas => [canvas.width, canvas.height]][0](document.getElementById('view')));
  await page.evaluate(() => document.getElementById('recVideo').click());
  vid = await dlv.catch(async e => { throw new Error(`real-time 720p: no download — toast "${await page.textContent('#toast')}" (${e.message.split('\n')[0]})`); });
  vp = `${OUT}/rt-${vid.suggestedFilename()}`; await vid.saveAs(vp);
  const dims = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0', vp]).toString().trim();
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => { const c = document.getElementById('view'); return c.width === c.clientWidth && c.height === c.clientHeight && !c.style.objectFit; });
  ok(during.join('x') === '1280x720' && dims === '1280,720' && back, `real-time 720p: buffer ${during.join('×')}, file ${dims}, restored ${back}`);

  // Offline (frame-exact) through WebCodecs + our muxers, both containers.
  // Small viewer so SwiftShader stays quick; 0.25 s at 24 fps, Once = 7 frames.
  await page.setViewportSize({ width: 480, height: 300 });
  await page.evaluate(() => {
    const s = window.__eidos;
    document.getElementById('app').classList.add('no-left', 'no-right');
    s.state.setMany({ seqDuration: 0.25, seqMode: 0, recMode: 1, recRes: 1, recFps: 0, recSamples: 1 });
    s.seq.add(s.state.sceneSnapshot()); s.state.setMany({ rotX: s.state.values.rotX + 0.3 }); s.seq.add(s.state.sceneSnapshot());
  });
  await page.waitForTimeout(500);
  for (const [fmt, codec] of [[0, 'h264'], [1, 'vp9']]) {
    await page.evaluate(f => window.__eidos.state.setMany({ recFormat: f }), fmt);
    dlv = page.waitForEvent('download', { timeout: 600000 });
    await page.evaluate(() => document.getElementById('recVideo').click());
    vid = await dlv; vp = `${OUT}/off-${vid.suggestedFilename()}`; await vid.saveAs(vp);
    const info = execFileSync('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,nb_read_frames,r_frame_rate','-of','csv=p=0', vp]).toString().trim();
    let clean = true;
    try { const e = execFileSync('ffmpeg', ['-v','error','-i', vp, '-f','null','-'], { stdio: ['ignore', 'pipe', 'pipe'] }); clean = !e.toString().trim(); } catch { clean = false; }
    ok(info === `${codec},24/1,7` && clean, `offline ${vid.suggestedFilename().split('.').pop()} → ${info} (decodes clean: ${clean})`);
  }
  await page.evaluate(() => { const s = window.__eidos; s.seq.clear(); s.state.setMany({ recMode: 1, recRes: 0, recFps: 1, recSamples: 16, recFormat: 0, recQuality: 2 }); document.getElementById('app').classList.remove('no-left', 'no-right'); });
}

// Ground plane: picking a type in the panel loads its look; Place Under Fractal
// puts the plane inside the object's vertical span; every mode renders it.
{
  const g = await page.evaluate(async () => {
    const s = window.__eidos;
    const { BIOMES } = await import('/engine/presets.js');
    s.state.setMany({ ...BIOMES.menger.v, renderScale: 0.25, maxSamples: 1 });
    s.state.set('groundType', 2, 'ui');
    const col = s.state.values.groundColor;
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Place Under Fractal').click();
    return { col, y: s.state.values.groundY, toast: document.getElementById('toast').textContent };
  });
  const m = g.toast.match(/spans (-?[\d.]+) … (-?[\d.]+)/);
  ok(g.col === '#3d5a22' && m && g.y > +m[1] && g.y < +m[2], `ground: grass defaults ${g.col}, placed at y ${g.y} inside ${m ? m[1] + '…' + m[2] : '?'}`);
  for (const [type, mode] of [[5, 0], [7, 1], [3, 2]]) {
    await page.evaluate(([t, m]) => window.__eidos.state.setMany({ groundType: t, renderMode: m, maxSamples: 1 }), [type, mode]);
    await page.waitForTimeout(300);
    const okR = await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1 && !window.__eidos.renderer.isCompiling(), null, { timeout: 600000 }).then(() => true).catch(() => false);
    ok(okR, `ground type ${type} renders in mode ${mode}`);
  }
  await page.evaluate(() => window.__eidos.state.setMany({ groundType: 0, renderMode: 0 }));
}

// Fine-tune chip on a rotation slider: window shrinks to 1/20 then 1/200, re-centres.
await page.setViewportSize({ width: 1600, height: 900 });
await page.evaluate(() => {
  document.getElementById('app').classList.remove('no-left', 'no-right');
  const s = window.__eidos.state; s.resetAll(); s.setMany({ maxSamples: 1, renderScale: 0.25, alpha: 1.0 });
  [...document.querySelectorAll('.group-header')].find(h => h.textContent.includes('Folding & Space') && !h.classList.contains('active'))?.click();
});
const fineInfo = await page.evaluate(async () => {
  const row = document.querySelector('.slider-row[data-id="alpha"]');
  const chip = row.querySelector('.fine-toggle');
  const slider = row.querySelector('input[type=range]');
  const span = () => parseFloat(slider.max) - parseFloat(slider.min);
  const full = span();
  chip.click();
  const fine = span(), centre = (parseFloat(slider.max) + parseFloat(slider.min)) / 2;
  chip.click();
  const ultra = span();
  // Wheel nudge in ultra mode.
  slider.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
  const afterWheel = window.__eidos.state.values.alpha;
  chip.click();
  return { full, fine, ultra, centre, afterWheel, offSpan: span(), label: chip.textContent };
});
ok(Math.abs(fineInfo.fine - fineInfo.full / 20) < 1e-9 && Math.abs(fineInfo.ultra - fineInfo.full / 200) < 1e-9, `fine-tune windows: ${fineInfo.full.toFixed(3)} → ${fineInfo.fine.toFixed(4)} → ${fineInfo.ultra.toFixed(5)}`);
ok(Math.abs(fineInfo.centre - 1.0) < 1e-9, 'fine window centred on the current value');
ok(Math.abs(fineInfo.afterWheel - (1.0 + fineInfo.full / 200 / 100)) < 1e-9, `ultra wheel nudge = window/100 (alpha ${fineInfo.afterWheel.toFixed(6)})`);
ok(Math.abs(fineInfo.offSpan - fineInfo.full) < 1e-9, 'turning fine-tune off restores the full range');

// Unavailable controls are hidden, and hiding cascades through gate chains.
const hideInfo = await page.evaluate(async () => {
  const s = window.__eidos.state; s.resetAll();
  const tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const shown = sel => { const n = typeof sel === 'string' ? document.querySelector(sel) : sel; return !!n && n.offsetParent !== null; };
  const head = t => [...document.querySelectorAll('.sub-head')].find(h => h.textContent.startsWith(t));
  document.querySelectorAll('.group-header:not(.active)').forEach(h => h.click());
  await tick();
  const r = {};
  r.step2Shown = shown(head('A · Step 2')) && !shown(head('A · Step 3'));
  r.planeHidden = !shown('.slider-row[data-id="a1nx"]');
  s.set('a2t', 6); await tick();
  r.step3Appears = shown(head('A · Step 3')) && shown('.slider-row[data-id="a2nx"]') && shown('.slider-row[data-id="a2cw"]');
  s.set('a1t', 0); await tick();
  r.offCascades = !shown(head('A · Step 2')) && !shown('.slider-row[data-id="a2nx"]') && s.values.a2t === 6;
  s.set('a1t', 8); await tick();
  r.rotateShows = shown('.slider-row[data-id="a1ra"]') && !shown('.slider-row[data-id="a1lx"]');
  r.stackBHidden = !shown(head('B · Step 1')) && !shown('.slider-row[data-id="scaleB"]');
  s.set('hybridMode', 1); await tick();
  r.stackBShown = shown(head('B · Step 1')) && shown('.slider-row[data-id="scaleB"]') && shown('.slider-row[data-id="hybN"]') && !shown(head('Pattern'));
  s.set('hybridMode', 3); await tick();
  r.patternShown = shown(head('Pattern')) && !shown('.slider-row[data-id="hybN"]');
  r.boxPropsHidden = !shown(head('Box Proportions'));
  s.set('shape', 1); await tick();
  r.boxPropsShown = shown(head('Box Proportions'));
  r.stepDesc = [...document.querySelectorAll('.fold-desc')].some(d => shown(d) && d.textContent.startsWith('Rotate space mid-stack'));
  s.set('renderMode', 1); await tick();
  r.ptShown = shown(head('Path Tracing')) && !shown(head('Volumetric Glow'));
  s.resetAll(); await tick();
  return r;
});
for (const [k, v] of Object.entries(hideInfo)) ok(v, `gating: ${k}`);

// Open every accordion group for a UI screenshot.
await page.setViewportSize({ width: 1400, height: 3200 });
await page.evaluate(() => {
  document.getElementById('app').classList.remove('no-left', 'no-right');
  document.querySelectorAll('.group-header:not(.active)').forEach(h => h.click());
  window.__eidos.state.setMany({ shadows: true, a2t: 6, hybridMode: 3, b1t: 4, maxSamples: 1, renderScale: 0.25 });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/ui-full.png`, timeout: 600000 });

// ── Materials, textures, crease (render, differ from the classic look, no NaN) ──
{
  const shoot = async over => {
    await page.evaluate(async o => {
      const { BIOMES } = await import('/engine/presets.js');
      const s = window.__eidos; s.state.resetAll();
      s.state.setMany({ ...BIOMES.menger.v, dist: 3.6, maxSamples: 1, renderScale: 0.2, ...o });
      s.renderer.resetLive(); // no stale frame from the previous case
    }, over);
    await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1 && !window.__eidos.renderer.isCompiling(), null, { timeout: 600000 });
    return page.evaluate(() => {
      const c = document.getElementById('view'), g = c.getContext('webgl');
      const w = c.width, h = c.height, buf = new Uint8Array(w * h * 4);
      g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
      return Array.from(buf.filter((_, i) => i % 16 === 0)); // every 4th pixel's R channel
    });
  };
  const diff = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
  const base = await shoot({});
  const cases = [
    ['metal', { matOn: true, matAssign: 0, matAType: 1, matAAmt: 1, matAMix: 0.5, matATint: '#e2b86a' }],
    ['glass', { matOn: true, matAssign: 0, matAType: 2, matAAmt: 0.85, matAMix: 0.5, matATint: '#bfe6ff' }],
    ['iridescent', { matOn: true, matAssign: 0, matAType: 3, matAAmt: 0.5 }],
    ['glow', { matOn: true, matAssign: 0, matAType: 4, matAAmt: 1.5, matAMix: 1, matATint: '#ff8000' }],
    ['3 slots by fold count', { matOn: true, matAssign: 1 }],
    ['triplanar texture + bump', { texMode: 3, texSrc: 2, texScale: 3 }],
    ['fractalized texture', { texMode: 1, texSrc: 2, texMap: 1, texFracStart: 3, texScale: 0.5, texBlend: 2 }],
    ['path traced materials', { renderMode: 1, matOn: true, matAssign: 1, matBType: 2 }],
  ];
  const same = await shoot({ matOn: false, texMode: 0, creaseAmt: 0 });
  ok(diff(base, same) < 0.5, `materials off renders the classic image (mean diff ${diff(base, same).toFixed(2)})`);
  for (const [name, o] of cases) {
    const px = await shoot(o);
    const d = diff(base, px);
    ok(d > 1 && px.some(x => x > 0), `${name}: renders and changes the image (mean diff ${d.toFixed(1)})`);
  }
  // Crease tint needs creases: the menger's faces are flat, so use the coral.
  const { BIOMES: BB } = await import('../engine/presets.js');
  const coral = { ...BB.coral.v, dist: 3.4 };
  const c0 = await shoot(coral), c1 = await shoot({ ...coral, creaseAmt: 1, creaseCol: '#ff3010', creaseRad: 3 });
  ok(diff(c0, c1) > 1, `crease tint: changes the image (mean diff ${diff(c0, c1).toFixed(1)})`);
}

// ── Mutation grid ──
{
  await page.evaluate(async () => {
    const { BIOMES } = await import('/engine/presets.js');
    const s = window.__eidos; s.state.resetAll();
    s.state.setMany({ ...BIOMES.sierpinski.v, maxSamples: 1, renderScale: 0.2 });
    s.mutGrid.maxSamples = 1;
    s.mutGrid.open();
  });
  await page.waitForFunction(() => window.__eidos.mutGrid.tiles.every(t => t.samples >= 1), null, { timeout: 900000 });
  const r = await page.evaluate(() => {
    const g = window.__eidos.mutGrid, s = window.__eidos.state, before = { ...s.values };
    const lit = g.tiles.filter(t => { const d = t.cv.getContext('2d').getImageData(0, 0, t.cv.width, t.cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n > 0; }).length;
    const i = g.tiles.findIndex((t, k) => k !== g.parentIndex && Object.keys(t.diff).length);
    const dk = g.tiles[i].diff;
    g.tiles[i].cell.click();
    const applied = Object.entries(dk).every(([k, v]) => s.values[k] === v);
    g.back();
    const restored = Object.keys(dk).every(k => s.values[k] === before[k]);
    const kinds = new Set(g.tiles.map(t => JSON.stringify(t.diff))).size;
    return { n: g.tiles.length, lit, applied, restored, kinds, live: window.__eidos.renderer.live.samples };
  });
  ok(r.n === 9 && r.lit === 9, `mutation grid: 9 tiles rendered (${r.lit} lit)`);
  ok(r.kinds === 9, 'mutation grid: parent + 8 different children');
  ok(r.applied && r.restored, 'mutation grid: click breeds from the child, Back restores the parent');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__eidos.mutGrid.isOpen && window.__eidos.renderer.live.samples >= 1, null, { timeout: 600000 });
  ok(true, 'mutation grid: Esc closes and the viewer resumes');
}

// ── Click tools, repetition, deep zoom ──
{
  const px = async () => page.evaluate(() => {
    const c = document.getElementById('view'), g = c.getContext('webgl'), w = c.width, h = c.height, buf = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    let e = 0, lit = 0;
    const bg = [0, 1, 2].map(k => buf[k] + buf[(w - 1) * 4 + k]); // two corner pixels ×2 (background, after tone curve)
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) { const i = (y * w + x) * 4; e += Math.abs(buf[i] - buf[i - 4]) + Math.abs(buf[i + 1] - buf[i - 3]); if (Math.abs(2 * buf[i] - bg[0]) + Math.abs(2 * buf[i + 1] - bg[1]) + Math.abs(2 * buf[i + 2] - bg[2]) > 90) lit++; }
    return { edges: e / (w * h), lit: lit / (w * h), keys: [...window.__eidos.renderer.programs.keys()] };
  });
  const scene = async o => {
    await page.evaluate(async o => {
      const { BIOMES } = await import('/engine/presets.js');
      const s = window.__eidos; s.state.resetAll();
      s.state.setMany({ ...BIOMES.icosa.v, fog: 0, volumetric: 0, maxSamples: 1, renderScale: 0.25, ...o });
      s.renderer.resetLive();
    }, o);
    await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1 && !window.__eidos.renderer.isCompiling(), null, { timeout: 900000 });
    return px();
  };
  const single = await scene({});
  const grid = await scene({ repMode: 1, repCountX: 2, repCountY: 0, repCountZ: 2, repSpaceX: 3, repSpaceZ: 3, dist: 11 });
  const ring = await scene({ repMode: 2, repRingN: 8, repRingR: 3.5, repRingAxis: 1, dist: 10, repRotVar: 30, repColVar: 1 });
  ok(grid.keys.some(k => k.includes('|rep')) && grid.lit > 0.05 && ring.lit > 0.05 && Math.abs(grid.lit - single.lit) > 0.01, `repetition renders (grid ${(grid.lit * 100).toFixed(0)}%, ring ${(ring.lit * 100).toFixed(0)}% lit)`);

  // Deep zoom: a very close view is sharper with Deep Zoom than without.
  const close = { dist: 0.0005, targetX: 0, targetY: 0, targetZ: 0 };
  await scene({}); // pick on the single, unrepeated object
  const hit = await page.evaluate(async () => {
    const { pickPixel } = await import('/engine/de.js');
    const v = window.__eidos.state.values;
    const c = document.getElementById('view');
    return pickPixel(v, c.clientWidth / 2, c.clientHeight / 2, c.clientWidth, c.clientHeight).p;
  });
  if (hit) { close.targetX = hit[0]; close.targetY = hit[1]; close.targetZ = hit[2]; }
  const blurry = await scene({ ...close, deepZoom: false });
  const sharp = await scene({ ...close, deepZoom: true });
  ok(!!hit && sharp.keys.some(k => k.includes('|dz')) && sharp.edges > blurry.edges * 1.2, `Deep Zoom sharpens a ×8000 close-up (edge energy ${blurry.edges.toFixed(1)} → ${sharp.edges.toFixed(1)})`);
  const hud = await page.evaluate(() => document.getElementById('hud').textContent);
  await page.waitForTimeout(600);
  const hud2 = await page.evaluate(() => document.getElementById('hud').textContent);
  ok(/zoom ×/.test(hud2) && /precision OK|near float32|beyond float32/.test(hud2), `HUD shows zoom and precision ("${hud2.split('·').slice(-3).join('·').trim()}")`);

  // Click tools: a click without a drag places Light 2 off the surface, or zooms in.
  await scene({ clickMode: 2, lightPlace: 0.3 });
  const box = await page.locator('#view').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  const placed = await page.evaluate(async () => {
    const { pickPixel } = await import('/engine/de.js');
    const v = window.__eidos.state.values, c = document.getElementById('view');
    const h = pickPixel(v, c.clientWidth / 2, c.clientHeight / 2, c.clientWidth, c.clientHeight);
    const L = [v.light2X, v.light2Y, v.light2Z];
    const want = h.p.map((x, i) => x + h.n[i] * v.lightPlace * h.t);
    const m = document.querySelectorAll('.light-marker')[1];
    return { on: v.light2On, err: Math.hypot(...L.map((x, i) => x - want[i])), marker: m && m.style.display !== 'none' && document.querySelector('.light-markers').style.display !== 'none' };
  });
  ok(placed.on && placed.err < 1e-6 && placed.marker, `click places Light 2 ${0.3}×distance off the surface along its normal, marker shown (err ${placed.err.toExponential(1)})`);
  // Dragging still orbits and places nothing.
  const before = await page.evaluate(() => ({ x: window.__eidos.state.values.light2X, r: window.__eidos.state.values.rotX }));
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy, { steps: 4 }); await page.mouse.up();
  const after = await page.evaluate(() => ({ x: window.__eidos.state.values.light2X, r: window.__eidos.state.values.rotX }));
  ok(after.x === before.x && after.r !== before.r, 'a drag orbits and does not move the light');
  // Zoom tool: each click halves the distance toward the clicked point; Deep Zoom switches on below 0.05.
  await page.evaluate(() => window.__eidos.state.setMany({ clickMode: 4, deepZoom: false }));
  const d0 = await page.evaluate(() => window.__eidos.state.values.dist);
  let zoomed = 0;
  for (let k = 0; k < 8; k++) {
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(150);
    zoomed++;
    if (await page.evaluate(() => window.__eidos.state.values.dist < 0.03)) break;
  }
  const z = await page.evaluate(() => ({ d: window.__eidos.state.values.dist, dz: window.__eidos.state.values.deepZoom }));
  ok(z.d < d0 / 2 ** (zoomed - 1) && z.dz === (z.d < 0.05), `zoom tool: ${zoomed} clicks took the view from ${d0.toPrecision(3)} to ${z.d.toPrecision(3)}, Deep Zoom ${z.dz ? 'on' : 'off'}`);
  await page.evaluate(() => window.__eidos.state.setMany({ clickMode: 0 }));
}

// ── Extra lights (Light 2 / 3) ──
{
  const shootL = async over => {
    await page.evaluate(async o => {
      const { BIOMES } = await import('/engine/presets.js');
      const s = window.__eidos; s.state.resetAll();
      s.state.setMany({ ...BIOMES.menger.v, dist: 3.6, maxSamples: 1, renderScale: 0.2, ...o });
      s.renderer.resetLive();
    }, over);
    await page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1 && !window.__eidos.renderer.isCompiling(), null, { timeout: 900000 });
    return page.evaluate(() => {
      const c = document.getElementById('view'), g = c.getContext('webgl'), buf = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, buf);
      let r = 0, gg = 0, b = 0; for (let i = 0; i < buf.length; i += 4) { r += buf[i]; gg += buf[i + 1]; b += buf[i + 2]; }
      const n = buf.length / 4;
      return { r: r / n, g: gg / n, b: b / n, keys: [...window.__eidos.renderer.programs.keys()] };
    });
  };
  const red = { light2On: true, light2Color: '#ff2000', light2Int: 2.5, light2X: -3, light2Y: 3, light2Z: 4 };
  for (const [name, base] of [['surface', {}], ['path traced', { renderMode: 1 }], ['volumetric', { renderMode: 2 }], ['with materials', { matOn: true, matAssign: 1 }]]) {
    const a = await shootL(base), b2 = await shootL({ ...base, ...red });
    ok(b2.r - a.r > 1.5 && b2.r - a.r > (b2.b - a.b) + 1 && b2.keys.some(k => k.endsWith('|xl')), `Light 2 (red) adds red light — ${name} (ΔR ${(b2.r - a.r).toFixed(1)}, ΔB ${(b2.b - a.b).toFixed(1)})`);
  }
  const noSh = await shootL({ ...red, shadows: true, light2Shadows: false }), sh = await shootL({ ...red, shadows: true, light2Shadows: true });
  ok(noSh.r - sh.r > 0.3, `Light 2 shadows darken it (ΔR ${(noSh.r - sh.r).toFixed(2)})`);
  const blue = await shootL({ light3On: true, light3Color: '#0040ff', light3Int: 2.5, light3Relative: true, light3X: 0, light3Y: 0, light3Z: 0 });
  const plain = await shootL({});
  ok(blue.b - plain.b > 1.5, `Light 3 as a camera headlight lights the view blue (ΔB ${(blue.b - plain.b).toFixed(1)})`);
  await page.evaluate(() => { window.__eidos.state.setMany({ light2On: false }); });
  await page.waitForTimeout(1500);
  const hidden = await page.evaluate(() => { const n = document.querySelector('[data-id="light2X"]'); return !!n && !!n.closest('.gate-hidden'); });
  await page.evaluate(() => { window.__eidos.state.setMany({ light2On: true }); });
  await page.waitForTimeout(1500);
  const shown = await page.evaluate(() => { const n = document.querySelector('[data-id="light2X"]'); return !!n && !n.closest('.gate-hidden'); });
  ok(hidden && shown, 'Light 2 controls appear only when it is on');
}

// ── Presets, symmetry groups, Mandelbulber import through the UI ──
const litNow = () => page.evaluate(() => {
  const c = document.getElementById('view'), g = c.getContext('webgl'), buf = new Uint8Array(c.width * c.height * 4);
  g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, buf);
  const w = c.width, bg = [0, 1, 2].map(k => buf[k] + buf[(w - 1) * 4 + k]); // background from two corners
  let lit = 0; for (let i = 0; i < buf.length; i += 4) if (Math.abs(2 * buf[i] - bg[0]) + Math.abs(2 * buf[i + 1] - bg[1]) + Math.abs(2 * buf[i + 2] - bg[2]) > 90) lit++;
  return lit / (buf.length / 4);
});
const settle = () => page.waitForFunction(() => window.__eidos.renderer.live.samples >= 1 && !window.__eidos.renderer.isCompiling(), null, { timeout: 900000 });
for (const key of Object.keys(await page.evaluate(async () => (await import('/engine/presets.js')).BIOMES))) {
  await page.evaluate(k => { const s = document.getElementById('presetSelect'); s.value = k; s.dispatchEvent(new Event('change')); window.__eidos.state.setMany({ maxSamples: 1, renderScale: 0.2, fog: 0, volumetric: 0 }); window.__eidos.renderer.resetLive(); }, key);
  await settle();
  const lit = await litNow();
  ok(lit > 0.02, `preset ${key}: loads through the dropdown and renders (${(lit * 100).toFixed(0)}% lit)`);
}
{
  const n = await page.evaluate(() => [...document.querySelectorAll('select')].find(s => s.options[0]?.textContent.startsWith('Apply a symmetry group')).options.length - 1);
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => {
      const s = window.__eidos.state;
      s.setMany({ rotX: 0.6, rotY: -0.4, dist: 3.6, maxSamples: 1, renderScale: 0.2, hybridMode: 0, fog: 0, volumetric: 0 });
      const sel = [...document.querySelectorAll('select')].find(x => x.options[0]?.textContent.startsWith('Apply a symmetry group'));
      sel.value = String(i); sel.dispatchEvent(new Event('change'));
      window.__eidos.renderer.resetLive();
    }, i);
    await settle();
    const lit = await litNow();
    ok(lit > 0.02, `symmetry group ${i}: applies to Stack A and renders (${(lit * 100).toFixed(0)}% lit)`);
  }
}
{
  const { readFileSync } = await import('node:fs');
  const fx = new globalThis.URL('./fixtures/kifs_dodeca.fract', import.meta.url);
  const input = page.locator('input[type=file][accept=".fract,.txt,text/plain"]');
  await input.setInputFiles({ name: 'kifs_dodeca.fract', mimeType: 'text/plain', buffer: readFileSync(fx) });
  await page.waitForSelector('dialog.import-dialog[open]', { timeout: 60000 });
  const r = await page.evaluate(() => ({ text: document.querySelector('dialog.import-dialog').textContent, a1: window.__eidos.state.values.a1t, scale: window.__eidos.state.values.scale }));
  ok(/Kaleidoscopic IFS/.test(r.text) && r.a1 === 1 && Math.abs(r.scale - 2.618034) < 1e-9, `Mandelbulber import through the UI (stack starts with Abs, scale ${r.scale})`);
  await page.evaluate(() => document.querySelector('dialog.import-dialog').close());
}

// ── Layout: phone portrait / landscape (touch) and desktop ──
for (const [w, h, touch] of [[390, 844, true], [844, 390, true], [1440, 900, false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(URL);
  await pg.waitForFunction(() => window.__eidos && window.__eidos.renderer.live.samples > 0, null, { timeout: 600000 });
  await pg.evaluate(() => window.__eidos.state.setMany({ maxSamples: 1, renderScale: 0.25 }));
  const L = await pg.evaluate(() => {
    const r = sel => { const n = document.querySelector(sel); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom }; };
    const visible = sel => { const n = document.querySelector(sel); return !!n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0; };
    return {
      mtabs: document.body.classList.contains('mtabs'), view: r('#view'), bar: r('.mtab-bar'), barShown: visible('.mtab-bar'),
      tabs: [...document.querySelectorAll('.mtab')].map(b => b.textContent),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      left: r('#dockLeft'), right: r('#dockRight'), vw: innerWidth, vh: innerHeight,
    };
  });
  if (touch) {
    const portrait = h > w;
    const dockOk = portrait ? (L.view.y >= 0 && L.view.h > 0.4 * h && L.view.h < 0.6 * h && L.bar.y >= L.view.bottom - 1)
      : (L.view.x >= 0 && L.view.right <= L.bar.x + 1 && L.bar.w >= 260 && L.bar.w <= 340);
    ok(L.mtabs && L.barShown && dockOk && !L.overflowX, `${w}×${h}: docked view + tab bar ${portrait ? 'under it' : 'beside it'} (view ${Math.round(L.view.w)}×${Math.round(L.view.h)}, no sideways overflow)`);
    ok(L.tabs.includes('Fold Stack A') && L.tabs.includes('Hybrid · Stack B') && L.tabs.includes('Evolve · Undo'), `${w}×${h}: formula sections are tabs (${L.tabs.length} tabs)`);
    // Tap the Fold Stack A tab: its section is the one showing, and the step selector is reachable.
    await pg.locator('.mtab', { hasText: 'Fold Stack A' }).tap();
    await pg.waitForTimeout(400);
    const vis = await pg.evaluate(() => { const g = document.querySelector('.accordion-group.mt-active'); const sel = g && [...g.querySelectorAll('select')].find(x => x.options[0]?.textContent.startsWith('Apply a symmetry group')); return { title: g?.querySelector('.title')?.textContent, sel: !!sel && sel.getBoundingClientRect().height >= 30 }; });
    ok(vis.title === 'Fold Stack A' && vis.sel, `${w}×${h}: Fold Stack A tab shows its section, controls touch-sized`);
    // One-finger drag on the view orbits.
    const before = await pg.evaluate(() => window.__eidos.state.values.rotX);
    const vb = await pg.locator('#view').boundingBox();
    const cdp = await ctx.newCDPSession(pg);
    const tp = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: vb.y + vb.height / 2 }] });
    await tp('touchStart', vb.x + vb.width * 0.4); for (let k = 1; k <= 5; k++) await tp('touchMove', vb.x + vb.width * (0.4 + k * 0.04)); await tp('touchEnd');
    await pg.waitForTimeout(200);
    const after = await pg.evaluate(() => window.__eidos.state.values.rotX);
    ok(after !== before, `${w}×${h}: one-finger drag orbits (rotX ${before.toFixed(3)} → ${after.toFixed(3)})`);
  } else {
    ok(!L.mtabs && !L.barShown && L.left.right <= L.view.x + 1 && L.view.right <= L.right.x + 1 && !L.overflowX, `${w}×${h}: desktop docks flank the viewer (view ${Math.round(L.view.w)}×${Math.round(L.view.h)})`);
  }
  await pg.screenshot({ path: `${OUT}/layout-${w}x${h}.png` });
  ok(errs.length === 0, `${w}×${h}: no page errors ${errs.join(' ')}`);
  await ctx.close();
}

ok(errors.length === 0, `no console errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : 'browser checks passed');
process.exit(fail ? 1 : 0);
