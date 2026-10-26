import { onMount } from "solid-js";
import { createPlayback, createScene, DiagramViewer, Experiment } from "../../kit";

export function Sweep() {
  const scene = createScene([
    { label: "First half", ms: 1800 },
    { label: "Second half", ms: 1800 },
  ]);
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0 });
  const t = playback.value;
  const a = [40, 160],
    b = [200, 20],
    c = [360, 160];
  const mix = (p: number[], q: number[]) => p.map((v, i) => (1 - t()) * v + t() * q[i]);
  const left = () => mix(a, b),
    right = () => mix(b, c);
  const point = () => mix(left(), right());
  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) scene.seek(scene.length);
  });
  return (
    <Experiment
      scene={scene}
      timeline="Curve playback"
      question="Two sliding points make one curved path."
      caption="Both segment mixes use the same fraction. The white point mixes their results. Pause, seek backward, or replay: the construction stays together."
    >
      <DiagramViewer
        viewBox={[0, 0, 400, 200]}
        label={`Two linked segment mixes at ${Math.round(t() * 100)} percent; the white point follows a quadratic curve.`}
      >
        <path
          d="M40 160L200 20L360 160"
          fill="none"
          stroke="var(--diagram-faint)"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <path
          d="M40 160Q200 20 360 160"
          fill="none"
          stroke="var(--rule-strong)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
        <path
          d={`M40 160Q${left()[0]} ${left()[1]} ${point()[0]} ${point()[1]}`}
          fill="none"
          stroke="var(--bright)"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />
        <line
          x1={left()[0]}
          y1={left()[1]}
          x2={right()[0]}
          y2={right()[1]}
          stroke="var(--diagram-blue)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
        <circle cx={left()[0]} cy={left()[1]} r="5" fill="var(--diagram-orange)" />
        <circle cx={right()[0]} cy={right()[1]} r="5" fill="var(--diagram-green)" />
        <circle cx={point()[0]} cy={point()[1]} r="7" fill="var(--bright)" />
      </DiagramViewer>
    </Experiment>
  );
}
