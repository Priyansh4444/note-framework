# A picture, made of shapes

Review at `http://localhost:3152/notes/inside-svg` in the isolated production preview. No publication or shared-service deployment.

## Design

The reader operates one original arch landscape in three ways: pull five layers apart, bring the sun in front of the hills, and move the window that limits visible paint. Each operation answers a different question while retaining the same shape definitions and color roles. The first view is the finished picture; source details remain optional. Only the animated dissection needs a clock and curved scrubber. Ordering and clipping use discrete actions.

No local skill specifically named SVG dissection was found. The implementation uses the available Explorable Explanations and note-authoring guidance, with Architect/Arena for design comparison and Emil design guidance for stable controls, focus and reduced motion.

Three independently sketched directions were compared. A won 19/25 against C’s 18 and B’s 16. The base is A’s three short chapters and animated separation. C supplied approachable questions and control restraint; B supplied actual retained-node SVG sibling ordering and explicit unclipping. A technical inspector, arbitrary SVG importing, general layer editor, fake 3D depth, and extra playback controls were rejected as distractions from the beginner explanation. Full candidates, judgment and synthesis are preserved in `artifacts/svg-exploration/`.

## Ownership and correctness

One immutable note-local geometry definition feeds every view. One Scene drives the peel. Experiment owns clock attachment and cleanup. Keyed SVG nodes persist through seeks and source reordering. The reserved layout keeps the timeline stationary during a drag. Labels appear after separation prevents overlap. Reduced motion opens at the completed separation and keeps manual seeking available.

The order action moves the same sun node after both hills, before the frame; its geometry is unchanged. The clipping action moves the invisible clipping boundary and visible frame together while preserving scenery attributes and bounding boxes. Explicit inspection removes clipping; it does not remove the hills’ occlusion of the sun.

The [W3C SVG rendering model](https://www.w3.org/TR/SVG2/render.html#RenderingOrder) supports the sibling painting-order explanation. [MDN’s clipPath reference](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath) supports the distinction between restricted paint and unchanged inherent geometry. All artwork and code are independently authored.

## Verification

- Typecheck and 187 unit tests pass; six new model tests include 449 assertions.
- Eight focused browser tests pass at 320/390/768/1440px: actual paint hit tests, retained nodes, fixed geometry, stable timeline position, target/text sizes, keyboard/focus, pause/replay/seeking, initial reduced motion and shared disclosure spacing.
- Two built-artifact scenarios pass (`FRAMEWORK_REVIEW_URL=http://localhost:3152 bun scripts/inside-svg-artifact-check.ts`, after the preview and single-file builds): Home/guide discovery and real interactions, plus the standalone HTML operating at null origin inside `sandbox="allow-scripts"`, with no external resources.
- Both affected note builds and combined preview pass. Existing built-page verification passes 133 checks.
- New opaque HTML audit: 26 samples, 1,500 checks, zero findings or unverified states.
- Parent review caught missing initial reduced-motion completion and custom disclosure styling; both have failing-before/passing-after regression coverage.

Evidence is under `artifacts/svg-exploration/`. Checks use Chromium on Linux at DPR 1; Firefox, Safari, physical touch, screen readers and browser-menu zoom were not verified. Finite audit samples do not prove every frame. Existing Vite chunk/config-loader warnings remain. No shared-kit or starter change was needed, so a new starter export was unnecessary. See docs/component-testing.md for the current component checks.
