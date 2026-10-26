import { createMemo, For } from "solid-js";
import {
  DisclosureSummary,
  DiagramViewer,
  Experiment,
  createScene,
  createPlayback,
} from "../../../kit";
import {
  BOX,
  chordBound,
  chordError,
  chords,
  curvePath,
  lerp,
  pointAt,
  type Cubic,
  type Point,
} from "../bezier/model";
import { Handles } from "../bezier/Handles";
import { movePoint, points } from "../bezier/store";

const N_MAX = 32,
  TOL = 0.5;
// Log–log chart: x is segment count; y fits the positive errors and bounds.
const W = 560,
  H = 270,
  X0 = 88,
  X1 = 536,
  Y0 = 228,
  Y1 = 16;
const LX = (n: number) => X0 + (Math.log2(n) / Math.log2(N_MAX)) * (X1 - X0);

const fmt = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Where the sampled gap is largest: the curve point and the chord point at the same parameter. */
function worstGap(p: Cubic, n: number): [Point, Point] {
  let best: [Point, Point] = [p[0], p[0]],
    d = -1;
  for (let k = 0; k < n; k++) {
    const a = pointAt(p, k / n),
      b = pointAt(p, (k + 1) / n);
    for (let s = 0; s <= 32; s++) {
      const u = s / 32,
        q = pointAt(p, (k + u) / n),
        c: Point = [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
      const gap = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (gap > d) {
        d = gap;
        best = [q, c];
      }
    }
  }
  return best;
}

export function Flatten() {
  const scene = createScene([
    { label: "1–8 pieces", ms: 2400 },
    { label: "9–16 pieces", ms: 2400 },
    { label: "17–24 pieces", ms: 2400 },
    { label: "25–32 pieces", ms: 2400 },
  ]);
  const playback = createPlayback(scene, { min: 1, max: N_MAX, initial: 4, step: 1 });
  const n = createMemo(playback.value);
  const samples = createMemo(() => chords(points(), n()));
  const dotSlots = Array.from({ length: N_MAX + 1 }, (_, i) => i);
  // Only the trace advances inside a bin; count, error and chord geometry stay fixed.
  const trace = () => (scene.ended() ? 1 : ((scene.t() / scene.length) * N_MAX) % 1);
  // Every n from 1 to 32 for the chart, recomputed only when the control points move.
  const series = createMemo(() =>
    Array.from({ length: N_MAX }, (_, k) => ({
      n: k + 1,
      error: chordError(points(), k + 1, 32),
      bound: chordBound(points(), k + 1),
    })),
  );
  const hasCurvature = () => series()[0].bound > 1e-10;
  // Include every positive sample and the proven bound; dragging cannot clip the data.
  const range = createMemo(() => {
    const positive = series()
      .flatMap((row) => [row.error, row.bound])
      .filter((v) => v > 1e-10);
    return {
      lo: Math.floor(Math.log10(Math.min(0.1, ...positive))),
      hi: Math.ceil(Math.log10(Math.max(100, ...positive))),
    };
  });
  const ticks = () =>
    Array.from({ length: range().hi - range().lo + 1 }, (_, i) => 10 ** (range().lo + i));
  const LY = (e: number) =>
    Y0 -
    ((Math.log10(Math.max(10 ** range().lo, e)) - range().lo) / (range().hi - range().lo)) *
      (Y0 - Y1);
  const now = () => series()[n() - 1];
  const need = () => Math.max(1, Math.ceil(Math.sqrt(chordBound(points(), 1) / TOL)));
  const gap = createMemo(() => worstGap(points(), n()));
  const poly = createMemo(() =>
    samples()
      .map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(2)} ${q[1].toFixed(2)}`)
      .join(""),
  );
  const boundLine = () =>
    `M${LX(1)} ${LY(series()[0].bound)}L${LX(N_MAX)} ${LY(series()[N_MAX - 1].bound)}`;
  return (
    <Experiment
      timeline="Subdivision playback"
      id="flatten-experiment"
      scene={scene}
      question="How many little pieces make the line look smooth?"
      controls={
        <p class="bz-piece-readout">
          <output class="bz-piece-count">{n()}</output> straight pieces
        </p>
      }
      caption={
        <>The orange pieces try to follow the curve. The red mark shows where they miss it most.</>
      }
    >
      <DiagramViewer
        viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]}
        label={`The curve approximated by ${n()} straight segments; the largest sampled gap is ${fmt(now().error)} units.`}
      >
        <path class="bz-curve bz-curve-quiet" d={curvePath(points())} />
        <path class="bz-chords" d={poly()} />
        <path class="bz-chord-trace" d={poly()} pathLength="1" stroke-dasharray={`${trace()} 1`} />
        <For each={dotSlots}>
          {(i) => (
            <circle
              class="bz-chord-dot"
              cx={samples()[Math.min(i, n())][0]}
              cy={samples()[Math.min(i, n())][1]}
              r="3.5"
              visibility={i <= n() ? "visible" : "hidden"}
            />
          )}
        </For>
        <line class="bz-gap" x1={gap()[0][0]} y1={gap()[0][1]} x2={gap()[1][0]} y2={gap()[1][1]} />
        <circle class="bz-gap-end" cx={gap()[0][0]} cy={gap()[0][1]} r="4" />
        <g class="bz-quiet-handles">
          <Handles points={points()} onMove={movePoint} onGrab={playback.pause} />
        </g>
      </DiagramViewer>
      <p class="bz-zero-error" hidden={hasCurvature()}>
        Zero error. These evenly spaced points make a straight line; one segment draws it exactly.
      </p>
      <details class="bz-numbers">
        <DisclosureSummary>Compare the gaps and error bounds</DisclosureSummary>
        <p class="bz-chart-note">
          Distances are in figure units; at full desktop width one unit is about 1.2 screen pixels.
          Gaps are sampled at 33 parameters per segment, which can only underestimate the largest
          gap; the dashed bound is proved below.
        </p>
        <div class="bz-error-chart" hidden={!hasCurvature()}>
          <DiagramViewer
            viewBox={[0, 0, W, H]}
            label="Log–log chart of largest gap against segment count: the measured gaps fall along a line of slope minus two, just under the bound."
          >
            <g class="bz-axes">
              <For each={[1, 2, 4, 8, 16, 32]}>
                {(v) => (
                  <>
                    <line class="bz-axis-faint" x1={LX(v)} x2={LX(v)} y1={Y1} y2={Y0} />
                    <text x={LX(v)} y={Y0} dy="1.4em" text-anchor="middle">
                      {v}
                    </text>
                  </>
                )}
              </For>
              <For each={ticks()}>
                {(v) => (
                  <>
                    <line class="bz-axis-faint" x1={X0} x2={X1} y1={LY(v)} y2={LY(v)} />
                    <text x={X0 - 10} y={LY(v)} dy="0.35em" text-anchor="end">
                      {v}
                    </text>
                  </>
                )}
              </For>
            </g>
            <line class="bz-tolerance" x1={X0} x2={X1} y1={LY(TOL)} y2={LY(TOL)} />
            <path class="bz-bound" d={boundLine()} />
            <For each={series()}>
              {(row) => (
                <circle
                  class="bz-error-dot"
                  cx={LX(row.n)}
                  cy={LY(row.error)}
                  r={row.n === n() ? 6.5 : 3.5}
                  data-active={row.n === n() ? "" : undefined}
                />
              )}
            </For>
          </DiagramViewer>
          <p class="bz-legend bz-legend-chart">
            <span class="bz-key-error">
              <i />
              largest gap
            </span>
            <span class="bz-key-bound">
              <i />
              bound h²·max‖B″‖/8
            </span>
            <span class="bz-key-tol">
              <i />
              half a unit
            </span>
          </p>
        </div>
        <p class="bz-readout" aria-live={scene.playing() ? "off" : "polite"}>
          <span>
            n = <b>{n()}</b>
          </span>
          <span>
            gap <b>{fmt(now().error)}</b>
          </span>
          <span>
            bound <b>{fmt(now().bound)}</b>
          </span>
          <span>
            half a unit needs n ≥ <b>{need()}</b>
          </span>
        </p>
      </details>
    </Experiment>
  );
}
