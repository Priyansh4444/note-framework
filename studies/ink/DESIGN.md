# Between ink & air

An original Canvas 2D study of painterly geometry, informed by the atmospheric paper, silhouetted canopy, restrained red, oversized serif composition and brush-circle scenes visible in Bee’s reference: https://x.com/thtbee_/status/2114030630887641448. This does not reproduce or claim knowledge of its private implementation.

## Model before rendering

`Scene = rain | canopy | circle`. One model owns `{selected, playing, elapsed, time, weights[3], velocities[3], visible, reduced}`. Each scene is a seeded array of exactly 2,400 retained brush segments with matching identities. Their endpoints, pigment, width and opacity interpolate using three critically damped scene weights. Retargeting only changes the target; displayed values and velocities continue. Thus branches, rain and the circle travel through actual intermediate geometry rather than crossfading rendered images. Watercolor fibers are seeded once into a paper buffer.

One requestAnimationFrame advances atmospheric time, playback and transition weights. Playback is reader-started, each scene lasts nine seconds, and the third scene ends playback. Manual navigation retains the playing intent and retargets immediately. Paused navigation may finish its transition, then the clock sleeps. Reduced motion shows complete deterministic stills and disables Play while keeping direct scene navigation. IntersectionObserver and document visibility cancel the clock; resume does not count hidden time. No sound, network assets, dependencies, secondary timers or video.

## Workflow

1. trace the affected subsystem: standalone public HTML; no shared state or kit changes.
2. architect skipped: selected standalone Canvas interface and bounded reference study already specified by parent.
3. Throughput checkpoint: reference and local guidance read first; this is one isolated workstream; shared state n/a; smallest safe decomposition is one rendering/lifecycle owner with parent review.
4. Own implementation directly: parent expressly forbids nested agents and will review the diff. Commits and PR opening omitted per parent scope.
5. Verify the genuine public dev route in the project Playwright browser, including intermediate and interrupted transitions, lifecycle and four responsive sizes.

## Commands

`python3 studies/ink/build.py` regenerates the single self-contained HTML. `node studies/ink/verify.mjs` verifies against the running ordinary project dev server at port 3151 and saves evidence under artifacts/all-studies/ink.
