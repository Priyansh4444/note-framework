---
name: explorable-explanations
description: Design mechanism-focused interactive explanations with linked diagrams, controls, math and readable code, drawing on Making Software and Maxime Heckel. Use for explanatory articles and visual notes where readers need to operate a model to understand it.
---

# Make the mechanism operable

Choose one question a reader cannot answer yet. Design an experiment whose result answers it. A beautiful result alone does not explain the process.

Before rendering, sketch the chain **input → model state → picture → measurement → explanation**. Identify what changes, what stays true, and a case where the naive intuition fails. Prefer one coherent experiment to unrelated component demonstrations.

- Begin with the smallest worked step. Then show the accumulated process, retaining the same objects and color roles. Link a spatial view, internal state and history only when each answers a different question.
- Give the reader causal controls: a ray angle, kernel radius, sample count or iteration. Define the term beside its first use. Keep units, ranges and the currently selected value visible. Keep primary controls beside the results they change.
- Separate pure numerical functions from rendering. Derive geometry, counters, formulas and captions from the same state or trace. Distinguish simulation time, playback speed, operation count and measured runtime. State numerical or perceptual meaning; show performance assumptions.
- Use persistent SVG for schematic geometry; use canvas/WebGL when pixels or shading are the subject. Pick rendering for the mechanism, not spectacle. Discrete steppers need no clock. Playback follows the host's seeking and reduced-motion contract.
- Start with a readable diagram, then expose construction, errors or intermediate values. Keep derivations expandable; do not hide necessary definitions or the main result.
- Use a stable reading column and purposeful wide figures. Place quiet rules at changes of topic, control surfaces and reference sections; use spacing within a thought. Finish frame edges, clipping, focus and loading states. Alternative diff layouts are useful controls; duplicated plain-source panels are not.

Verify by changing a parameter, pausing mid-step, seeking backward, testing an edge case, and checking the exact values and picture agree. Inspect phone labels and controls at their actual screen size, not only page overflow.

For source-grounded implementation patterns and their limits, read [the case studies](references/case-studies.md) when choosing an explanation's structure.
