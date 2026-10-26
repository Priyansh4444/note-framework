import {
  DisclosureSummary,
  DiagramViewer,
  Experiment,
  Tex,
  createScene,
  createPlayback,
} from "../../../kit";
import { mix } from "../examples/de-casteljau";

const A = [80, 120] as const,
  B = [480, 60] as const;
const f2 = (v: number) => v.toFixed(2);

/** The smallest step: one segment, one number t, one mixed point. */
export function Mix() {
  const scene = createScene([
    { label: "A pulls more", ms: 1800 },
    { label: "Through the middle", ms: 2400 },
    { label: "B pulls more", ms: 1800 },
  ]);
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.3 });
  const t = playback.value;
  const p = () => mix(A, B, t());
  return (
    <Experiment
      timeline="Mix playback"
      scene={scene}
      question="Slide the dot from one end to the other."
      details={
        <details>
          <DisclosureSummary>Read the weights and coordinates</DisclosureSummary>
          <p>
            Lengths are fractions of the whole segment. The blue piece, beside A, has length{" "}
            <Tex tex="t" />: B’s weight. The orange piece has length <Tex tex="1-t" />: A’s weight.
            Each weight is the length of the piece on the far side, so the nearer end weighs more.
          </p>
        </details>
      }
    >
      <DiagramViewer
        viewBox={[40, 20, 480, 150]}
        label={`A segment from A to B with the mixed point ${f2(t())} of the way along.`}
      >
        <line class="bz-mix-done" x1={A[0]} y1={A[1]} x2={p()[0]} y2={p()[1]} />
        <line class="bz-mix-rest" x1={p()[0]} y1={p()[1]} x2={B[0]} y2={B[1]} />
        <circle class="bz-end bz-p0" cx={A[0]} cy={A[1]} r="7" />
        <circle class="bz-end bz-p3" cx={B[0]} cy={B[1]} r="7" />
        <text class="bz-label" x={A[0]} y={A[1]} dy="1.6em" text-anchor="middle">
          A
        </text>
        <text class="bz-label" x={B[0]} y={B[1]} dy="1.6em" text-anchor="middle">
          B
        </text>
        <circle class="bz-point" cx={p()[0]} cy={p()[1]} r="8" />
        <text
          class="bz-label bz-label-strong"
          x={p()[0]}
          y={p()[1]}
          dy="-0.95em"
          text-anchor="middle"
        >
          p
        </text>
      </DiagramViewer>
      <details class="bz-numbers">
        <DisclosureSummary>See the numbers</DisclosureSummary>
        <p class="bz-sum" aria-live={scene.playing() ? "off" : "polite"}>
          <span class="bz-sum-term bz-c0">
            <b>{f2(1 - t())}</b> × A
          </span>
          <span class="bz-sum-op">+</span>
          <span class="bz-sum-term bz-c3">
            <b>{f2(t())}</b> × B
          </span>
          <span class="bz-sum-op">=</span>
          <span class="bz-sum-term">
            p = ({Math.round(p()[0])}, {Math.round(p()[1])})
          </span>
        </p>
      </details>
    </Experiment>
  );
}
