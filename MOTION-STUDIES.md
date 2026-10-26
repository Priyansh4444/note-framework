# Five studies, five interactions

The shared review index is `/studies`, available in the isolated framework preview. The four newly requested references now have independently interactive artifacts; the completed Anatomy spring workshop remains the fifth study. Home, Guide and the preview masthead link to the gallery. The existing homepage design and all earlier examples remain intact.

| Study | Actual interaction | Reference and implementation |
| --- | --- | --- |
| Folios | Lift a notebook; its neighbours make room | [Hairline](https://hairline.lucasmarkes.com/skills): actual creation skill, unchanged engine/bench, original retained SVG figure |
| A little reach | Drag a two-link arm or command an interrupted reach | [Fuma Nama](https://x.com/fuma_nama/status/2114380869175857471): original detailed SVG, exact inverse kinematics and damped target response |
| Form / Shift | Morph one set of contours between four formations | [Aristide Benoist](https://x.com/AristideBenoist/status/2114065796964270089): original Canvas 2D interpretation; no claim to recreate his private Rust/WebGPU engine |
| Between ink & air | Wander through rain, canopy and an open brush circle | [Bee](https://x.com/thtbee_/status/2114030630887641448): original seeded Canvas art and one story clock; no borrowed video, scene assets or Three.js code |
| A little room to settle | Pull a spring instrument and compare damping | [Anatomy](https://skills.wheresryan.sh/anatomy): existing tactile SVG workshop, preserved |

The original public video clips and author metadata were inspected. Source assets are not shipped. Each standalone artifact contains its resources; none loads the reference video. Source credits are visible in the gallery and the original studies’ disclosures. Hairline is locally pinned to `37d2e78dcb333ab30c3338e28ed4a690364ea014`; its upstream MIT license and the ink study’s embedded Newsreader OFL license are preserved.

The gallery uses stills captured from the actual studies, so browsing does not start five animation clocks. Opening a card gives it one self-contained interactive page. Each new motion study has one clock that sleeps offscreen, while hidden, and after settling; reduced motion selects a complete still. No new redundant slider or audio autoplay was added. Existing shared kit, dependencies and starter allowlist are unchanged.

## Verification

Reproduce from `framework-redesign/`, with the dev server on 3151 and the built preview on 3152:

```sh
node studies/hairline/build.mjs
node studies/mechanical-arm/build.mjs
node studies/morph/build.mjs
python3 studies/ink/build.py
bun scripts/study-posters.ts
bun run check
bun run test
node studies/hairline/verify.mjs
node studies/mechanical-arm/browser-check.mjs
node studies/morph/verify.mjs
node studies/ink/verify.mjs
bun run build:framework-preview
FRAMEWORK_REVIEW_URL=http://localhost:3152 bun run check:framework-preview
node scripts/studies-check.mjs
bun run note:build framework
```

The final run passes 197 unit tests, typecheck, the framework note build, combined preview build and all 133 existing production checks. Focused arm, morph and ink browser verifiers pass after the final lifecycle change. The gallery integration checks cover four widths (320/390/768/1440), loaded posters, aligned card origins, readable control labels, navigation, real return links, newest-record visibility semantics, and working self-contained artifacts at null origin with all network requests blocked. Hairline’s official validator and eight-view look pass; its additional browser checks and exact result are recorded in its README and browser report.

The lifecycle fix consumes the latest IntersectionObserver record rather than the first, so a batch ending visible resumes and a batch ending hidden freezes. The integration test proves both directions against each real study. This preserves a common ownership rule without introducing a new shared animation layer.

Evidence and screenshots are under `artifacts/all-studies/`; generated-output hashes and the pinned upstream comparison are in `studies/manifest.json`. Browser coverage is Chromium on Linux. Real offscreen transitions are checked; document-hidden branches use controlled events where headless background visibility cannot be exercised. Firefox, Safari and physical touch are unverified. Existing Vite chunk/config-loader warnings remain. Standalone pages are reviewed through the combined preview; this change does not publish or change shared hosting.

The public repository includes only framework and example sources; course archives and local operator data are excluded.
