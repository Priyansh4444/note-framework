import {
  DiagramViewer,
  Experiment,
  Handle,
  More,
  Readout,
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
  const scene = createScene([{ label: "A to B", ms: 6000 }]);
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.3 });
  const t = playback.value;
  const p = () => mix(A, B, t());
  // Project a dragged position onto the segment; the scene stays the only owner of t.
  const along = (q: readonly [number, number]) => {
    const dx = B[0] - A[0],
      dy = B[1] - A[1];
    return ((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / (dx * dx + dy * dy);
  };
  return (
    <Experiment
      timeline="Mix playback"
      scene={scene}
      question="Slide the dot from one end to the other."
      caption={
        <>
          Each piece takes the colour of the end across from it: its length is that end’s weight, so
          the nearer end pulls harder.
        </>
      }
      details={
        <More summary="Read the weights and coordinates">
          <p>
            Lengths are fractions of the whole segment. The blue piece, from A to p, has length{" "}
            <Tex tex="t" />: B’s weight. The orange piece has length <Tex tex="1-t" />: A’s weight.
          </p>
          <Readout quiet={scene.playing()}>
            <span class="nk-orange">
              <b>{f2(1 - t())}</b> × A
            </span>
            <i>+</i>
            <span class="nk-blue">
              <b>{f2(t())}</b> × B
            </span>
            <i>=</i>
            <span>
              p = ({Math.round(p()[0])}, {Math.round(p()[1])})
            </span>
          </Readout>
        </More>
      }
    >
      <DiagramViewer
        viewBox={[40, 20, 480, 150]}
        label={`A segment from A to B with the mixed point ${f2(t())} of the way along.`}
      >
        <line class="nk-curve nk-blue" x1={A[0]} y1={A[1]} x2={p()[0]} y2={p()[1]} />
        <line class="nk-curve nk-orange" x1={p()[0]} y1={p()[1]} x2={B[0]} y2={B[1]} />
        <circle class="nk-point nk-orange" cx={A[0]} cy={A[1]} />
        <circle class="nk-point nk-blue" cx={B[0]} cy={B[1]} />
        <text class="nk-label nk-orange" x={A[0]} y={A[1]} dy="1.6em" text-anchor="middle">
          A
        </text>
        <text class="nk-label nk-blue" x={B[0]} y={B[1]} dy="1.6em" text-anchor="middle">
          B
        </text>
        <Handle
          x={p()[0]}
          y={p()[1]}
          label="Mixed point p"
          value={`t = ${f2(t())}`}
          now={t()}
          min={0}
          max={1}
          onGrab={playback.pause}
          onDrag={(q) => playback.seek(along(q))}
          onStep={(dx, dy, big) => playback.seek(t() + (dx || -dy) * (big ? 0.1 : 0.01))}
          onLimit={(end) => playback.seek(end)}
        >
          <text
            class="nk-label nk-label-strong"
            x={p()[0]}
            y={p()[1]}
            dy="-1.1em"
            text-anchor="middle"
          >
            p
          </text>
        </Handle>
      </DiagramViewer>
    </Experiment>
  );
}
