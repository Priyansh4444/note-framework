# Optional authoring tools

Read only the tool you are using. The worked note is the quickest example.

## Add an instrument

`Experiment` gives a question, controls and optional details one place on the page. `Parameter` is a controlled native range: the value and bounds stay in your model. This complete component needs no CSS or scene. Save it beside your note's `index.tsx`, then import and render `<IndexExperiment />`:

```tsx
import { createSignal } from "solid-js";
import { Experiment, Parameter } from "../../kit";

export function IndexExperiment() {
  const letters = ["A", "B", "C", "D"];
  const [index, setIndex] = createSignal(0);
  return (
    <Experiment
      question="Which letter does this index select?"
      controls={
        <Parameter label="Index" value={index()}
          min={0} max={3} step={1} onInput={setIndex} />
      }
      caption="Index 2 selects the third letter."
    >
      <p>A · B · C · D</p>
      <output aria-live="polite">
        Slot {index()} holds {letters[index()]}.
      </output>
    </Experiment>
  );
}
```

The starter also exports this runnable component as `src/recipes.tsx`. Import it from a note with `import { IndexExperiment } from "../../recipes"`.

For animation, pass `scene={scene}` to `Experiment` **or** use `SceneFrame`; each attaches its scene, so never nest them. Keep one clock and persistent SVG nodes. A parameter change during construction must preserve the visible model before pausing, seeking to the completed construction, and committing the new value. The worked `FillFigure` uses a discrete index, so its handler simply pauses, finishes construction, then changes selection. Static experiments need none of that setup.

## Inspect a diagram

`DiagramViewer` supplies the SVG root. Its children are hand-authored SVG nodes:

```tsx
<DiagramViewer label="Three points" viewBox={[0, 0, 360, 220]}>
  <path d="M40 180L320 180L180 40Z" />
</DiagramViewer>
```

Use it inside `Figure`, `SceneFrame`, or `Experiment`; keep one shell's caption and playback. It is an inline SVG surface, without camera controls or extra framing. An animated figure gets its values from the existing scene clock. Prefer a control that changes the explained quantity over a generic zoom toolbar.

## Add code or a diff

```tsx
import source from "./examples/selection.ts?code";
import change from "./examples/selection.diff?diff";
import { CodeBlock } from "../../kit";

<CodeBlock artifact={source} />
<CodeBlock artifact={change} />
```

The build reads these files as text and renders primary source with the measured GitHub Dark palette. It never executes imported examples. Diff input is a unified patch for one file. The single version toggle retains shared text during the morph. Source tools exposes Before/After, Unified/Split inspection with Pierre’s [Vesper theme](https://github.com/raunofreiberg/vesper), omission notices, and exact original-source Copy. Horizontal scrolling stays inside the listing. Use `.txt?code` for intentional plain text. The reader receives build-highlighted data inside a real shadow root; no highlighter, grammar, worker or external fetch runs in the reader.

## Choose one playback control

Use `createPlayback(scene, { min, max, initial })` to map the scene clock to the value drawn in the picture. Give each animation one visible position control: prefer the curved `Experiment` timeline, or use a `Parameter` with `playback.seek` and `playback.pause` when a numeric range is clearer. Do not bind both controls to the same position. Keep `Parameter` for independent model inputs. A grab pauses before any value changes; releasing stays paused. Play continues from the chosen position, while Replay starts again.

`Page` supplies the reading timeline through its chapter registry; that timeline follows document scrolling. Add `timeline="A short name"` to `Experiment` only when the figure needs its own clock scrubber. Its blue line segment follows the scene clock along a shallow S-shaped rail; labelled checkpoints seek exact beat starts. Use `step` in `createPlayback` only for discrete model states such as whole segment counts. Keep continuous mathematical motion unrounded; display formatting and native input steps remain separate.

`SweepExperiment` in `src/recipes.tsx` is a complete portable example with two linked mixes and a curved path. It needs no custom CSS or second animation loop. The minimal `IndexExperiment` remains a static, controlled example. Honor reduced motion on initial display and keep manual seeking available.

## Add sound to a scene

Pass `sound={plan}` to the same `Experiment` that owns the scene. A `CuePlan` contains `events` (`id`, `atMs`, `cue`) and `flights` (`startMs`, `endMs`), in scene milliseconds. Cues are `ready`, `contact`, `send`, `appear`, or `complete`. Derive the plan from the same events as the picture; sound observes playback and never advances it. `actionsPlacement="bottom"` places playback and Sound controls below the picture.

Sound starts off. The reader enables it with the visible Sound button; unavailable or blocked audio leaves a working silent figure. Seeking, checkpoint steps and replay resets are silent. Pause, mute, hidden/offscreen scenes and disposal stop existing voices. Keep cues sparse and quiet; never add a second clock, audio files or external requests. Verify synthesized output and lifecycle separately from physical speaker audibility.

## Check alignment and visibility

Use `<details><DisclosureSummary>Why does this happen?</DisclosureSummary>…</details>` for an ordinary disclosure. Import `DisclosureSummary` from the kit; it keeps native disclosure behavior, a first-line marker, consistent padding and localized keyboard focus. `Check` remains the specialized question/answer component.

The audit automatically checks kit disclosure padding/parts/first-line alignment, parameter headers/bounds/straight rails/exact fill endpoints/attached contours, and the example navigation's icon spacing. These checks measure boxes and paths; they cannot infer native thumb paint or font ink from computed pseudo-element styles.

Annotate other intended relationships; automatic checks also examine visible SVG text:

```tsx
<g {...auditLayout({ align: "y-center", gaps: "x", count: 3 })}>
  {/* Three direct SVG children whose rendered bounds should align. */}
</g>
```

`align` compares start/center/end on x or y; `gaps` checks equal edge-to-edge spacing. `count` catches a missing child. `visible: true` declares required visibility; `separate` declares clearance in CSS pixels. Grouping equal centers does not guarantee equal gaps for unequal-sized items. Keep intentional containment separate from non-overlap groups.

Run `bun run visual:install` once if Chromium is missing, then `bun run note:audit <slug>`. For an existing page, use `bun run visual:check <url>`. Reports identify the viewport, state, elements, measured bounds and correction hints, and save screenshots. Fix the actual geometry; do not hide overflow or shrink essential labels to silence errors.

The audit samples layout and animation states. It cannot prove continuous visibility or mathematical correctness. Unsupported required geometry must be reported, not counted as a pass. Review screenshots, keyboard access, disclosures, hover/focus meanings and reduced motion too.

## Use graphs and precise vocabulary

Use a graph when comparison, distribution or trend answers the reader's question. Compute marks and tables from the same local data; show units, sources, uncertainty and transformations when relevant. Distinguish measurements from analytic/illustrative values. Hand-author SVG; use strict KaTeX for math. No Mermaid.

Use a precise term when it shortens the explanation accurately. Give its short meaning visibly first, then a glossary hover/focus/tap reminder. “Tautology” means true for every truth assignment in classical propositional logic; it is not a synonym for an invariant or an empirical pattern. Compress repetition, not assumptions or coverage.
