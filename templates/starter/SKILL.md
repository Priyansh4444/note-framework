---
name: note-explainers
description: Author or verify figures, math and explanations using this repository's visual note kit.
---

# Small working surface

Start with `src/notes/`; import `src/kit`. Inspect implementations only when needed.

- `defineNote` in `chapters.ts`: typed chapter IDs, questions, takeaways and sources. Glossary definitions return fresh JSX (`() => <>…</>`).
- Reuse `Page`, `Chapter`, `Cite`, `Check`, `Equation`, `Steps`, `Model`, `Table`, `Experiment`, `Parameter`. `Contents` is optional; `Page` supplies the outline. Static instruments: no CSS/scene; example `src/recipes.tsx`. `Tex`: strict KaTeX with MathML/fonts. Tall/wide math: `Equation` with equivalent `phone`.
- Animation: `createScene`, one `SceneFrame`/`Experiment` owner. Keep SVG nodes persistent. Derive geometry from `scene.t()` and seekable springs; numerical values use zero overshoot. No extra timer or CSS transition on mathematical state. Identify the region, make the discrete change, show the invariant. Pause before seeking; honor reduced motion.
- Scope CSS to `.note-<slug>`. A custom figure width/margin also needs its inherited transform checked. Measure labels AFTER scaling; aim for ≥15px essential text. Long labels belong in HTML. Check actual formula/table containers and intermediate frames, not only viewport overflow.
- Verify claims and numbers; motion must explain why.

Prefer hand-authored SVG and strict math; do not use Mermaid. Use sourced graphs/data analysis when comparisons or trends answer the question. Compress with precise terms plus visible first-use meanings and hover/focus/tap reminders; never replace coverage with jargon.

Read [the reader contract](references/reader-contract.md) only for deeper layout, motion or correctness review.

Hosted sharing uses router-free single-file HTML. Inline assets; storage, external network, forms and popups are blocked. Do not weaken the opaque sandbox. Relative attachments need another hosting route. Public links expose original HTML and retained versions. The sharing client preserves pending bytes/identity; retry instead of deleting its private journal.

For SVG inspection, Pierre code/diff imports and executable alignment/visibility checks, read [authoring tools](references/authoring-tools.md) when needed.

For visual polish, read [taste](references/taste.md): editorial scale, restrained boundaries and controls that explain the idea.

For mechanism-focused interactive articles, use [explorable explanations](../explorable-explanations/SKILL.md); its case studies are optional.

For reusable dark visual patterns, read only the matching skill: [morphs](../morph-figures/SKILL.md), [layers](../layer-figures/SKILL.md), or [ink](../ink-figures/SKILL.md). Helpers own settling; use a scene for seekable mathematical time.
