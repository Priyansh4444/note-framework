# A little reach

Original self-contained SVG mechanical-arm interaction inspired by the articulation and tangible detail in [Fuma Nama’s clip](https://x.com/fuma_nama/status/2114380869175857471). The downloaded clip/contact sheet were inspected as visual references; no source art, character, fonts, or other reference assets ship here. System fonts and original vector geometry require no asset licenses.

## Review

Open `/studies/mechanical-arm/index.html` on the ordinary preview server. The default resting **Inspect** pose is the poster target. Return navigation points to `/studies`.

- `model.js`: constant dimensions, named target registry, bounded polar workspace, exact inverse kinematics and critically damped analytic response.
- `app.js`: retained SVG transforms, one animation clock, pointer capture with grab offset, immediate keyboard controls, reduced motion and lifecycle pause.
- `page.html`: responsive HTML/CSS and readable mechanism explanation.
- `build.mjs`: static original SVG machining details and the self-contained HTML generator.
- `model.test.js`, `browser-check.mjs`: mathematical and actual-browser checks.
- `PLAN.md`: model-first sketch and workflow checkpoint.

Build from repository root with `bun framework-redesign/studies/mechanical-arm/build.mjs`. Test with `bun test framework-redesign/studies/mechanical-arm/model.test.js`, then `bun framework-redesign/studies/mechanical-arm/browser-check.mjs` while the preview runs on port 3151. Set `ARM_URL` to check a different served artifact.

## Verified

Five model tests pass, 95,960 assertions: exact link lengths over dense workspace samples; named targets; outside clamping; angular wraparound; composition and rapid retarget continuity. The finite samples supplement the exact cosine-rule construction, rather than establish every property for all floating-point inputs.

Eleven browser checks pass in project Playwright/Chromium: genuinely animated named targets, immediate interrupted-pose continuity, retained SVG node identity/count, actual offset drag and reversals with pointer capture outside the drawing, keyboard arrows/Shift/Home and chip activation, reduced-motion immediate settling, actual offscreen pause/resume, 320/390/768/1440px layouts, all three target-pose bounds at every width, >=44px button hit areas, >=15px essential labels, disclosure/no overflow, an opaque `sandbox="allow-scripts"` with all network requests blocked, and no runtime errors. `artifacts/all-studies/arm/browser-report.json` records the result; `width-*.png`, `mid-motion.png`, `dragged-pose.png` and `opaque-sandbox.png` are the inspected evidence.

The 320/390px, moving and dragged screenshots were visually inspected after the final responsive adjustment. The focus outline is intentional in keyboard screenshots. The small board marks are ornament, not required reading.

Readonly model diagnostics on `#mechanism.dataset`: `radius`, `angle` (radians), `tipX`, `tipY`, `elbowX`, `elbowY`. Shoulder origin is `(650,430)` in SVG coordinates, upper/forearm lengths are 220/175. Rendered positions, readout and tests use the same model.

## Limits

This is a geometric interaction, not a force/contact/mechanical-safety simulation. Browser checks use Chromium on Linux; physical touch hardware, other browsers and screen readers were not tested. Genuine offscreen visibility was verified. Headless Chromium keeps background pages marked visible, so the `document.hidden` event path is implemented but a real hidden-tab transition was not independently exercised. No app-wide tests, package changes, deployment, commit or PR were performed by this owner.
