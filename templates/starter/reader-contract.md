# Reader contract

- Let readers recover at any section: context → useful picture → reason → key fact. Compress words without dropping source coverage, assumptions, proofs or exceptions. Put longer reasoning behind a clear disclosure.
- Explain a term visibly when understanding the current step requires it. A hover tooltip alone is not an introduction.
- Use a quiet serif reading column, ink-black surfaces, ragged-right text and restrained semantic accents. Keep repeated metadata out of the main argument. Preserve any user-requested control type.
- Start with a question someone unfamiliar with the topic would ask. Distinguish definitions, assumptions, invariants and conclusions. State what a bound counts and whether it is a guarantee or optimum.
- Check real diagrams at 320/390px. Authored SVG font-size is not screen size: a 14-unit label in a 600-unit viewBox can render below 7px. Crop unused space, reserve label clearance, and prefer unscaled HTML for long equations and legends. Target at least 15px for essential labels and 4.5:1 for ordinary text against its actual background; ancestor opacity matters.
- Motion must reveal an operation, not merely fade in an already finished picture. Guide attention, construct the change, commit discrete decisions, then show the invariant. Keep one seekable clock and persistent nodes. Never animate an edge through a conflicting edge or overshoot a geometric value.
- UI feedback and navigation motion are separate from mathematical animation. Keep frequent keyboard actions immediate, honor reduced motion, and preserve focus, anchors and browser history.
- Treat source checking and mathematical checking separately. Preserve original problem labels and provenance; label illustrative or independently derived work. Build examples from shared numerical data, then test their actual invariants.
- Verify the real published artifact and requested downloads. A passing build, a static screenshot or a viewport with no overflow does not prove correct content, readable labels or useful animation.

- Use precise words to compress meaning, with a short visible first-use definition and hover/focus/tap reminder. Tautology means true under every truth assignment in classical propositional logic; it is not a synonym for an invariant or an empirical pattern.
- Use sourced graphs and data analysis when they answer a comparison, distribution or trend question. Show units and distinguish observations from illustrative data. Hand-author diagrams in SVG; use strict KaTeX for math, never Mermaid.
- Run the framework visual audit on declared alignment/spacing/visibility contracts and relevant figure states. Inspect screenshots too; diagnostics cannot infer every intended overlap or semantic mistake.
