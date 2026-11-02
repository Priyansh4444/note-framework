# Taste: what a note should feel like

Use these rules after the figure and the math are correct. Each rule names a check you can measure.

1. **Size the type for reading.** Body text is 20–22px on desktop and 18–20px on phones, with a measure of about 680px. A title near 44px is enough. If a page feels zoomed in, reduce the size; do not add chrome.
2. **Rules mark boundaries.** Keep a quiet rule where reading changes mode: the contents end, a new chapter, reference material, a table header, or a control surface. Use spacing inside a topic. Do not stack rules across empty space, or delete every rule after a complaint about clutter.
3. **Use at most one frame.** A figure sits on the page background. Do not put a box inside a box: no card around an SVG inside a panel, and no bordered equation inside bordered prose.
4. **Give each idea one reading path.** Avoid duplicate source panels and decorative inspection modes. Alternate views are useful when they answer different questions: a diff needs Unified and Split layouts, with one active listing, persistent controls, and exact Copy. Finish the entire frame, including its lower edge.
5. **Size labels in screen pixels.** Measure the size after scaling: at least 15px on phones and about 16–18px on desktop. Do not inflate desktop to rescue phones; size labels from the SVG's real scale. Put long labels in HTML.
6. **Motion exposes the mechanism.** Show the smallest worked step, then the accumulated process. Link the object, its internal state and a history or measurement to the same model. Every intermediate frame must be a true state from the scene clock; a curve drawing itself is not yet an explanation of a process.
7. **Interact through the idea itself.** Give the reader the variable (a native range for `n`, a weight, a step), not a zoom or pan. A linked readout shows values computed from the same source as the drawing.
8. **Nothing waits on a timer.** Body content appears immediately. A header may use one 240ms opacity-and-4px entrance. Figures move only after play and never loop. Under reduced motion they open on their final frame.
9. **Align by structure.** Build a disclosure as a marker, a label and a question on a grid, with the marker and label boxes one question line (`1lh`) tall. Declare the alignment with `auditLayout`, so it is measured at every width.
10. **Make focus quiet and visible, and leave mouse behaviour alone.** On keyboard focus, show a 2px accent cue on the marker or text, not a full-row rectangle. Never cancel mousedown to hide a focus ring, because that also blocks text selection.
11. **Selection inverts.** Selected text is ink on the text colour, both in the page and in code shadow roots.
12. **Controls are calm until wanted.** Mono at 11–13px in muted colour, at least 44px rows on touch. Hover brightens the colour, press darkens the background, and there is no bounce.

## Enforced

`bun run taste` scans source; `bun run taste --url <page>` measures any page, including course sites; `visual/taste.visual.ts` runs both on every route, with disclosures closed and then open. Fix the cause: silence a line only with `taste-allow <rule>: <reason>`. Each rule is a repeated reader complaint:

| Rule | Complaint |
| --- | --- |
| `near-miss-alignment`, `off-center` | "things are constantly misaligned" |
| `stacked-dividers`, `divider-density` | "too many dividers" |
| `redundant-controls`, `duplicate-readout`, `disclosure-budget` | "too many sliders… redundant", "too many drop downs" |
| control stability test | "Play→Pause shifts Replay" |
| `instruction-without-handle`, `motion-promise` | "slide the white dot" had no handler; "moving strips" never moved |
| first-press test | the first Play started mid-way and skipped the opening |
| handle-reachability test | the result dot covered P₃ after End: unclickable, then still painted over it |
| `orphan-wrap`, `wrapped-label`, `label-off-beat` | "End" stranded alone; "Through the middle" breaking inside its button; step labels sliding off their beats |
| `uneven-scale` | "0 1 2 not correctly spaced" |
| `long-inline-math`, `broken-inline-math` | "math equations go on each line"; "n+" and "1" split across lines |
| `wall-of-text`, `filler-prose` | "bloatware with dead sentences" |
| `linear-motion`, `hover-zoom`, `anchor-jump` | "bland and linear", "zoom", "JUMP" |
| `tall-figure` | "Play scrolls the curve away" |
| `clipped-math` | "centring hides the left-hand expressions"; a formula scrolling silently inside its box |
| `mark-through-label` | "rings cut through the P₁ label" |
| drag-to-edge test | "dragging P₁ to the edge sends its label offscreen" |
| `mixed-notation` | "P0" in figures, P₀ in prose |
| `dark-only`, `palette-tokens`, `selection-not-inverted`, `no-mermaid` | dark terminal palette, hand-drawn SVG |

Correctness comes first: a passing taste run never excuses an unverified number or a frame that shows an untrue state.
