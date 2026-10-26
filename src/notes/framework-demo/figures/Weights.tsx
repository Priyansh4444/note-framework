import { For } from "solid-js";
import { DiagramViewer, Experiment, Tex, createScene, createPlayback } from "../../../kit";
import { Handles, NAME, ROLE } from "../bezier/Handles";
import { bernstein, BOX, convexHull, curvePath, pathOf, pointAt, weights } from "../bezier/model";
import { movePoint, points } from "../bezier/store";

// Basis chart geometry, in its own SVG units.
const CW = 560,
  CH = 230,
  X0 = 44,
  X1 = 540,
  Y0 = 196,
  Y1 = 18;
const cx = (t: number) => X0 + t * (X1 - X0);
const cy = (w: number) => Y0 - w * (Y0 - Y1);
const basis = (i: number) =>
  Array.from({ length: 81 }, (_, k) => {
    const t = k / 80;
    return `${k ? "L" : "M"}${cx(t).toFixed(2)} ${cy(bernstein(3, i, t)).toFixed(2)}`;
  }).join("");
const BASIS = [0, 1, 2, 3].map(basis);
const TEX = ["(1-t)^3", "3t(1-t)^2", "3t^2(1-t)", "t^3"];

export function Weights() {
  const scene = createScene([
    { label: "First point", ms: 1800 },
    { label: "Middle pair", ms: 2400 },
    { label: "Last point", ms: 1800 },
  ]);
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.3 });
  const t = playback.value;
  const w = () => weights(t());
  const b = () => pointAt(points(), t());
  // Scrub along the chart: x maps through the SVG's own transform to t.
  let scrubbing: number | undefined;
  const scrub = (event: PointerEvent) => {
    const svg =
      (event.currentTarget as SVGElement).ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
    const m = svg.getScreenCTM();
    if (!m) return;
    const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse()).x;
    playback.seek(Math.min(1, Math.max(0, (x - X0) / (X1 - X0))));
  };
  return (
    <Experiment
      scene={scene}
      timeline="Weight playback"
      id="weight-experiment"
      question="Each control point pulls on B(t). How hard?"
      caption={
        <>
          Each control point’s ring area and line opacity show its weight. Weights never go negative
          and always add up to one, so B(t) never leaves the shaded hull. Drag the chart to scrub{" "}
          <var>t</var>.
        </>
      }
    >
      <DiagramViewer
        viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]}
        label={`The curve inside the convex hull of its control points. At t = ${t().toFixed(2)} the weights are ${w()
          .map((v) => v.toFixed(2))
          .join(", ")}.`}
      >
        <path class="bz-hull" d={pathOf(convexHull(points()))} />
        <path class="bz-curve bz-curve-quiet" d={curvePath(points())} />
        <For each={[0, 1, 2, 3]}>
          {(i) => (
            <>
              <line
                class={`bz-pull bz-${ROLE[i]}`}
                x1={b()[0]}
                y1={b()[1]}
                x2={points()[i][0]}
                y2={points()[i][1]}
                stroke-opacity={0.15 + 0.85 * w()[i]}
              />
              <circle
                class={`bz-weight bz-${ROLE[i]}`}
                cx={points()[i][0]}
                cy={points()[i][1]}
                r={34 * Math.sqrt(w()[i])}
              />
            </>
          )}
        </For>
        <Handles points={points()} onMove={movePoint} onGrab={playback.pause} />
        <circle class="bz-point-halo" cx={b()[0]} cy={b()[1]} r="15" />
        <circle class="bz-point" cx={b()[0]} cy={b()[1]} r="7.5" />
      </DiagramViewer>
      <div
        class="bz-bar"
        role="img"
        aria-label={`Weights: ${w()
          .map((v, i) => `${NAME[i]} ${v.toFixed(3)}`)
          .join(", ")}; sum 1.`}
      >
        <For each={[0, 1, 2, 3]}>
          {(i) => <span class={`bz-bar-part bz-${ROLE[i]}`} style={{ "flex-grow": w()[i] }} />}
        </For>
      </div>
      <dl class="bz-weights">
        <For each={[0, 1, 2, 3]}>
          {(i) => (
            <div class={`bz-c${i}`}>
              <dt>{NAME[i]}</dt>
              <dd>{w()[i].toFixed(3)}</dd>
            </div>
          )}
        </For>
        <div class="bz-weights-sum">
          <dt>Sum</dt>
          <dd>
            {w()
              .reduce((a, v) => a + v, 0)
              .toFixed(3)}
          </dd>
        </div>
      </dl>
      <DiagramViewer
        viewBox={[0, 0, CW, CH]}
        label="The four Bernstein weight curves for t from 0 to 1, with a cursor at the chosen t."
      >
        <g class="bz-axes">
          <line x1={X0} y1={Y0} x2={X1} y2={Y0} />
          <line x1={X0} y1={Y1} x2={X1} y2={Y1} class="bz-axis-faint" />
          <text x={X0 - 10} y={Y0} dy="0.35em" text-anchor="end">
            0
          </text>
          <text x={X0 - 10} y={Y1} dy="0.35em" text-anchor="end">
            1
          </text>
          <text x={X0} y={Y0} dy="1.4em" text-anchor="middle">
            t = 0
          </text>
          <text x={X1} y={Y0} dy="1.4em" text-anchor="end">
            1
          </text>
        </g>
        <For each={[0, 1, 2, 3]}>
          {(i) => <path class={`bz-basis bz-${ROLE[i]}`} d={BASIS[i]} />}
        </For>
        <line class="bz-cursor" x1={cx(t())} x2={cx(t())} y1={Y1 - 6} y2={Y0} />
        <For each={[0, 1, 2, 3]}>
          {(i) => (
            <circle class={`bz-basis-dot bz-${ROLE[i]}`} cx={cx(t())} cy={cy(w()[i])} r="5" />
          )}
        </For>
        <rect
          class="bz-scrub"
          x={X0 - 12}
          y={0}
          width={X1 - X0 + 24}
          height={CH}
          onPointerDown={(e) => {
            if (e.button) return;
            playback.pause();
            scrubbing = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e);
          }}
          onPointerMove={(e) => {
            if (scrubbing === e.pointerId) scrub(e);
          }}
          onPointerUp={() => (scrubbing = undefined)}
          onPointerCancel={() => (scrubbing = undefined)}
        />
      </DiagramViewer>
      <p class="bz-legend">
        <For each={[0, 1, 2, 3]}>
          {(i) => (
            <span class={`bz-c${i}`}>
              <i />
              {NAME[i]}
              <span class="bz-legend-tex">
                <Tex tex={TEX[i]} />
              </span>
            </span>
          )}
        </For>
      </p>
    </Experiment>
  );
}
