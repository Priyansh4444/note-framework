---
name: emil-design-eng
description: Polish Note Framework controls and reading flow using Emil Kowalski's design-engineering principles. Use for copy feedback, menus, transport and visual hierarchy; keep mathematical motion on its scene clock.
---

# Make the response visible

This is the framework-local application of Emil's principles, not a replacement animation engine. Further reading: [Animations on the Web](https://animations.dev/).

Before adding motion, name its job: acknowledge an action, preserve continuity, or explain a change. Remove repeated prose and competing controls before adding another effect.

- Use `CopyButton` from `src/kit` for prompt and source copying. Its callback returns `copied` only after copying succeeds, or `selected` when the reader must copy a selection. Pass changing source text as `resetKey`. Honor the callback’s `AbortSignal` before fallback selection or other delayed side effects; a superseded copy must not change the reader’s selection. Keep pending, success, selection and failure distinct; never announce success on a click alone.
- Keep the target's dimensions stable. Pointer feedback may use a brief transform/opacity transition with the shared easing. Keyboard actions remain immediate; reduced motion removes movement. Repeated presses replace the current feedback rather than queueing animations.
- Use `Experiment` for explanatory playback: visible Play/Pause/Replay, one scene owner, meaningful reduced-motion steps. Check that transport is visible beside the relevant figure on phones; a working button far below a large drawing is insufficient.
- Give each chapter one question, one main experiment and one useful result. Put derivations and reference material behind named disclosures; use `Page references="compact"` for a short note. Keep necessary assumptions and first-use definitions visible.
- Choose morph for correspondence, layers for contributions, ink for material. Connect each to the subject's model; do not append a component gallery.

Verify actual intermediate frames, rapid reversal, clipboard failure, keyboard, reduced motion and 320/390px layouts. A status sentence, CSS declaration or static screenshot alone does not establish motion.

Refresh renderer-specific snapshots on the named renderer, or inspect its CI captures. Never relabel local screenshots as Ubuntu references. Keep comparison thresholds intact.
