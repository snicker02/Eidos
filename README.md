# Eidos v1.5.0

**Eidos** (εἶδος, Greek for "form", the *eidos* in kaleidoscope) is a progressive WebGL1 raymarcher for **Kaleidoscopic IFS** (KIFS) fractals. You build each iteration from a stack of fold steps (abs, plane swaps, Sierpinski, octahedral and icosahedral mirror sets, custom planes, the Menger z-trick, rotations, edge and box folds, dihedral folds, rotation-only (chiral) folds, sphere inversion, and Knighty's pseudo-Kleinian step), and Eidos compiles that stack into a straight-line shader. Mirror folds and rotations keep the distance estimate **exact**, so Step Factor 1.0 never overshoots. Inversions, chiral folds and the Kleinian step trade that for their own looks and are tracked as estimates.

It is the sibling of [Kyma](https://github.com/snicker02/Kyma). Both run on [**Organon**](https://github.com/snicker02/Organon), the shared engine: progressive rendering, path tracing, volumetric glow, three lights with click-to-place, materials and textures, repetition, deep zoom, the mutation grid, Evolve, keyframe animation, MP4 / WebM video and the phone tab layout. Eidos is the KIFS formula module (`formula/`), and Organon is included as a git submodule at `core/`. No dependencies, no build step.

## Run

Clone with the engine. ES modules also need a local server, because `file://` blocks module imports:

```
git clone --recurse-submodules https://github.com/snicker02/Eidos.git
cd Eidos
python3 -m http.server 8000
# open http://localhost:8000
```

If you already cloned without `--recurse-submodules`, run `git submodule update --init`. To move Eidos to a newer engine, run `git submodule update --remote core` on a branch, test, and commit the bump.

## Layout

| Left dock — **Formula** | Centre | Right dock — **Scene & Output** |
|---|---|---|
| Presets · Mandelbulber import | Viewer | Save image / record video |
| Fold Stack A (+ symmetry-group presets) | | Render mode, view, object transform |
| Rotation & Scale | | Repetition, colour & lens, materials |
| Per-Iteration Variation | | Environment, ground, lights |
| Hybrid · Stack B | | Animation sequencer, video export, quality |
| DE Shape · Iteration | | |
| *Evolve · Rebirth · Mutation Grid · Undo* | | *Discovery string · project · reset* |

`[` and `]` toggle the docks and `H` hides all UI. Below 900 px every section becomes a tab under the viewer (beside it in landscape), plus *Evolve · Undo* and *Save & Project* tabs.

## One iteration

```
z → pre-rotation → spin^i → step 1 → step 2 → … → post-rotation → s·(z − C) + C
dr → dr · |s|
```

After the last iteration (or once |z| passes **Bailout**), the distance is `shape(z) / dr`.

- **Scale s** and **Scale Centre C** (*Rotation & Scale*). `s·(z − C) + C` is Knighty's `s·z − C·(s − 1)`.
- **Pre-Rotation** runs before the stack (it tilts every fold plane). **Post-Rotation** runs after it, about the origin or, with **Post-Rotation About the Centre**, about C. **Rotations Start at Iteration** delays both, and the spin too.
- **Per-Iteration Variation**: **Scale Step** adds to s every iteration (s + i·step), **Centre Drift** moves C (C + i·drift), and **Iteration Spin** turns iteration i by spin^i. Each level of detail then differs slightly from the one above it.

## Fold steps

Stack A has 12 slots and Stack B has 8. Pick a fold for **Step 1**, and **Step 2** appears below it, and so on. Setting a step to *Off* ends the stack there. Every step also has a **Colour Weight** (see *Colour*) and **Runs on Iterations [From, Until)**: a step outside its range is skipped. So one stack can build the coarse shape with one fold set and the fine detail with another (the *Two-Phase Flake* preset runs octahedral folds for iterations 0–2, then Sierpinski from 3 on). Ranges are uniforms, so changing them never recompiles.

| Step | What it does | Compiled option |
|---|---|---|
| **Abs** | Mirror the chosen axes to positive. | Axes: XYZ, XY, XZ, YZ, X, Y, Z |
| **Plane Swaps** | Reflect across x = y, x = z, y = z (sorts the coordinates). | Sort x ≥ y ≥ z, or one swap |
| **Sierpinski (tetrahedral)** | Reflect across x + y = 0, x + z = 0, y + z = 0. | — |
| **Octahedral Planes** | Abs + sort: one cell of the 48-element octahedral group. | — |
| **Icosahedral Planes** | Reflect into one cell of the 120-element icosahedral group: mirrors x = 0, y = 0 and a golden-ratio plane, six passes. | — |
| **Custom Plane** | Fold across n·z = d (n is normalised). **Strength** < 1 is a partial reflection, like Mandelbulber's intensity. | — |
| **Menger Z-Trick** | Fold z about ½·C_z·(s − 1)/s, so the scale step shifts z on one side only. | Mirror (continuous) / Shift (Mandelbulber) |
| **Rotate** | Rotate mid-stack: α about Z, β about Y, γ about X (Mandelbulber's SetRotation3 order). | Pivot: origin / centre |
| **Edge Fold** | z → E − \|E − z\| per axis (E = 0 leaves that axis alone). | — |
| **Box Fold** | Mandelbox fold: clamp to ±limit and reflect. | — |
| **Dihedral N-Fold** | Mirror into one of N angular sectors around an axis. | Axis: X, Y, Z |
| **Sphere Inversion** | z → c + (z − c)·R²/\|z − c\|², blended by **Amount**, then shifted by **A** and scaled by **S**. Not a fold: see below. | — |
| **Tetrahedral Planes** | Reflect into one cell of the 24-element tetrahedral group Td (mirrors x = y, y = z, y = −z, four passes). | — |
| **Chiral Tetrahedral (T) / Octahedral (O) / Icosahedral (I)** | The mirror fold, then one more reflection when the count is odd, so the net map is a rotation: the 12 / 24 / 60 rotations of the group, without mirrors. Handed, twisted shapes (snub-like). Estimate: see below. | — |
| **Cyclic N-Fold** | Rotate into one of N sectors around an axis (no mirror): a pinwheel. Estimate. | Axis: X, Y, Z |
| **Kleinian (Knighty)** | Box fold to ±L, invert inside the sphere of radius R only (k = max(R²/\|z\|², 1)), add C. Use Scale 1 and the Kleinian shape. Estimate. | — |
| **Periodic Mirror Fold** | A box fold that repeats: mirrors at ±L, ±3L, ±5L … on each axis (L = 0 leaves the axis alone), so all of space folds into the box ±L. On iteration 0 only it tiles the fractal into an infinite lattice; on every iteration it makes a periodic sponge (with *Shapes at Every Level*: NewMenger, SphereSponge). Exact. | — |
| **N-Flake (nearest vertex)** | Syntopia's n-flake: move toward the nearest vertex V of a tetrahedron, octahedron, cube, icosahedron or dodecahedron (at **Vertex Distance**), so the iteration is s·(z − V) + V. Set the scale centre to 0. Estimate (the nearest vertex jumps between regions). | Vertices: 4, 6, 8, 12, 20 |

**Smooth folds** (after Benesi's *MengerSmooth*). Abs, Plane Swaps, Sierpinski, Octahedral Planes, Custom Plane and the mirror Menger z-trick have a **Smooth** box. It rounds every crease: along each fold's normal, |t| becomes √(t² + k²) (a swap keeps x + y and sets x − y to √((x − y)² + k²)). That still has slope ≤ 1, so the DE stays exact. **Softness k** is a uniform, and Smooth is compiled in. Softness 0 gives the hard fold exactly. Large k pushes points outward, so the fractal thins and can vanish: keep k small next to the shape (0.02–0.1).

**Compilation.** The step types and their compiled options make up the program key (`specKey` in `formula/glsl.js`), so each stack compiles once to straight-line GLSL with only the code it needs. Plane normals, limits, angles, N, strengths and colour weights are uniforms, so dragging a slider never recompiles. Programs compile in the background where `KHR_parallel_shader_compile` exists, and the previous image stays up meanwhile.

**Wythoff centre.** *Rotation & Scale → Centre → Wythoff (cell corners)* places the scale centre by weights on the three corners of one mirror cell: Tetrahedral (Td), Octahedral (Oh) or Icosahedral (Ih), matching the Tetrahedral, Octahedral and Icosahedral Planes folds and their chiral versions. One weight puts the centre on a corner (a vertex-type layout), two put it along an edge (truncated forms), three put it inside (omnitruncated forms; with a chiral fold, snub forms). **Centre Distance** sets |C|. The panel names each corner (e.g. 5-fold vertex, 2-fold edge midpoint, 3-fold face centre), and the tests check that every Wythoff centre lies in its fold's cell. Stack B keeps its own manual centre.

**Symmetry groups.** *Apply a symmetry group to Stack A…* (top of the Fold Stack A panel) writes a stack whose mirrors generate that point group, plus a centre and shape that suit it: tetrahedral Td (Sierpinski), octahedral Oh (face-, edge- and vertex-centred), cubic Menger, icosahedral Ih, orthorhombic D2h, tetragonal D4h, and hexagonal, trigonal and pentagonal prisms (D6h, D3h, D5h). The chiral groups T (23), O (432) and I (532), Td with its full mirror cell, and a C5h pinwheel are in the list too. It changes Stack A only (and switches the centre back to Manual) and can be undone.

## Exact distance estimate

Every fold step is 1-Lipschitz (a reflection, a fold, a rotation, a partial reflection with strength between 0 and 1, a smooth fold, or the periodic mirror fold). So an iteration stretches space by exactly |s|, the running derivative is exactly Π|s|, and `shape(F(p)) / dr` is a true lower bound on the distance. **Step Factor** defaults to 1.0, and that is safe. The tests check that every step and option is 1-Lipschitz and that every preset's DE is 1-Lipschitz in p.

**Some steps are estimates on purpose** (they're listed in `ESTIMATE_TYPES`):

- **Sphere Inversion** and the **Kleinian** step stretch space by R²/|z|², which is unbounded near the centre. They track that stretch in dr. It is the same in every direction (conformal), so this is Mandelbulber's first-order estimate.
- **Chiral** folds and **Cyclic N-Fold** rotate instead of reflect. Neighbouring regions get different rotations, so the map jumps across the seams between them. Away from the seams it is still exact.
- **N-Flake** moves each region toward its own vertex, so the map jumps where the nearest vertex changes.
- The **Kleinian** seed shape is Knighty's heuristic.

While any of these is in use, a note under *Fold Stack A* names them and shows the current Step Factor. Every estimate preset uses 0.8–0.9, and the tests measure that under 1% of steps at that factor land inside the surface (the worst, Twisted Icosahedral, is 0.3%).

Sphere Inversion is Kyma's two inversions in one step:

| Kyma | Eidos Sphere Inversion |
|---|---|
| **Enable Inversion** (centre, radius, Amount, DE Scale Limit), Pre-Fold | the step at the top of the stack, From 0 Until 250 |
| … Post-Fold | the same step at the bottom of the stack |
| **Mandelbulber Inversion** (O, Radius² G, A, Post Scale S, From / Until) | centre = −O, R = √G, Amount 1, DE Limit 0, shift A, scale S |

The tests check it against both of Kyma's formulas. An inversion stretches space by R²/|z − c|², which is unbounded near the centre, so no fold-style bound exists. The step multiplies that stretch into dr. At full Amount the stretch is exactly the same in every direction (the map is conformal), so this is Mandelbulber's first-order estimate; at partial Amount the tracked factor is an upper bound. **DE Limit** caps the factor near the centre, as Kyma's DE Scale Limit does, so the march doesn't stall; 0 turns the cap off. While an inversion is in the stack, a note under *Fold Stack A* says the DE is an estimate and shows the current Step Factor. The two inversion presets use 0.9 and 0.8.

The other exception is the Menger z-trick's **Shift** mode. That is Mandelbulber's own form, and it jumps. It gives the same DE as **Mirror** whenever an Abs on z comes next iteration, as in the Menger sponge (the tests check this too). Eidos uses Shift only for exact Mandelbulber imports.

**DE Shape** is the seed solid the folds carve:
- **Sphere** (radius = Size; 0 = a point, Mandelbulber's KIFS DE), **Box** (half-size × Box Proportions), **Shell** (hollow sphere, Thickness), **Box Frame** (the box's twelve edges: the wireframe-polyhedron look), **Axis Cross** (three rods ±Size along x, y, z), **Torus** (ring of radius Size around the chosen axis), **Capsule** (rod ±Size along the axis). All exact distances.
- **Octahedron**, **Tetrahedron**: plane-distance lower bounds (never overshoot).
- **Kleinian (Knighty)**: max(|z.xy| − Offset, |z.xy|·|z_z| / |z|), the shape of the pseudo-Kleinian DE. An estimate.
- **Square Cross**: three infinite square tubes of half-width Size along x, y, z (exact). It is the Menger sponge's carving tool.
- **Polyhedron · Tetrahedral / Octahedral / Icosahedral** (after Knighty's *Fold and Cut Polyhedra*): see below.

Use a shape that contains the attractor (Sierpinski → tetrahedron, Menger → box, the symmetry presets set one). Then the approximations nest, and the bailout shortcut stays a lower bound too.

### Fold-and-cut polyhedra

The polyhedron shapes fold into one mirror cell of Td, Oh or Ih (the same cells as the Wythoff centre) and put a vertex at the weighted corners: **Corner A / B / C**, at distance **Size**. One weight gives a regular polyhedron, two a truncated one, three an omnitruncated one. With **Vertex from the Wythoff Centre Weights**, the vertex follows the centre picker instead. Tick the parts to keep:

- **Faces A / B / C**: the planes through the vertex whose normals are the cell's corners (one face type per corner). This is a plane-distance lower bound.
- **Edges** (Edge Radius): segments from the vertex perpendicular to each mirror. Exact.
- **Vertices** (Vertex Radius): a ball at the vertex. Exact.

With *Fold count* colouring, each part gets its own colour. The tests build every polyhedron by brute force (the orbit of the vertex and its edges under the group) and check the edge and vertex distances against it exactly. They also check that the faces are a bound that passes through every vertex, and that Oh corner A gives the octahedron and corner C the cube. The polyhedron controls appear whenever the seed shape or the level shape is a polyhedron.

## Shapes at every level

*DE Shape → Shapes at Every Level* joins a second shape at every level of the fractal: inside each iteration, after its folds and before its scale (as in Knighty's iterated polyhedra, NewMenger and SphereSponge). Its distance is divided by that level's dr.

- **Union**: add the shape at every level, an ornament of rings, rods, balls or polyhedra at every scale.
- **Smooth Union**: blend it in with **Blend Radius** (in each level's own units).
- **Carve**: cut it out at every level, like the cross of tubes that makes a Menger sponge.
- **Intersect**: keep only what lies inside it at every level.

The **Level Shape** has its own size, thickness, axis and box, a **Position** in the folded frame, and a level range [From, Until). **Colour Offset per Level** shifts the gradient by (level + 1) × offset wherever the level shape decides the surface. All four modes keep the DE exact. Union and intersection of lower bounds are lower bounds, and so is carving, because no |dᵢ| exceeds the distance to that shape's boundary. The polynomial smooth union's gradient is a blend of the two inputs' gradients. The tests check all four for Lipschitz and ordering. They also check that a periodic fold with a carved square cross is NewMenger's sponge and that a carved sphere is SphereSponge, point for point. Mode and level shape are compiled in, and everything else is a uniform.

## Hybrid · Stack B

**Schedule** interleaves a second fold stack, which has its own **B Scale**, **B Centre** and **B Post-Rotation**:

- **B every Nth iteration** (N = 2: A, B, A, B …),
- **A for N iterations, then B** (coarse shape from A, fine detail from B),
- **Pattern**: up to 8 iterations, each checked box uses B, and the pattern repeats.

Pre-rotation, spin, variation and the DE shape are shared. Turning Stack B on compiles a program with both stacks in it. The schedule itself is a uniform.

## Presets

Classic KIFS (Sierpinski tetrahedron, Menger sponge, octahedral flake, icosahedral flake, dodecahedral cage, icosahedral dust), rotated KIFS (Knighty's cathedral, twisted Sierpinski, kaleido coral), symmetry groups (hexagonal drum, edge-folded dust), per-iteration variation (spun sponge, drifting flake), sphere inversion (inverted sponge, feathered Sierpinski), Wythoff centres and iteration ranges (truncated octahedral flake, two-phase flake), chiral folds (snub octahedral flake, twisted icosahedral, pentagonal pinwheel), seed shapes (wireframe sponge, ring flake), Kleinian (pseudo-Kleinian caves), and hybrids (Menger ⇄ Sierpinski, an AAB pattern). On a first visit the app opens on the Sierpinski tetrahedron.

Added in 1.5.0:

- **FragM classics**, ported from the Fragmentarium examples with their own settings: Koch Surface (Knighty's *Koch01*, its default preset), Treebroccoli (Kali), Octahedron and Dodecahedron (Syntopia), MultiIFS (Tryptophan, mode 0). The tests run each one against its .frag DE loop, transcribed, and they agree to 1e-9.
- **Smooth folds**: Smooth Menger (after Benesi), Soft Kaleido Coral.
- **Periodic fold**: Sierpinski Lattice, Menger Lattice (NewMenger), Sphere Sponge. The camera starts inside these three infinite worlds.
- **N-flakes**: Sierpinski Octahedron, Icosahedron Flake, Dodecahedron Flake (with polyhedron seeds).
- **Fold & cut polyhedra**: Truncated Icosahedron (a football: pentagons and hexagons, with ball-and-stick edges), Ball-and-Stick Flake, Polyhedral Ornament.
- **Shapes at every level**: Armillary Ornament (rings at every level of an icosahedral flake), Octahedral Rings (after Syntopia's *OctahedronOT*), Bubble-Carved Menger, Smooth-Union Flake.

**Rebirth** builds a random stack from a symmetry group, sometimes with an extra custom plane, rotation or edge fold, smooth folds or rings at every level, and random rotations. It is checked on the CPU so the camera is outside the shape and some of it is in view. **Evolve** and the **Mutation Grid** mutate only the controls that are live in the current stack.

## Mandelbulber import

**Import Mandelbulber Settings…** (Presets panel) loads a `.fract` file whose formula Eidos can port exactly onto the fold stack:

| Mandelbulber formula | Eidos stack |
|---|---|
| **Kaleidoscopic IFS** (10) | Abs (IFS_abs_x/y/z) → for each enabled plane: Rotate (IFS_rotations_i) + Custom Plane (direction, distance, intensity) → Rotate about the centre (IFS_rotation, if enabled) → Edge Fold (IFS_edge, if enabled) → Menger Z-Trick in Shift mode (menger sponge mode). Scale IFS_scale, centre IFS_offset. |
| **Menger Sponge** (7) | Abs → Sort → Z-Trick (Shift). Scale transf_scale_3, centre 2/(s − 1). |
| **Sierpinski 3D** (110) | Sierpinski (+ Sort for the reversed fold). Scale transf_scaleA_2, centre offset/(s − 1). Its rotation at the end of iteration i is the same as a pre-rotation at the start of iteration i + 1 (\|z\| doesn't change), so it imports as a pre-rotation that starts one iteration later. |
| **Hybrids of two of these** | Formula 1 → Stack A, formula 2 → Stack B, with the iteration counts as a Pattern (e.g. 2 + 1 → AAB). |

Iterations, bailout (each formula's default, or the file's own), DE factor (= Step Factor, because Mandelbulber's linear DE r / DE is exactly Eidos's DE with a point shape), fractal position and rotation, the camera (eye, target, roll, field of view), the main light, the material gradient, the colour texture, and a water / plane primitive (→ ground plane) all come across. Anything approximated or dropped (c addition, Julia mode, per-formula iteration ranges, analytic DE tweaks) is listed in the import dialog.

`tests/mb_reference.mjs` holds line-by-line ports of the three Mandelbulber formulas and its hybrid sequencing. They are written against Mandelbulber's own parameter names, not Eidos's code. The tests import the files in `tests/fixtures/` and require the DE to match these ports to 1e-9 at 400 points each.

## Render modes

**Render Mode** is at the top of the right dock. Each mode compiles to its own specialised shader, so the surface mode pays nothing for the others.

### Surface (fast)

Direct lighting, as before. The debug views and Auto-fix Cut-offs work in this mode.

### Path traced (global illumination)

A unidirectional path tracer. At each hit, one shadow ray goes to a random point on the light sphere (next-event estimation). A Fresnel-weighted choice then picks a cosine-weighted diffuse bounce or a roughness-blurred mirror bounce. Russian roulette starts after the second bounce.

- **Light sources.** Rays that escape are lit by the **environment image**, or by a sky color when there is no image, so a panorama becomes the scene's lighting.
- **Controls:** Bounces, Roughness, Metallic, Light Intensity and Size (soft shadows), Sky/Image Light, Sky Color, Trap Emission (the fractal glows where the orbit trap is small) and a Firefly Clamp.
- **Interaction.** It previews with the surface shader while anything moves, then converges once you stop. The PT shader compiles in the background.
- **Output.** Radiance is linear and is shown through the filmic tone curve. Raise **Live Max Samples** and **Export Samples** for clean stills.

### Volumetric glow

The distance field is treated as a density, `density·exp(−DE/thickness)`, and integrated front to back with emission and absorption. Solid shapes become glowing shells, and "dust" settings (where the DE plateaus and rays get stranded) become luminous clouds instead of cut-off surfaces.

- Empty space is skipped by stepping in proportion to the DE.
- **Light Shading** adds cheap self-shadowing toward the light.

## Cut-off surfaces (black gaps where the fractal should be)

A ray that uses every **Max Ray Step** without reaching the surface is drawn as background. With some settings, especially pre-fold inversion on every iteration, the orbit never escapes. The distance estimate then plateaus just above the hit threshold, so rays crawl forward in tiny steps and get stranded.

- **Iteration → Auto-fix Cut-offs** probes your current view on the CPU and lowers **Surface Detail** until rays converge.
- **Debug View → Miss Reason** shows each ray's fate: green = hit, red = ran out of steps, blue = passed Max Distance.
- If you see **red**, lower **Surface Detail** (most effective), raise **Max Ray Steps** (up to 1024), raise **Step Factor** (> 1 risks overshoot), or turn on **Shade Stranded Rays as Surface**.
- If you see **blue** (cut off with distance), raise **Max Distance**.
- **Spherical Inversion → DE Scale Limit** sets how far the inversion's derivative is trusted. Raising it never overshoots, but it marches more slowly near the inversion centre.

## Tone curve

**Color & Lens → Tone Curve** chooses between **Legacy**, the original look, and **Filmic (ACES)**. Path tracing always uses Filmic.

## Extra lights (Light 2, Light 3)

Two optional lights in **Atmosphere & Light**, below the main light. Each has
on/off, position (LX / LY / LZ), **Colour**, **Intensity**, **Casts Shadows**
(needs Soft Shadows on; the ground uses its own Ground Shadows switch) and
**Follows Camera** (position is then an offset from the camera, like the
main light's headlight mode).

They light everything the main light does:
- **Surface mode:** fractal, materials and the ground.
- **Volumetric glow:** the haze around each light takes its colour.
- **Path Traced mode:** each light gets its own shadow ray (next-event
  estimation).
- **Volumetric mode:** the lights tint the glow.

Unlike the main light, whose colour only tints highlights in Surface mode,
the extra lights colour both diffuse and specular light. Use them as warm/cool
rim and fill lights.

The extra-light code is compiled in only when Light 2 or Light 3 is on, so
scenes without them use exactly the classic shader. If a GPU can't build the
extra-light program, Eidos says so and turns them off.

## Click tools

**View › Click Tools › Click on View** sets what a plain click on the image does (a drag still orbits; a click is a press and release that moves 4 px or less):

- **Place Main Light / Light 2 / Light 3:** the light moves to the clicked surface point, lifted off it along the surface normal by **Light Distance from Surface** × the camera's distance to that point (0.3 = close rim/fill light, 1–2 = broad light). Placing Light 2 or 3 also switches it on. If the light **Follows Camera**, the position is stored as the matching camera-relative offset, so it stays put on screen as you orbit.
- **Zoom ×2 into Point:** the orbit target jumps to the clicked point and the distance halves; the camera stays where it is, so the clicked detail moves to the centre. Below distance 0.05 Deep Zoom switches on by itself.

On touch screens a tap is a click. While a light tool is active, small coloured markers show where each light sits on screen. Every placement can be undone with Ctrl+Z.

## Repetition / arrays

The **Repetition / Arrays** panel (right dock) repeats the object:

- **Grid:** copies at ± **NX / NY / NZ** cells (0 = one layer, 2 = 5 copies along that axis) with **SX / SY / SZ** spacing between centres.
- **Ring:** **Copies** around a circle of **Radius** about **Ring Axis**. **Copies Turn with the Ring** rotates each copy to face outward; off keeps them all facing the same way.
- **Per-copy variation:** **Rotation Variation** (random axis, up to ± that many degrees), **Scale Variation**, **Colour Variation** (offsets the gradient per copy) and **Variation Seed**. Mutation and Evolve also vary these.

Each copy is its own exact fractal, cut at the walls of its cell (grid) or sector (ring). A KIFS is compact (it fits inside its shape's bounding radius), so copies spaced wider than that never touch. Set the spacing larger than the object (about 2 × its radius). The repeated program is compiled only when repetition is on.

## Deep zoom

With **View › Deep Zoom (pixel-sharp close-ups)** on, the surface threshold, normals and ambient occlusion follow the pixel size instead of fixed world sizes, so detail stays sharp to about ×10⁵. **Add Iterations as You Zoom** adds about one formula iteration for every halving of the distance below 5 (×1 = one per halving, capped at 250), because finer detail needs more iterations to appear. The HUD shows the zoom, the iteration count actually used and a precision tag:

- **precision OK:** float32 resolves the view.
- **near float32 limit:** the pixel size is approaching the float32 spacing at that position, so expect some grain.
- **beyond float32: blocky:** WebGL1 has no double precision. Past roughly distance 1e-5–1e-6 (lower near the origin, higher far from it) the image breaks into blocks. Going deeper would need emulated double precision through every iteration, which would make the shader many times slower.

**Click on View › Zoom ×2 into Point** is the quickest way to dive. Eidos offers Deep Zoom the first time you get closer than 0.02.

## Mutation grid

**▦ Mutation Grid** (footer, under Evolve) fills the viewer with the current
scene as the **parent** (outlined: centre of a 3 × 3, top-left of a 4 × 4)
and its mutated children, each rendering live in its own tile, like
JWildfire's mutation window.

- **Click a child** to make it the parent; a new set of children appears.
  Keep clicking to breed toward something you like.
- **Click the parent** (or **⟳ Re-roll**) for a fresh set of children.
- **↶ Back** returns to the previous parent. Every pick is also on the main
  Undo stack.
- **Strength** sets how far each child strays (Evolve's mutation size).
- **Lock colour** keeps the gradient offset fixed so only the shape changes.
- **✓ Done** or **Esc** closes the grid and keeps the current parent.

Children come from Evolve: 3–5 random changes to parameters that are active
in the current scene. Wave Warp, material key and texture scale join the pool
when they're switched on. Each child is checked on the CPU first, and one
that puts the camera inside the surface or shows no surface is re-drawn (up
to 6 tries). Hover over a tile to see which parameters changed. The main
viewer pauses while the grid is open. Path-traced scenes preview in surface
mode in the tiles.

## Materials & textures

Everything in this panel is off by default. When off, the shading is exactly
the classic one: the material code isn't even compiled in. Turning on
materials, a texture or crease tint builds a separate program (a short
compile the first time). If a GPU can't build that program, Eidos says so,
switches materials, texture and crease off, and keeps rendering.

### Material slots

**Enable Materials** gives the surface up to three material slots (A, B, C).
**Assign Slots By** picks what decides which slot a point gets:

| Key | Slot changes with |
|---|---|
| Single | slot A everywhere |
| Fold Count | the weighted number of reflections the fold steps made |
| Orbit Trap | how close the orbit came to the origin |
| Colour Index | position in the gradient, so slots follow the colour bands |
| Crease Depth | crevices vs. ridges |
| Height | world Y |
| Facing Up | surface direction (try "snow" on upward faces) |

The key is multiplied by **Key ×**, shifted by **Key +**, wrapped
into 0–1 if **Repeat Bands** is on, then split at **A | B** and **B | C**
with **Band Softness**.

Each slot has a **Type**, a **Tint** (and **Mix**: 0 = keep the gradient
colour, 1 = tint only), **Rough** and an **Amount (by type)** whose meaning depends on
the type:

| Type | Amount |
|---|---|
| Standard | shine (extra gloss) |
| Metal | metalness: coloured reflections, no diffuse |
| Glass | transparency: refracts (Glass Index of Refraction) and crosses the solid. In Surface mode you see the background / environment through it; Path Traced mode follows the ray into the scene behind |
| Iridescent | film thickness: thin-film interference (soap bubble / oil slick) colours that shift with viewing angle |
| Glow | intensity: light from inside the surface, strongest at grazing angles |

Metal, glass and iridescent show best with an **Environment** image (they
reflect it). Without one, they reflect a soft studio gradient made from the
background and light colours. Glass on a thick solid can't be crossed in a
reasonable number of steps, so it shows the dimmed background straight
through. It looks most like glass on thin shells and ribbons. All types also
work in Path Traced mode, with real refraction and film reflections.
Volumetric mode ignores materials.

### Crease colour

**Crease Tint** colours crevices, with or without materials. It measures how
much the free space a little way off the surface falls short of what the
local DE slope predicts. This cancels the DE's under-estimate, which plain AO
reads as occlusion everywhere. **Radius** sets the crease size. It grows with
distance, so creases read the same near and far.

### Texture

**Texture** = Colour, Bump, or Colour + Bump, with or without materials.

- **Image**: seven tileable procedural textures (Marble, Cells, Rust, Brushed
  Metal, Bark, Lava Cracks, Stone; no files needed) or **Loaded Image**. Load
  any image with **Load Texture Image…**. It's kept for the session but not
  saved in projects or discovery strings.
- **Mapping**:
  - **Surface (seamless triplanar)**: the image is projected along X, Y and
    Z and blended by the surface direction (**Seams**). There is no UV
    seam anywhere, and it's attached to the fractal's own frame, so it moves
    with Object Transform.
  - **Fractalized orbit (Mandelbulber)**: Mandelbulber's "texture
    fractalize". From iteration **From It** on, the first orbit point
    within a cube of half-size **Cube** around the start point becomes
    the texture coordinate (planar: u = −x·scale − offset X,
    v = y·scale − offset Y). The texture repeats with the fractal's
    self-similarity. This is how Mandelbulber's "fractalize" texture mode works.
- **Blend**: Multiply (Mandelbulber's rule), Overlay, Replace, Screen;
  **Colour** sets how much.
- **Apply To**: all slots or a single slot.
- **Bump**: perturbs the normal from the texture's brightness, measured over
  about 1.5 pixels, so it reads the same at any zoom.
- **Blur**: picks a coarser mip level.

### Importing Mandelbulber textures

A colour texture in a .fract file (material 1) comes across:
fractalized or surface mapping, scale (1/scale X), centre, cube size, start
iteration and intensity (Multiply). The image itself lives on the author's
disk, so the import note names the file. Load it with **Load Texture Image…**
to match the render. Until then Marble stands in. The built-in
presets stay texture-free.

## Ground plane

A horizontal plane at **Height** that the fractal stands on (right dock, *Ground Plane*). It is a separate surface in the ray march, not part of the formula, so it changes nothing about the fractal's shape, colour or distance estimate. It receives the fractal's shadows (**Receives Shadows**) and contact darkening (Surface AO).

| Ground | What it is |
|---|---|
| Matte | Plain colour, for a studio floor or shadow catcher |
| Grass | Two-colour patches with blade streaks, on rolling hills (**Terrain**) |
| Sand | Dunes with wind ripples and grain |
| Rock | Lumpy rock with cracks |
| Water | Wave normals (**Waves**), Fresnel reflection of the fractal and sky, sun glint |
| Mirror | Flat reflection, tinted by Color |
| Checker | Studio tiles (**Texture Scale** = tile size) |

- Picking a type in the panel loads its starting colours and terrain (Ctrl+Z undoes it).
- **Place Under Fractal** finds the bottom of the object in view and sets the plane just above it, so the base sits slightly sunk in.
- **Horizon Haze** blends the ground into the sky (or the panorama) with distance, so there's no hard edge where Max Distance ends.
- Fine detail (blades, grain, tiles) fades out with distance to avoid shimmer.
- In **Path Traced** mode the ground is a real material: diffuse for the textures, a rough mirror for Mirror (Reflectivity = metalness, Blur = roughness) and a Fresnel dielectric for Water. It bounces light onto the fractal.
- In **Volumetric** mode the glow stops at the ground, which shows behind it.

**Plane Orientation** tilts the plane (**Tilt X / Tilt Z**, ±45°) about the point under the origin, at **Height**. **Spin** turns the texture and terrain, and **Slide X / Z** moves them across the plane, which is useful for finding a nicer patch of dunes or waves. **Level Plane** zeroes all five.

## Object transform

The *Object Transform* panel (right dock) moves the fractal itself: **Position** X/Y/Z, **Rotation** (pitch, yaw, roll in degrees) and **Object Scale**. The camera, light and ground don't move.

- The formula is evaluated in the object's own frame. Rotating and moving keep the distance estimate exact, and scale multiplies it back out, so the shape, colours and cut-off behaviour are unchanged. The test suite checks DE(pos + s·R·q) = s·DE(q), and the GPU matches the CPU to 0.0001%.
- **Drop onto Ground** moves the object up or down so its base sits just into the ground plane, leaving the plane where it is. **Place Under Fractal** in the Ground panel does the reverse and moves the plane. **Reset Object** returns to the origin.
- Every transform value can be keyframed, so the sequencer can turn an object on a still plane, or hold the object while the plane tilts.

These are procedural textures, not geometry: grass has no individual blades, and water doesn't refract. Pair the ground with an environment panorama for a sky.

## Gradients

The surface colour comes from a gradient indexed by the orbit trap. **Gradient** has 35 built-ins plus **Custom (5 colors)** and **Imported (Mandelbulber)**:

- **Original eight** (Cosmic Neon … Ice & Fire): cosine palettes.
- **Perceptual maps**: Inferno, Magma, Viridis, Twilight.
- **Warm**: Sunset Strip, Lava, Blood Moon, Copper.
- **Cool / natural**: Ocean Depths, Aurora, Emerald, Rust & Teal.
- **Neutral**: Chrome, Bone, Ink Wash.
- **Bright**: Spectrum, Vaporwave, Candy, Pastel Dream.

- **Stripes & ornament**: Circus Stripes, Awning Teal, Lime Ribbon, Candy Cane, Orange Sash (hard-edged bands), Gilded Filigree, Moss & Gold, Shell Pink.

**Color Source** chooses what indexes the gradient:

- *Orbit trap* (default): the closest the orbit comes to the origin, which gives smooth colour flow.
- *Fold count (stripes)*: every reflection a fold step actually makes adds that step's **Colour Weight** (only in the first **Color Iterations**), × **Fold Colour ×**. Piecewise constant over the surface, so a banded gradient gives crisp stripes.
- *Trap + folds*: both added together.
- *Per-step orbit traps*: for each step, the smallest |z|² seen right after that step, weighted by the step's **Colour Weight** and summed. Weight one step up to colour by what it does.

Multi-stop gradients are blended in OKLab, so transitions keep even brightness instead of going muddy midway. Controls:

- **Gradient Offset**: slides the colours along the surface.
- **Gradient Repeat**: how many times the gradient cycles across the same structure.
- **Wrap**: *Repeat* jumps from the last colour back to the first; *Mirror* runs there and back with no seam; *Auto* mirrors gradients that don't loop (Inferno, Lava…) and repeats the ones that do.
- **Reverse**, **Gradient Hue** (a rotation around the grey axis, so brightness holds) and **Gradient Saturation**.
- **Custom**: five colour stops, looping.

The strip under the dropdown shows the actual gradient after every modifier; click it to step to the next one. Offset, Repeat, Hue, Saturation and the custom stops all animate in the sequencer.

## Environment

The **Environment** group sets the background in one of three modes: a **Solid Color**, a **Backdrop** (an image cover-fitted to the view) or a **Panorama** (an equirectangular 360° sky with yaw and pitch).

- **Image-based lighting.** Fresnel reflections and image-tinted ambient light are applied to the surface. Fog can take the image color.
- **Built-in images.** Studio, Sunset, Nebula and Aurora are generated procedurally, with no image files.
- **Your own images.** Use **Load Image…** or drop an image on the viewer. 2:1 images load as panoramas; any other shape loads as a backdrop.
- **Projects.** Saved projects embed uploaded images (JPEG) and remember presets by name. Discovery strings carry the settings but not the image.
- **Blur and tiling.** Images are normalised to a mipmapped power-of-two texture. Blur uses explicit LOD via `EXT_shader_texture_lod` where available, which avoids a mip seam where the panorama wraps.

## Controls

| Input | Action |
|---|---|
| Left drag | Orbit |
| Right drag / wheel / pinch | Dolly |
| Middle drag | Pan |
| WASD, Q/E, Shift | Fly the orbit target (Shift = sprint) |
| Double-click / F | Autofocus depth of field under the cursor / centre |
| Click (no drag) | View › Click on View: place a light or zoom ×2 into the point |
| K / Space / Esc | Add keyframe / play–stop / stop |
| `[` / `]` / H | Toggle left dock / right dock / all UI |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |

On touch screens: one-finger drag orbits, pinch dollies, two-finger drag pans and double-tap autofocuses. With a Click on View tool active, a tap is a click (place a light or zoom), and double-tap autofocus is off until Click on View is back on Orbit only.

## Rendering & export

- **Progressive.** It renders one sample per pixel while you interact, then accumulates for anti-aliasing and converged depth of field up to **Live Max Samples**. After that the GPU goes idle.
- **Save Image.** Renders 512² tiles × N samples, with pacing so no single draw can trigger the Windows TDR watchdog. Supports viewport, 1080p, 1440p, 4K and 8K.
- **Video & Frames Export panel** (right dock). These settings drive both Record Video and Render PNG Frames; a summary line shows exactly what the next recording will be.
  - **Record Mode.** *Offline (frame-exact)*, the default, needs 2+ keyframes: every frame is fully rendered (tiled, **Samples / Frame**), then encoded with the browser's WebCodecs encoder and packed into MP4 or WebM by Eidos's own muxer. Timestamps are exact, so the video plays at the right speed however long each frame took — this is the mode for 4K and clean path-traced or volumetric animation. *Real-time* records the viewer as it plays (1 sample per moving frame). With 2+ keyframes it rewinds, records one pass (Once), one cycle (Loop) or there-and-back (Ping-Pong) and stops by itself; with none it records the live view until Stop Rec. Offline without keyframes falls back to real-time.
  - **Resolution.** *As Save Image* (follows the dropdown beside Save Image), Viewer, 720p, 1080p, 1440p or 4K. Sizes are rounded to even numbers for the encoders. Real-time resizes the drawing buffer to the chosen size (letterboxed on screen while recording) and is capped at 1440p (a sustained 4K live capture can reset GPU drivers).
  - **Frame Rate** 24 / 30 / 60. **Quality** Draft / Good / High / Maximum = 0.05 / 0.1 / 0.2 / 0.4 bits per pixel per frame (1080p30 High ≈ 12 Mb/s, Maximum ≈ 25 Mb/s). **Format** MP4 (H.264) or WebM (VP9); if the browser can't encode the chosen one at that size, the other is used and you're told.
  - Cancelling an offline render offers to save the frames finished so far as a video.
- **Render PNG Frames.** The same frames as an offline recording, saved losslessly as a zip of PNGs. Assemble it with:
  `ffmpeg -framerate 30 -i frame_%05d.png -c:v libx264 -crf 14 -pix_fmt yuv420p out.mp4`

## Reset buttons

Every slider, dropdown and colour has a **↺** button beside its value that sets it back to its default (0 for most offsets and rotations). The button is dimmed while the value is already at the default.
## Files

```
index.html          docked three-column shell (styles: core/css/style.css)
main.js             entry point: installs the formula, then loads the Organon app shell
formula/            Eidos's formula module (the Organon contract, see core/README.md)
  index.js          the formula object: names, presets menu, hooks
  kifs.js           fold-step library: GLSL emitter + CPU port side by side, shapes, schedules, symmetry groups
  params.js         left-dock parameter schema (fold-stack slots generated)
  glsl.js           formula uniforms, mapLocal(); fold stacks → specialised program, spec keys
  uniforms.js       formula uniforms + program-spec data (per-slot uniforms for the live steps)
  de.js             CPU distance estimator (autofocus, Rebirth, picking, tests)
  presets.js        presets, symmetry groups, Rebirth's random stacks
  mbimport.js       .fract import of Kaleidoscopic IFS, Menger Sponge, Sierpinski 3D, hybrids (the scene part is Organon's)
  ui.js             symmetry-group menu, estimate warning, step / Wythoff / schedule descriptions
core/               Organon engine (git submodule): renderer, camera, scene params, UI, sequencer,
                    export, video, .fract scene import …  — see core/README.md
tests/run.mjs       node logic tests      (npm test)
tests/browser.mjs   headless-GPU checks   (dev only, needs Playwright)
tests/lib.mjs       the formula on the engine, under the names the tests use
tests/mb_reference.mjs  Mandelbulber formula ports used by the import tests
tests/fixtures/     .fract files for the import tests
```

**Adding a fold step type:**
1. Add its name to `STEP_NAMES` and a description to `STEP_DESC` (`formula/kifs.js`).
2. Write its GLSL in `glslBody()` and the same maths in `cpuStep()`, side by side.
3. If it needs numbers, give them slot fields in `slotParams()` (`formula/params.js`) and pack them into `p` / `q` in `slotData()`.

The tests check that it compiles in every render mode, that it is 1-Lipschitz, and (in the browser) that the GPU agrees with the CPU.

## Testing

```
npm test                                  # schema, camera, fold steps (Lipschitz, group cells), exact DE,
                                          # symmetry invariance, spec keys, hybrids, colour, sequencer,
                                          # codec, materials, lights, repetition, Mandelbulber import,
                                          # evolve/rebirth, zip, smooth folds, periodic fold, n-flake,
                                          # polyhedra (brute force), level shapes, FragM ports —
                                          # and glslangValidator over 254 programs
python3 -m http.server 8000 & node tests/browser.mjs
```

`tests/browser.mjs` checks:
- that GPU and CPU distances agree for every step type and option, every preset, the hybrids, variation, shapes, the object transform and repetition;
- that the exporter matches the live render, and that all three render modes work;
- that every preset and symmetry group renders, and that Mandelbulber import works through the UI;
- the gating cascades (step chain, Stack B, pattern, shape);
- the materials, lights, mutation grid, click tools, deep zoom, video and PNG-frame exports;
- the layouts at 390×844 and 844×390 with touch (docked view, tabs, one-finger orbit) and at 1440×900 desktop.

## Credits

The 1.5.0 features and presets come from the [Fragmentarium examples](https://github.com/3Dickulus/Fragmentarium_Examples_Folder) that ship with [FragM](https://github.com/3Dickulus/FragM). Eidos re-implements the maths; no shader code was copied. Thanks to their authors:

- **Knighty**: *Fold and Cut Polyhedra* (the polyhedron shapes), *Icosahedral_polyhedra_iterated* (polyhedra at every level), *Koch01* (the Koch Surface preset), and the pseudo-Kleinian DE (since 1.2.0).
- **Mikael Hvidtfeldt Christensen (Syntopia)**: *Tetrahedron-Alternative* (the N-Flake step), *Octahedron*, *Dodecahedron* and *OctahedronOT* (presets, and orbit shapes at every level).
- **M. Benesi**: *MengerSmooth* (smooth folds).
- **Kali**: *Treebroccoli*.
- **Tryptophan**: *MultiIFS*.
- *NewMenger* and *SphereSponge* (the periodic fold and carving at every level).
- **Inigo Quilez**: the polynomial smooth minimum, the box-frame distance and the carved-cross Menger.

## Changelog

**1.5.0** — Five additions from the FragM / Fragmentarium examples:
- **Shapes at every level**: Union, Smooth Union, Carve or Intersect a second shape at every iteration, with its own size, position, level range and per-level colour. Exact.
- **Fold-and-cut polyhedra** (Knighty): three new seed shapes (Td, Oh, Ih). Corner weights pick the uniform polyhedron (or follow the Wythoff centre), and you choose which faces, edges and vertices to keep. Each part has its own fold-count colour.
- **Smooth folds** (Benesi): a Smooth box and Softness on Abs, Plane Swaps, Sierpinski, Octahedral, Custom Plane and the mirror z-trick. Exact.
- **Periodic Mirror Fold**: a repeating box fold for infinite lattices and periodic sponges. Exact.
- **N-Flake** step (Syntopia): nearest-vertex IFS on 4, 6, 8, 12 or 20 vertices. An estimate.

Also: a **Square Cross** seed shape, 20 presets in six new groups (credited above), and Rebirth sometimes adds smooth folds or level rings. The new tests cover Lipschitz checks for all 15 smooth variants and the periodic fold, ports of six FragM DE loops plus Benesi's, NewMenger and SphereSponge, brute-force polyhedra, the level-shape ordering, and glslangValidator over 254 programs. Existing presets, links and projects are unchanged.

**1.4.0** — Now runs on [Organon](https://github.com/snicker02/Organon) 1.0.0, the engine shared with Kyma, as a git submodule at `core/`. The KIFS formula moved to `formula/`. There is no change to how Eidos looks or works: every preset renders pixel-identical images, and old links and projects load the same.

**1.2.0** — Every step gets an iteration range (From / Until). Wythoff centre picker (Td / Oh / Ih mirror-cell corners). New steps: Tetrahedral Planes (Td), Chiral Tetrahedral / Octahedral / Icosahedral, Cyclic N-Fold, Kleinian (Knighty). New seed shapes: Shell, Box Frame, Axis Cross, Torus, Capsule, Kleinian. Nine presets and five symmetry groups. The estimate note now covers every estimate-making step and shape. Tests: group cell sizes, chiral folds are rotations and their shapes are handed, Kleinian matches Knighty's DE exactly, Wythoff centres stay in their cell, the new shapes are exact, and the overshoot rate of every estimate preset is measured.

**1.1.0** — **Sphere Inversion** fold step: Kyma's inversion and its Mandelbulber-style inversion in one step (centre, radius, Amount, shift, scale, DE Limit, iteration range), with tracked derivative, a live "DE is an estimate" note, and two presets (Inverted Sponge, Feathered Sierpinski). Tests: parity with both Kyma formulas, tracked factor = true stretch, GPU/CPU parity.

**1.0.0** — First release. Forked from Kyma 2.20's engine, with a new KIFS formula layer: compiled fold stacks (11 step types), exact DE, two-stack hybrid schedules, per-iteration variation, four DE shapes, per-step colouring, symmetry-group presets, and Mandelbulber import with reference ports. A correct icosahedral fold (the 120-cell H3 fundamental domain).

---

Created with help from Claude AI

## Shared image shelf

The **⇄ Shelf** button opens the image shelf shared by all apps on [snicker02.github.io](https://snicker02.github.io/#shelf). It stores images in this browser only (IndexedDB), and every app on the site can read the same shelf.

- **Save current** puts the current view on the shelf.
- **Send to ↗** opens another app in a new tab with the image already loaded.
- **Load here** brings a shelf image into this app as the environment (reflections and background), the same as Load Image. Opening the app with `?shelf=<id>` does the same on start, which is how Send to works.

The shelf code lives in [`snicker02.github.io/shared/bridge.js`](https://github.com/snicker02/snicker02.github.io/blob/main/shared/bridge.js). If it can't load (for example when you're offline), the app works as before and the button is hidden.

## License

MIT — see [LICENSE](LICENSE).
