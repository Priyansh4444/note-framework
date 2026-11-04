import { render } from "solid-js/web";
import { createScene, Experiment } from "../src/kit";

export function mountCurveTimelineFixture() {
  const root = document.createElement("main");
  root.className = "nk-note";
  root.style.cssText = "width:min(760px,calc(100% - 40px));margin:20px auto;padding:0";
  document.body.replaceChildren(root);
  render(() => {
    const scene = createScene([
      { label: "Near start", ms: 1800 },
      { label: "Middle mixes", ms: 2400 },
      { label: "Near end", ms: 1800 },
    ]);
    scene.seek(3000);
    return (
      <Experiment
        scene={scene}
        timeline="Scene position"
        question="Follow the same scene clock"
        controls={<span>One seekable picture</span>}
        caption="Drag the blue line along the curve, or choose a checkpoint."
      >
        <svg
          viewBox="0 0 400 120"
          style={{ width: "100%", display: "block" }}
          aria-label="Seekable picture"
        >
          <path d="M20 90 Q200 0 380 90" fill="none" stroke="var(--rule-strong)" />
          <line
            x1={20 + (360 * scene.t()) / scene.length}
            x2={20 + (360 * scene.t()) / scene.length}
            y1="30"
            y2="90"
            stroke="var(--diagram-blue)"
          />
        </svg>
      </Experiment>
    );
  }, root);
}
