# Authoring decisions

Load only the section needed for the note being written. The short portable entry lives in templates/starter/.

## Choose the representation

- Explain mathematics with strict local KaTeX and hand-authored SVG. Do not generate Mermaid diagrams or add Mermaid runtimes. Compute diagram geometry from the same numerical data used by the explanation.
- Use a graph when the reader must compare magnitudes, see a distribution, understand a trend, or examine a relationship. Use data analysis when it answers the reader's question; show units, sources, transformations, sample sizes and uncertainty where relevant. Distinguish illustrative numbers from observations. A decorative chart is not evidence.
- Preserve equal units per pixel when angles, circles or distances carry meaning. Build axes and ticks from data values. Do not imply causation from correlation or hide an inconvenient range through a cropped axis.

## Compress meaning, not coverage

Prefer a precise established term when it replaces a longer explanation accurately. At first use, give a short visible meaning, then a hover/focus/tap definition through the typed glossary. Example: “A tautology is true for every truth assignment” in classical propositional logic. Do not call an empirical regularity, a useful invariant, or an obvious-looking claim a tautology.

One precise word plus a nearby meaning can reduce repetition; unfamiliar jargon without a meaning increases the reader's work. Keep assumptions, exceptions, proof obligations and source coverage. Captions identify marks, readouts describe the current operation, and prose gives the reason. Delete sentences repeated across those layers.

## Check visual visibility

Essential labels and controls must be visible, readable and unobstructed in the state where needed. Measure actual transformed/scaled bounding boxes, not just authored font sizes. Check label-label and declared label-obstacle intersections, clipping, ancestor opacity, keyboard focus, open menus/disclosures and representative intermediate animation frames at 1280/390/320px.

Declare intended containment/overlap explicitly. Never silence a diagnostic with overflow:hidden, reduce font size below readability, or exempt an entire figure to hide one collision. Layout diagnostics find specific geometric failures; screenshots and human inspection still verify semantic placement and visual balance.
