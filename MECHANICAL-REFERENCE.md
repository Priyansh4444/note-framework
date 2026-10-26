# Mechanical figures and motion references

The reference pass produced an original spring-and-damper instrument at `/notes/spring-workshop`, linked from Home and the beginner guide. Local production review: `http://localhost:3152/notes/spring-workshop`. Work remains in this isolated snapshot; no shared service was published.

## What the references changed

- [Hairline’s skills](https://hairline.lucasmarkes.com/skills): a recognizable object with a strong resting pose, fine lines, direct manipulation, and a short explanation. Used as visual guidance. Its standalone engine/bench workflow was not installed or adapted; no claim to have run Hairline’s validator.
- [Anatomy](https://skills.wheresryan.sh/anatomy) and its [actual skill](https://github.com/wheresryan22/anatomy/blob/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/SKILL.md): the object explains the idea through its working. Applied its Figure workflow, parts inventory, filled isometric geometry, tone hierarchy, live model, geometry checks and line-end verification. Core and verification tools are vendored locally under the MIT license with the source revision recorded. Figure geometry, physics and SolidJS interaction code are original.
- [Fuma Nama’s post](https://x.com/fuma_nama/status/2114380869175857471): the video shows an articulated mechanical arm responding to interface interactions. The useful cue is tangible mechanism and purposeful detail. No character, arm artwork or other post assets are shipped.
- [Aristide Benoist’s post](https://x.com/AristideBenoist/status/2114065796964270089): the author describes a WebGPU morphing engine. The video shows continuous shape/page transitions and optical edge effects. Applied continuity on interruption to the spring instrument; this implementation is SVG and does not recreate that GPU engine.
- [Bee’s post](https://x.com/thtbee_/status/2114030630887641448): the video combines ink-like scenes, generous editorial composition and changing viewpoints. The useful cues here are the quiet composition and paper treatment. No ink shader or story assets were copied.

X returned 403 to the web reader. Public post metadata and attached videos were retrieved through the FxTwitter public mirror, then sampled into six-frame contact sheets. Observations above describe those frames and the authors’ public text; they are not a source-code analysis of the posts.

## The instrument

A carriage travels along two rails between mechanical stops. A spring returns it to center, and three damping settings change that return. The same exact solution supplies position, velocity, the dial, visible wire and readout. Changing damping preserves position and velocity. Grabbing preserves the visible pose; release retains the chosen displacement. Repeated nudges add a bounded impulse from the current state instead of resetting position. The release energy bound keeps the moving body inside the ±30 mm stroke.

The [OpenStax treatment of damped oscillation](https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations) supplies the physical equation and damping regimes. This is an idealized educational instrument, not a calibrated engineering design. Its mass is 1 kg, stiffness 144 N/m and damping ratios 0.22, 1 and 1.8. It uses the host’s single Scene clock, visibility handling and reduced-motion behavior; it starts on reader input. That preserves the site’s existing user-started motion contract instead of adding Anatomy’s automatic idle tour.

The core contains 79 solids, plus one changing-length rod and a spring wire. Static paths are built once. Keyed retained groups move in a generated paint plan, while only the rod outline, coil and needle change geometry. The render plan is measured from the same actual bodies and wire centerline used by the audits. No second animation loop, shader dependency, global skill installation or starter change was needed.

## Checks and corrections

- 192 unit tests and typecheck pass. Five new model tests verify the differential equation, continuity, composition, dissipating energy and stroke bounds with 23,078 assertions.
- Nine affected browser checks cover real drags, same-event grab continuity, changed damping, repeated nudges, keyboard release/hold, reduced motion, offscreen pause, persistent nodes, disclosure regressions and responsive alignment. The seven new instrument tests were rerun after the final phone enlargement.
- The original Anatomy geometry auditor reports zero findings for 79 core solids at five stroke positions. A second audit includes the actual changing-length rod and spring wire at −30/0/+30 mm: zero clearance, support, terminal, fold, self-overlap, coverage or depth findings. The shared generated rendering plan has zero paint-order problems and zero unrecorded items at those sampled poses. The depth raster step is 0.5 projected units; these finite samples are not proof over every real-valued pose.
- The original line-end check passes in paper and dark themes at three held positions. Normal-size and 4× views were inspected. Its first failures found an isolated zero mark, unrooted dial ticks and a spring attachment; those were corrected in the geometry. The deeper physical audit then found inadequate wire clearance and a sharp lead into the coil. Smooth cubic leads and a shared wire centerline resolved those findings.
- The first visual check caught the legacy article figure transform colliding with the card. The card now uses the shared `nk-experiment` boundary. The direct-manipulation overlay shares the drawing’s responsive canvas. Phone enlargement preserves that coordinate system.
- Both example return bars match the note’s 680px reading column, with responsive checks, replacing the previous inconsistent navigation measure.
- Affected note/framework builds, combined preview and 133 existing production-page checks pass. The new note’s standard opaque HTML layout audit passes 8 samples / 263 checks with zero findings or unverified states. This layout audit does not exercise the custom spring response; that is covered by the direct-interaction and physical-model checks above.
- The production route and exported single HTML both support release, damping, hold and paper controls. The export runs at null origin in `sandbox="allow-scripts"` without external resources.

Commands (from this folder):

```sh
bun run check
bun run test
bun src/notes/spring-workshop/verification/audit.mjs
bun src/notes/spring-workshop/verification/dynamic.mjs
UI_TEST_URL=http://localhost:3151 bunx playwright test visual/spring-workshop.visual.ts visual/inside-svg-integration.visual.ts
bun scripts/spring-workshop-check.ts
bun run note:build spring-workshop
bun run build:framework-preview
bun run note:audit spring-workshop --desktop 1440 --out artifacts/mechanical-reference/layout-audit-final
FRAMEWORK_REVIEW_URL=http://localhost:3152 bun scripts/spring-workshop-artifact-check.ts
```

`dynamic.mjs` is the single generator of `paint-order.json`. The other audit writes evidence only. Evidence, including failed-before reports, screenshots, contact sheets and public reference metadata, is under `artifacts/mechanical-reference/`.

Verification uses Chromium on Linux. Physical touch hardware, Firefox, Safari, screen readers and browser-menu zoom were not checked. See docs/component-testing.md for the current component checks. Existing Vite warnings remain. The original framework’s 183 protected source/configuration files and canonical `web/` remain unchanged; no PR or deployment.
