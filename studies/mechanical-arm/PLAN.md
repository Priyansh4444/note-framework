# Mechanical arm study

- Trace the affected subsystem: standalone static study; no shared renderer or router changes.
- Architect skipped: parent-selected original SVG mechanism with an explicit single-file boundary.
- Blocking first steps: read brief, source contact sheet and local authoring/design guidance. Complete.
- Independent workstreams: n/a, this delegated owner implements one coherent model/renderer/controls artifact.
- Shared mutable state: only `studies/mechanical-arm/**` and its generated public HTML are owned here.
- Smallest safe decomposition: numerical domain module, retained-node application, HTML shell, build and verification.
- Delegate code-writing: satisfied by this delegated owner; parent reviews the final diff.
- Verify on the matching surface: pure model checks plus real Chromium pointer, keyboard, interruption, reduced-motion, lifecycle and responsive checks.
- Rebase/commits: skipped, parent explicitly forbids commits.
- Adversarial review: parent reviews source and browser evidence.
- Opening a PR: skipped, parent explicitly forbids publishing/PR work.

## Model before picture

Input → a named registry target or pointer/keyboard point → annular-sector clamp → displayed polar target → analytic critically damped response → exact two-link inverse kinematics → retained SVG transforms and measured reach.

Domain: a constant 220-unit upper link, 175-unit forearm; targets are restricted to radius 115–380 and angle 65°–150°. The sector keeps every folded pose inside the stage. One elbow branch is held throughout; no branch flips. Geometry comes from the same `solve()` used by tests. Pointer/keyboard manipulation is immediate. Named targets preserve displayed position and velocity on retarget; one requestAnimationFrame clock stops at rest, offscreen or hidden. Reduced motion settles immediately.

Invariant: lengths do not change, elbow choice does not change, every rendered tip is reachable. A target outside the workspace clamps to its boundary rather than stretching the links. The target chips expose reachable examples; direct dragging exposes the clamp.

Design cue: Fuma Nama's public clip, inspected via local contact sheet. Original artwork and code, SVG rather than a claimed recreation of the reference implementation. Ivory machine links, fasteners, cable routing, dark mounting plate, restrained lime indicators. No copied character or source media shipped.
