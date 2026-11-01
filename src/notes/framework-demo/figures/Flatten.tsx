import { createMemo, For } from "solid-js";
import {
  Axes,
  clamp01,
  DiagramViewer,
  Experiment,
  Legend,
  More,
  Readout,
  Tex,
  useDiagram,
  createScene,
  createPlayback,
} from "../../../kit";
import { BOX, chordBound, chordError, chords, worstChordGap, curvePath } from "../bezier/model";
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

// Past this many pieces the sample dots crowd the curve; the chords alone read better.
const DOTS = 12;
// Play doubles the count through these; the chart also shows 32, where the gap is subpixel.
const PLAYED = [1, 2, 4, 8, 16] as const;
const CHART = [1, 2, 4, 8, 16, 32] as const;
const fmt = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

export function Flatten() {
  const scene = createScene([{ label: "Double n", ms: 5000 }]);
  // The clock steps k = 0…4 in equal bins; n = 2ᵏ.
  const playback = createPlayback(scene, { min: 0, max: PLAYED.length - 1, initial: 2, step: 1 });
  const k = createMemo(playback.value);
  const n = () => PLAYED[k()];
  // Past DOTS the sample dots fade over the first 300 ms of their bin, on the scene clock.
  const dots = () =>
    n() <= DOTS ? 1 : clamp01(1 - (scene.t() - (scene.length * k()) / PLAYED.length) / 300);
  const samples = createMemo(() => chords(points(), n()));
  const dotSlots = Array.from({ length: PLAYED.at(-1)! + 1 }, (_, i) => i);
  // Powers of two for the chart, recomputed only when the control points move.
  const series = createMemo(() =>
    CHART.map((m) => ({
      n: m,
      error: chordError(points(), m, 32),
      bound: chordBound(points(), m),
    })),
  );
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
  const now = () => series()[k()];
  const need = () => Math.max(1, Math.ceil(Math.sqrt(chordBound(points(), 1) / TOL)));
  const gap = createMemo(() => worstChordGap(points(), n(), 32).at);
  const poly = createMemo(() =>
    samples()
      .map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(2)} ${q[1].toFixed(2)}`)
      .join(""),
  );
  const boundLine = () =>
    `M${LX(1)} ${LY(series()[0].bound)}L${LX(N_MAX)} ${LY(series().at(-1)!.bound)}`;
  const DETAILS = (
    <More summary="Compare the gaps and error bounds">
      <p>
        Distances are in figure units; at full desktop width one unit is about 1.2 screen pixels.
        Gaps are sampled at 33 parameters per segment, which can only underestimate the largest gap;
        the dashed bound is proved below.
      </p>
      <div hidden={!hasCurvature()}>
        <DiagramViewer
          viewBox={[0, 0, W, H]}
          label="Log–log chart of largest gap against segment count: the measured gaps fall along a line of slope minus two, just under the bound."
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
                class={row.n === n() ? "nk-point nk-red" : "nk-dot nk-red"}
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
          bound <b>{fmt(now().bound)}</b>
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
      stepTimes={playback.steps}
      question="How many little pieces make the line look smooth?"
      caption={
        hasCurvature() ? (
          <>
            <b class="bz-count">{n()}</b> straight {n() === 1 ? "piece" : "pieces"}, in white, try
            to follow the grey curve. Largest sampled gap: {fmt(now().error)} units. Red marks the
            gap while it is large enough to see.
          </>
        ) : (
          <>Zero error: these points lie on a straight line, so one segment draws it exactly.</>
        )
      }
      details={DETAILS}
    >
      <div style={{ "max-width": "560px", margin: "0 auto" }}>
        <DiagramViewer
          viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]}
          label={`The curve approximated by ${n()} straight segments; the largest sampled gap is ${fmt(now().error)} units.`}
        >
          <path class="nk-stroke" d={curvePath(points())} />
          {/* The chords are the approximation, so they are the brightest line. */}
          <g style={{ "--role": "var(--bright)" }}>
            <path class="nk-stroke" d={poly()} />
            <g opacity={dots()}>
              <For each={dotSlots}>
                {(i) => (
                  <circle
                    class="nk-dot"
                    cx={samples()[Math.min(i, n())][0]}
                    cy={samples()[Math.min(i, n())][1]}
                    visibility={i <= n() && dots() > 0 ? "visible" : "hidden"}
                  />
                )}
              </For>
            </g>
          </g>
          <GapMarker at={gap()} error={now().error} curved={hasCurvature()} />
          <Handles points={points()} onMove={movePoint} onGrab={playback.pause} />
        </DiagramViewer>
      </div>
    </Experiment>
  );
}

/** A subpixel miss needs a numerical readout, not a ring over an endpoint. */
function GapMarker(props: {
  at: readonly [readonly [number, number], readonly [number, number]];
  error: number;
  curved: boolean;
}) {
  const { u } = useDiagram();
  const visible = () => props.curved && props.error / u() >= 3;
  const ringClear = () =>
    points().every((p) => Math.hypot(p[0] - props.at[0][0], p[1] - props.at[0][1]) > 14 + 10 * u());
  return (
    <g class="nk-red" data-gap-marker visibility={visible() ? "visible" : "hidden"}>
      <line
        class="nk-curve"
        stroke-width="4"
        x1={props.at[0][0]}
        y1={props.at[0][1]}
        x2={props.at[1][0]}
        y2={props.at[1][1]}
      />
      <circle
        class="nk-stroke"
        cx={props.at[0][0]}
        cy={props.at[0][1]}
        r="14"
        stroke-width="1.5"
        visibility={visible() && ringClear() ? "visible" : "hidden"}
      />
    </g>
  );
}

/** The explanation follows the same live control points as the figure. */
export function FlattenSummary() {
  const values = createMemo(() => ({
    eight: chordError(points(), 8, 32),
    sixteen: chordError(points(), 16, 32),
    need: Math.max(1, Math.ceil(Math.sqrt(chordBound(points(), 1) / TOL))),
    curved: chordError(points(), 1, 32) > 1e-10,
  }));
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
