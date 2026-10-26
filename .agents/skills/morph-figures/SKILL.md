---
name: morph-figures
description: Build an interruptible outline morph inside a Note Framework note, using corresponding contours and the dark MorphFigure helper. Use for changing shape or showing geometric correspondence, rather than chart values or page transitions.
---

# Keep the same parts

Use `MorphFigure` from `src/kit` and the working `MorphExample` in `src/kit/patterns/recipes.tsx`. `makeMorphShapes()` provides the Type/Grid/Ring/Fold starting set; replace it with topic-specific geometry when a stock shape would not explain the question. For an editable curve, `CurveMorphExample` and `recipe-model.ts` keep ribbon strips paired with the curve, handles and endpoint chord.

Each `MorphShape` has a unique `id`, a visible `label`, and `contours`: arrays of `[x,y]` points. Every state must have the same contour count and corresponding point counts. Match the starting vertex, direction around the outline, and semantic parts yourself. `resampleContour(points,count)` equalizes closed-polygon sampling; it does not decide which points belong together. Split or merge topology explicitly rather than inventing partners.

Render `<MorphFigure shapes={shapes} label="What changes?" />`. Set `viewBox` for your coordinate bounds; `filled: false` makes a state an outline. `initial` chooses a starting ID. For linked views, pass `value` and `onChange`; the caller owns that selection. Do not add another animation loop, overlay, slider, or theme switch. The component retains geometry and velocity on interruption, sleeps offscreen and honors reduced motion. It owns visual settling, not a mathematical simulation clock.

Explain what the correspondence means beside the result. In-flight contours are an interpolation, not necessarily a valid intermediate object in the subject domain. Keep exact quantitative values separate.

Verify custom shapes, mid-flight reversals, an external selection change, keyboard buttons, reduced motion, and 320/390px layouts. Invalid counts, IDs and coordinates should fail descriptively. Check both readability and meaning; matching counts alone cannot prevent a twisted outline.
