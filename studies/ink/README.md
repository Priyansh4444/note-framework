# Between ink & air

An original Canvas 2D study after [Bee’s ink-story clip](https://x.com/thtbee_/status/2114030630887641448). Rain, a view through trees and an unfinished brush circle are generated from seeded strokes. The same 2,400 mark identities interpolate between the scenes. An exact damped response preserves the displayed weights and velocities during rapid retargeting. This is an interpretation of the visible reference, not a reconstruction of its Three.js implementation or its assets.

The first scene opens as a complete still. Play walks through all three scenes once; direct scene buttons, Previous and Next remain available. Motion pauses offscreen or when hidden. Reduced motion provides complete stills. One animation clock owns both the scene morph and environmental movement. Paper grain is generated once. Newsreader is embedded locally under the included OFL license.

From `framework-redesign/`:

```sh
python3 studies/ink/build.py
node studies/ink/verify.mjs
```

The verifier uses 3151 by default; set `STUDY_URL` to the full production artifact URL to change it. Checks cover all scenes at 320/390/768/1440px, normal-flow separation on phones, 44px controls and 15px essential labels, interruption, deterministic reload, real offscreen pause/resume, reduced motion, keyboard operation and full story completion. The document-hidden branch is exercised with a controlled event, not a real OS background-tab transition. Evidence is in `artifacts/all-studies/ink/`. Chromium on Linux was checked; other engines and physical touch hardware were not.
