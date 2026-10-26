# Reusable visual patterns

The example’s **Let the drawing change form** chapter at `/notes/framework-demo#patterns` now contains three embedded patterns. Morph is selected first; all three views now use the same editable curve as the earlier figures. The original Type/Grid/Ring/Fold recipe remains available separately. The guide at `/docs#patterns` has a minimal live/source example. Each tab shows the source of its actual rendered adapter; Layers includes a face-on contribution, and Ink offers dry brush, strands and hatching. The gallery links back to this usable example.

- `MorphFigure`: matching author contours with persistent vertices, damped position/velocity, an optional outline state (`filled: false`), controlled or local selection, and velocity-derived edge accents. `makeMorphShapes()` supplies Type/Grid/Ring/Fold. `resampleContour()` equalizes sampling, without claiming to establish semantic correspondence.
- `LayerFigure`: Hairline-inspired rounded isometric construction sheets. Authors supply ordinary SVG paths. Fixed resting pick regions, named buttons, retained nodes, and paint order based on displayed elevation prevent selection flicker and occlusion jumps. It is a framework-native companion; the standalone folio study separately retains the original Hairline engine.
- `InkFigure`: retained brush marks driven by named author scenes. `brushStroke()` samples paths by arc length with a repeatable seed and stable mark count. The example follows the actual Bézier curve; width and jitter are a material treatment, not a quantitative error claim.

All three are dark, with no theme controls or autoplay. They own their visual settling, reduced-motion response, offscreen/hidden pause and disposal. A seekable mathematical scene remains owned by the ordinary scene kit; these helpers do not add a second timeline or reproduce mathematical values with springs. The mechanical arm remains a standalone study and is not packaged as a visualization helper.

Every helper owns its root width, transform, margin and caption layout. This avoids the legacy global figure breakout rule that initially shifted the new renderers. Browser regression checks measure real bounds and controls inside the actual example, including a light system preference.

The three original study pages are also dark-only. Hairline’s pinned engine and bench sources remain pristine; the owned build adapter validates the canonical figure before removing the theme UI and fixing its exported shell to dark. That explicit user-requested adapter is not claimed to pass the upstream unchanged-bench check. The canonical geometry’s earlier official look remains recorded separately.

## Authoring and distribution

Import `MorphFigure`, `LayerFigure`, `InkFigure` and helpers from `src/kit`. Working recipes live in `src/kit/patterns/recipes.tsx`. Geometry definitions have typed IDs and visible labels; malformed correspondence and nonfinite input fail at the author boundary. Source inspirations and interpretation limits are in `src/kit/patterns/SOURCES.md`.

The portable starter explicitly includes the renderers, models, CSS, model tests, recipes, sources and these narrow skills:

- `.agents/skills/morph-figures/SKILL.md`
- `.agents/skills/layer-figures/SKILL.md`
- `.agents/skills/ink-figures/SKILL.md`

The existing note skill routes to them only when relevant. No global skill installation or original workspace is required. All three skills pass the skill-creator validator. The agent bootstrap and entrypoints remain within their context budgets.

## Verification

206 unit tests pass, along with typecheck, 12 focused browser tests and 7 production responsive/dark scenarios. The example audit passes **188 samples / 57,536 checks**, with zero findings or unverified states. The existing **133 production-page checks** pass. Screenshots cover 320/390/768/1440px, all three helpers and all three dark study pages.

A fresh independently installed starter renders all three recipes, typechecks, passes **30 tests**, and builds ordinary and single-file output. Its real interactive opaque export preserves morph coordinates on synchronous interruption, retained shape/brush identities, final selected states, and phone layout with all network requests blocked. Shipped helper and skill bytes match the framework. Root and served-archive checks ensure the new resources reach the downloadable starter.

Evidence is under `artifacts/pattern-library/`; the audit is `artifacts/audit/`. The complete historical component suite was not rerun: no old control primitives changed. Chromium on Linux was exercised; other engines and physical touch were not. Existing Vite configuration/chunk warnings remain.

All work remains in `framework-redesign/`. The original-framework protection check compares 183 source/configuration files and reports no changes. No shared service deployment or PR was performed.

## Review and quality gates

`bun run check:all` now runs the Solid-compatible T3 Code lint rules, formatting, unused-file/dependency checks, TypeScript and unit tests. `CurveMorphExample` and the pure `recipe-model.ts` connect the portable patterns to one author-supplied control polygon.
