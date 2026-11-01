import { createComputed, createMemo, createSignal, For, on } from "solid-js";
import {
  Axes,
  DiagramViewer,
  Experiment,
  Legend,
  More,
  Readout,
  Tex,
  useDiagram,
  createScene,
} from "../../../kit";
import { BOX, chordBound, curvePath } from "../bezier/model";
import { prepareRefinement } from "../bezier/refinement";
import { Handles } from "../bezier/Handles";
import { movePoint, points } from "../bezier/store";

const N_MAX = 32,
  TOL = 0.5;
// Log–log chart: x is segment count; y fits the positive errors and bounds.
const W = 560,
  H = 314,
  X0 = 88,
  X1 = 536,
  Y0 = 246,
  Y1 = 34;
const LX = (n: number) => X0 + (Math.log2(n) / Math.log2(N_MAX)) * (X1 - X0);

const CHART = [1, 2, 4, 8, 16, 32] as const;
const fmt = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

export function Flatten() {
  const scene = createScene([{ label: "Double n", ms: 3200 }]);
  const prepared = createMemo(() => prepareRefinement(points()));
  const [pacing, setPacing] = createSignal(prepared().pacing(scene.length));
  scene.seek(pacing().stops[2]);
  // Capture only at the beginning of normal playback. Geometry edits and seeks
  // retain this schedule, so they cannot change phase beneath the reader's hand.
  createComputed(
    on(scene.playing, (playing) => {
      if (playing && scene.t() === 0) setPacing(prepared().pacing(scene.length));
    }),
  );
  const phase = () => pacing().phaseAt(scene.t());
  const frame = createMemo(() => prepared().frame(phase()));
  const dotSlots = Array.from({ length: 17 }, (_, i) => i);
  const series = () => prepared().series;
  const settledCount = () => {
    const state = frame().state;
    return state.kind === "settled" ? state.n : undefined;
  };
  const stationary = () => {
    const state = frame().state;
    return state.kind === "splitting" && state.stationary;
  };
  const description = () => {
    const state = frame().state;
    return state.kind === "settled"
      ? `${state.n} straight ${state.n === 1 ? "piece" : "pieces"}`
      : `Splitting ${state.from} → ${state.to} pieces`;
  };
  const hasCurvature = () => series()[0].error > 1e-10;
  // Include every positive sample and the proven bound; dragging cannot clip the data.
  const range = createMemo(() => {
    const positive = series()
      .flatMap((row) => [row.error, row.bound])
      .filter((v) => v > 1e-10);
    const maximum = Math.max(TOL, ...positive);
    const decade = 10 ** Math.floor(Math.log10(maximum));
    const top = [1, 2, 5, 10].map((m) => m * decade).find((v) => v >= maximum)!;
    return { lo: Math.floor(Math.log10(Math.min(TOL, ...positive))), top };
  });
  const ticks = () => {
    const values = Array.from(
      { length: Math.floor(Math.log10(range().top)) - range().lo + 1 },
      (_, i) => 10 ** (range().lo + i),
    );
    if (values.at(-1) !== range().top) values.push(range().top);
    return values;
  };
  const LY = (e: number) =>
    Y0 -
    ((Math.log10(Math.max(10 ** range().lo, e)) - range().lo) /
      (Math.log10(range().top) - range().lo)) *
      (Y0 - Y1);
  const need = () => Math.max(1, Math.ceil(Math.sqrt(chordBound(points(), 1) / TOL)));
  const poly = createMemo(() =>
    frame()
      .vertices.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`)
      .join(""),
  );
  const boundLine = () =>
    `M${LX(1)} ${LY(series()[0].bound)}L${LX(N_MAX)} ${LY(series().at(-1)!.bound)}`;
  const DETAILS = (
    <More summary="Compare the gaps and error bounds">
      <p>
        Distances are in figure units; at full desktop width one unit is about 1.2 screen pixels.
        Gaps are measured against the current white polygon on a fixed grid of 1,025 parameters.
        Sampling can only underestimate the largest gap; the dashed bound is proved below.
      </p>
      <p>
        During a split, each new midpoint moves from its parent chord to the curve. The moving
        vertices are construction positions until the split finishes. If its progress is α, the
        polygon is (1 − α) times the old polygon plus α times the new one. The triangle inequality
        gives the same blend of their proven bounds. A red gap marker is optional: it fades away
        during the middle of each split, when separated lobes tie, and as the gap becomes too small
        on screen. The largest-gap location can switch; its endpoints always measure the current
        polygon.
      </p>
      <div hidden={!hasCurvature()}>
        <DiagramViewer
          viewBox={[0, 0, W, H]}
          label="Log–log chart of sampled largest gaps and proven error bounds against segment count."
        >
          <Axes
            grid
            x0={X0}
            x1={X1}
            y0={Y0}
            y1={Y1}
            x={CHART.map((v) => ({ at: LX(v), label: v }))}
            xTitle="segments n"
            yTitle="gap (units)"
            y={ticks().map((v) => ({ at: LY(v), label: v }))}
          />
          <line class="nk-guide nk-green" x1={X0} x2={X1} y1={LY(TOL)} y2={LY(TOL)} />
          <path class="nk-guide" d={boundLine()} />
          <For each={series()}>
            {(row) => (
              <circle
                class={row.n === settledCount() ? "nk-point nk-red" : "nk-dot nk-red"}
                cx={LX(row.n)}
                cy={LY(row.error)}
              />
            )}
          </For>
        </DiagramViewer>
        <Legend
          items={[
            { class: "nk-red", mark: "dot", label: "largest gap" },
            { class: "", mark: "dash", label: "bound h²·max‖B″‖/8" },
            { class: "nk-green", mark: "dash", label: "half a unit" },
          ]}
        />
      </div>
      <Readout quiet={scene.playing()}>
        <span>
          bound <b>{fmt(frame().bound)}</b>
        </span>
        <span>
          n ≥ <b>{need()}</b> guarantees half a unit
        </span>
      </Readout>
    </More>
  );
  return (
    <Experiment
      timeline="Subdivision playback"
      id="flatten-experiment"
      scene={scene}
      stepTimes={pacing().stops}
      question="How many little pieces make the line look smooth?"
      caption={
        <>
          <span class="bz-refinement-status">
            {hasCurvature() ? (
              <>
                {settledCount() !== undefined ? (
                  <>
                    <b class="bz-count">{settledCount()}</b> straight{" "}
                    {settledCount() === 1 ? "piece" : "pieces"}.
                  </>
                ) : (
                  <>{description()}.</>
                )}
                {stationary() ? " Midpoint already lies on the chord." : ""}
              </>
            ) : (
              <>Zero error: one piece draws this straight line exactly.</>
            )}
          </span>
          <span class="bz-refinement-gap">
            Largest sampled gap: {fmt(frame().gap.error)} units.
          </span>
        </>
      }
      details={DETAILS}
    >
      <div
        data-refinement-state={frame().state.kind}
        data-refinement-phase={phase()}
        data-refinement-stops={JSON.stringify(pacing().stops)}
        data-refinement-stationary={stationary()}
        style={{ "max-width": "560px", margin: "0 auto" }}
      >
        <DiagramViewer
          viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]}
          label={`${description()}; the largest sampled gap is ${fmt(frame().gap.error)} units.`}
        >
          <path class="nk-stroke" d={curvePath(points())} />
          {/* The chords are the approximation, so they are the brightest line. */}
          <g style={{ "--role": "var(--bright)" }}>
            <path data-refinement-path class="nk-stroke" d={poly()} />
            <g>
              <For each={dotSlots}>
                {(i) => (
                  <circle
                    data-refinement-dot
                    class="nk-dot"
                    cx={frame().vertices[i][0]}
                    cy={frame().vertices[i][1]}
                    opacity={frame().dotOpacity[i]}
                    visibility={frame().dotOpacity[i] > 0 ? "visible" : "hidden"}
                  />
                )}
              </For>
            </g>
          </g>
          <GapMarker
            at={frame().gap.at}
            error={frame().gap.error}
            opacity={frame().markerOpacity}
            curved={hasCurvature()}
          />
          <Handles points={points()} onMove={movePoint} onGrab={scene.pause} />
        </DiagramViewer>
      </div>
    </Experiment>
  );
}

/** A subpixel miss needs only its numerical readout. */
function GapMarker(props: {
  at: readonly [readonly [number, number], readonly [number, number]];
  error: number;
  opacity: number;
  curved: boolean;
}) {
  const { u } = useDiagram();
  const opacity = () => {
    const size = Math.max(0, Math.min(1, (props.error / u() - 3) / 3));
    return props.opacity * size * size * (3 - 2 * size);
  };
  const visible = () => props.curved && opacity() > 0;
  return (
    <g
      class="nk-red"
      data-gap-marker
      opacity={opacity()}
      visibility={visible() ? "visible" : "hidden"}
    >
      <line
        class="nk-curve"
        stroke-width="4"
        x1={props.at[0][0]}
        y1={props.at[0][1]}
        x2={props.at[1][0]}
        y2={props.at[1][1]}
      />
    </g>
  );
}

/** The explanation follows the same live control points as the figure. */
export function FlattenSummary() {
  const values = createMemo(() => {
    const series = prepareRefinement(points()).series;
    return {
      eight: series[3].error,
      sixteen: series[4].error,
      need: Math.max(1, Math.ceil(Math.sqrt(chordBound(points(), 1) / TOL))),
      curved: series[0].error > 1e-10,
    };
  });
  return (
    <p data-flatten-summary>
      For this curve, going from 8 to 16 pieces changes the largest sampled gap from{" "}
      <span data-gap-eight>{fmt(values().eight)}</span> to{" "}
      <span data-gap-sixteen>{fmt(values().sixteen)}</span> units.{" "}
      {values().curved ? (
        <>
          {" "}
          The proven bound guarantees a gap of at most half a unit when <Tex tex="n" /> ≥{" "}
          <span data-guaranteed-count>{values().need}</span>.
        </>
      ) : (
        <>The points lie on a straight line, so one segment already draws it exactly.</>
      )}
    </p>
  );
}
