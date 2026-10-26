---
name: layer-figures
description: Separate a Note Framework drawing into selectable isometric construction layers with LayerFigure. Use for guides, outlines, samples or overlapping contributions that readers need to inspect individually.
---

# Separate one drawing

Use `LayerFigure` from `src/kit`; start from `LayersExample` in `src/kit/patterns/recipes.tsx`. This framework-native companion takes inspiration from Hairline’s fixed hit regions, rounded solids and quiet monochrome line hierarchy. It does not wrap or alter Hairline’s engine.

Define one to eight `FigureLayer` entries with unique `id`, visible `label`, and `paths: [{d,role}]`. `d` is ordinary SVG path data in your shared 2D coordinates. Roles are `ink`, `quiet`, or `accent`. Pass `viewBox` for those coordinates. Use a meaningful decomposition of the same object—control polygon, curve and sampled pieces—not unrelated pictures stacked for decoration.

Render `<LayerFigure layers={layers} label="What does each layer contribute?" />`. `initial` selects an ID. For linked controls, pass `value` and `onChange`; the caller owns selection. The component retains sheets, lifts the selected one and owns its settling. Its dark surface and button labels need no custom CSS or new clock. Do not attach another scene owner or a mirror slider. Keep labels outside the isometric drawing so they stay readable on phones.

Geometry should fit inside the supplied viewBox. Selection changes arrangement, not the paths’ numerical meaning; update path data from the same model as other views. Mouse picking uses resting regions so an elevated layer cannot leave its own hit target. Named buttons provide touch and keyboard selection.

Verify every sheet, rapid changes, reactive path updates, keyboard, reduced motion, and 320/390px labels and bounds. A selected sheet must reveal a useful contribution. For a standalone figure using the original Hairline engine instead, use its upstream creation workflow; this helper is for an embedded note.
