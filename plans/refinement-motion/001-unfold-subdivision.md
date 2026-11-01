# Unfold subdivision instead of replacing polygons

Status: TODO. Base commit d0e9fea. High priority, explanatory mathematical motion.

## Grounding

The user reports the pictured Flatten animation feels blocky. The runtime probe in artifacts/refinement-motion/before.json records an identical path from time 0 through 950ms, then a new path/count at 1000ms. Current Flatten.tsx uses createPlayback integer bins with n=1,2,4,8,16. The final bin holds16 while playback still runs. Claude's earlier findings supplied in this thread prioritized truthful endpoint geometry/counts, eliminating the static playback tail and dense sample beads, and keeping tiny/overlapping red gap rings out of the figure. Original separate Claude report files are unavailable; those quoted findings and the actual source are the grounding, not reconstructed reviewer scores.

## Chosen design and ownership

Base A (midpoint unfolding), judge21/25 over B20/25. One continuous white polygon explains why splitting improves the approximation. Reject B's two competing transparent polygons. Graft B's quiet marker handling. Keep the pure helper note-local: its interpolation-error proof is Bézier-specific; do not add a generic kit API with one consumer. Existing Scene/Experiment/CurveTimeline own transport. No dependency, new timer, CSS geometry transition, or change to shared playback.

Usage: prepareRefinement(points()) memoizes geometry; frame = prepared.frame(4*scene.t()/scene.length). Start at scene.length/2 (four pieces). Explicit semantic times are [0,1250,2500,3750,5000]. One5000ms beat. Normal Play replays untouched rest; reduced Next visits exact1/2/4/8/16, Replay1. Direct pointer/keyboard seek renders its frame immediately with no after-motion.

Types: Count=1|2|4|8|16; state={kind:'settled',n:Count}|{kind:'splitting',from:Count,to:Count,alpha:number}; frame={state,vertices:readonly Point[17],gap:{error:number,at:[Point,Point]},bound:number,dotOpacity:readonly number[17],markerOpacity:number}. Pure preparation takes Cubic; frame takes clamped finite phase0..4. Invalid values rejected at boundary.

Geometry: at phase=k+u, from=2^k,to=2^(k+1), a=(1-cos(pi*u))/2 with exact0/1. P_n(t) linearly interpolates true curve samples B(i/n). V_j=(1-a)P_from(j/16)+a*P_to(j/16), j0..16. All17slots remain mounted, fixed path command count. Old anchors stay put; new midpoints emerge from their parent chord and reach B. Intermediate vertices are construction positions, not falsely called curve samples. No fractional n or overshoot. Every stage ends on the exact next polygon, including final interval; no final static bin.

Prepare the true curve on a fixed1024-interval grid (covers all chart counts1..32 and legacy33/segment grids), plus polygon samples/vertices for all levels, once per control-point change. Each scene tick only blends cached coordinates/reduces gaps. The displayed sampled maximum is measured against this exact visible interpolant on the same fixed grid. Bound=(1-a)*bound(from)+a*bound(to), justified by triangle inequality; no interpolation of measured error scalars. Chart points use the same grid; only settled stages get active count emphasis. Explanatory disclosure describes transition and grid/proof.

Dots: only old/new actual knots visible, no16-piece bead field. Fade new knots in through8; during8→16 fade eight-piece dots out. Gap: remove ring entirely. Keep current screen-size threshold and retain the real maximum-gap line with scene-derived fade-out/hidden-middle/fade-in envelope (first/last15%); endpoints must always correspond to the current interpolant, never tween witnesses. Inspect for remaining lobe switches near envelope ends and hide more if necessary rather than falsify geometry.

Caption must distinguish 'Splitting4pieces into8' from settled '8straight pieces'. Label gap as sampled, use actual current frame. Avoid transport/layout shifts as caption changes (reserve footprint if needed, scoped CSS only). Preserve consistent quiet typography/dark theme.

## Boundaries

Implementation owns bezier/refinement.ts + test, Flatten.tsx, narrowly scoped demo.css only if needed, scripts/public-repository.ts allowlist for new example module/tests. Parent owns browser regression file and review/docs. Do not touch CS164, canonical web/, old School/note-framework, other figures, shared clock/playback, dependencies, or git/PR/deploy.

## Verification

Numerical tests: exact5stops vs chords, fixed17vertices and anchors, new midpoint travel, valid blended bound including deformed/straight/degenerate curves, live gap witness, identical reverse seeks, continuity around stage boundaries on fixed grid, invalidphase. Browser: assert path moves within former staticbin, max adjacent-frame displacement at boundaries, fixednodeidentity, error matches visiblepolygon, pauseholds, backwardseekidentical, controlpointgrabpauses, reduced1/2/4/8/16, finalintervalmoves, phoneoverflow/labels, stabletransport.

Inspect normal playback and slowed frame sequences on Arch and S bend at390/1440. Record a short after-video. Run tsc/lint/fmt/deadcode/tests, affected browser tests, per-note build and opaque audit. Re-export/build standalone if allowlist changes. Independent animation review uses /home/pronsh/.claude/skills/review-animations/STANDARDS.md; root UI motion advice never justifies falsifying mathematical geometry.

## Throughput checkpoint

- Blocking first steps: baseline runtime repro and two designs/judgment completed before implementation.
- Independent workstreams: implementation owns model/rendering; parent owns browser contracts/docs; review follows frozen diff.
- Shared mutable state: single scene clock; pure prepared geometry per control-point snapshot. No shared file edits between owners.
- Smallest safe decomposition: one implementation owner for frame model and consumer because caption, gap and geometry are one mathematical invariant.
