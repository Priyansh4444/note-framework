---
name: ink-figures
description: Draw sampled paths as seeded brush marks inside a Note Framework note with InkFigure and brushStroke. Use for material, tracing and mark correspondence, rather than precise quantitative plots.
---

# Give a path a material

Use `InkFigure` and `brushStroke` from `src/kit`; see `InkExample` in `src/kit/patterns/recipes.tsx`. The component is a dark, retained brush-mark renderer; it does not embed the standalone rain story or load video.

`brushStroke(points,{seed,count,width})` samples an open polyline by distance and builds reproducible bristle marks. `points` are `[x,y]` pairs. Use the same seed and count across related scenes so each bristle keeps a partner. Compute samples from the actual curve or subject model. Changing input vertex density should not concentrate pigment in that region.

Each `InkScene` contains a unique `id`, visible `label`, and equally many ordered `marks`. A mark has `x,y,x2,y2,width,opacity`; coordinates are finite, width positive, opacity between zero and one. Hand-authored marks can show more than a single stroke, but correspondence remains the author’s responsibility.

Render `<InkFigure scenes={scenes} label="What path does the brush follow?" viewBox={[0,0,560,340]} />`. `initial` selects an ID; `value` and `onChange` link external selection. The component starts on a complete still and owns interruption, reduced motion and lifecycle sleep. Do not add an autoplay clock, extra slider, theme toggle or per-frame randomness.

Keep an exact line or numerical readout nearby if precision matters. Brush width and jitter are a material treatment, not measured error or uncertainty. Explain the geometric fact in normal prose.

Check deterministic reloads, unchanged mark identities, rapid reversals, reactive geometry, keyboard buttons, offscreen pause and reduced motion. Inspect dark contrast and all scene bounds at 320/390px. Resample incompatible inputs explicitly; do not hide count mismatches by dropping marks.
