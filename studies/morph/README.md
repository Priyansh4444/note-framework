# Form / Shift

An original, standalone Canvas 2D interpretation of the visible behavior in [Aristide Benoist’s morph demonstration](https://x.com/AristideBenoist/status/2114065796964270089). This does not recreate his private Rust framework, WebGPU renderer, shaders, or asset-loading system. The source video is a reference, never an embedded playback layer.

## Model chosen before implementation

- One material body: 32 persistent closed contours × 32 persistent vertices. Each vertex owns `x`, `y`, `vx`, and `vy`.
- A formation registry stores four coordinate targets: a custom geometric M, an offset outline grid, a segmented ring, and a radial fold. Targets have exactly the same contour/vertex cardinality and ordering.
- A selection is one destination index. There is no transition queue, state replacement, entering/exiting image, or duration restart. Changing the index leaves the current positions and velocities untouched.
- A damped spring advances the geometry using one demand-driven `requestAnimationFrame`. Integration substeps stabilize slow frames. The RAF stops when settled, offscreen, hidden, or reduced motion is requested. Resuming targets the latest selected formation.
- The renderer traces those actual vertices. Narrow blue/ochre fringes are offset along current velocity, only while moving. Grid fill is a continuous material property. Shapes themselves never crossfade.
- Resizing changes the projection, preserving the underlying geometry. Reduced motion intentionally snaps to the selected target and clears velocities.

Canvas is appropriate here because it keeps the 1,024-vertex representation independent of DOM tessellation and allows per-edge velocity treatment without external GPU packages. Canvas elements and geometric objects persist for the lifetime of the page. Normal HTML buttons, status text, and a descriptive Canvas label expose the controls accessibly. Canvas-unavailable and JavaScript-disabled modes provide a static typographic fallback.

## Scope and workflow

The parent brief fixed the visual direction, independent page boundary, and four-way ownership. Architect/arena exploration, nested delegation, shared package changes, commits, and publication were explicitly excluded. This worker owns only this folder, `public/studies/morph/index.html`, and its review evidence. Applicable guidance read: workflow (Feature, model-the-domain, prove-it-works), the local note authoring/taste guidance, and emil-design-eng. Spring continuity and understated press feedback follow the interruptibility guidance; keyboard retargets intentionally animate because the requested study is the motion itself.

## Build and check

From `framework-redesign/`:

```sh
node studies/morph/build.mjs
node studies/morph/verify.mjs
```

The build copies the authored, dependency-free HTML to `public/studies/morph/index.html`. The verifier uses the project’s Playwright/Chromium and the ordinary dev server on port 3151. Set `STUDY_URL` to check another ordinary serving URL. No `preview_*` tools are used.

Evidence is written under `artifacts/all-studies/morph/`. The verification JSON records actual 320/390/768/1440px overflow, text size, and link/button dimensions. It also checks exact position/velocity continuity within one synchronous retarget, retained object identities, nine rapid retargets, settled clock idling, keyboard/direct controls, reduced motion, real offscreen pausing, fallbacks, and runtime/console errors. Intermediates and final formations are captured as PNGs.

The document visibility handler is exercised with a synthetic `document.hidden` override and `visibilitychange` event, explicitly recorded as such. It is not evidence of a real OS background-tab event. Chromium was tested; physical touch devices, Safari, and Firefox were not.

## Review hooks

`window.__morphStudy.snapshot()` is a read-only diagnostic returning `selected`, `ticks`, `running`, `visible`, `reduced`, `fill`, `identitiesStable`, and copied contour positions/velocities. It does not offer a mutation path. `identitiesStable` compares the actual contour and vertex object references against their initial allocations.

For a stable poster use the initial Type state at 1440×1050, or press `3` and wait until `!window.__morphStudy.snapshot().running` for the ring. The visible return link goes to `/studies`. Source and generated HTML embed no fonts, libraries, images, or other third-party assets.
