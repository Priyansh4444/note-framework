# Visualization patterns

These are framework-native renderers, not embedded pages or video players. They use SolidJS and local CSS, with no runtime network resources.

- `LayerFigure` takes inspiration from [Hairline](https://hairline.lucasmarkes.com/skills): fixed resting hit regions, rounded planes, monochrome hierarchy, and sleeping motion. Its projection, damped model and SVG renderer are original. It does not import or modify Hairline’s kernel. The standalone folio study separately uses the actual upstream engine, with its MIT license preserved.
- `MorphFigure` extracts the original corresponding-contour model authored for the Form / Shift study, inspired by the visible behavior in [Aristide Benoist’s clip](https://x.com/AristideBenoist/status/2114065796964270089). Canvas 2D, retained points, and damped springs are used here; no private Rust/WebGPU code or reference artwork is included.
- `InkFigure` extracts retained brush-mark correspondence from the original ink study after [Bee’s clip](https://x.com/thtbee_/status/2114030630887641448). `brushStroke` samples author polylines by arc length and distributes deterministic seeded bristles. It does not import the scene artwork or Three.js code.

`recipes.tsx` is executable source used by the example and guide and included in the starter. The three narrow local skills explain when to use a pattern and its correspondence/meaning constraints. Components own visual settling; a note’s seekable mathematical scene remains a separate model. Interpolated shapes or marks need not be valid intermediate objects in the subject domain.
