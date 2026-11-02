import { render } from "solid-js/web";
import { createScene, type Scene } from "../src/post/scene/clock";
import { Experiment } from "../src/kit/Experiment";
import type { CuePlan } from "../src/kit/scene-audio";

let scene: Scene | undefined;
let dispose: (() => void) | undefined;
export const seekAudioFixture = (ms: number) => scene?.seek(ms);
export const disposeAudioFixture = () => {
  dispose?.();
  dispose = undefined;
};
const plan: CuePlan = {
  events: [
    { id: "landing", atMs: 100, cue: "ready" },
    { id: "contact", atMs: 250, cue: "contact" },
    { id: "dispatch", atMs: 500, cue: "send" },
    { id: "session", atMs: 900, cue: "appear" },
    { id: "finish", atMs: 1500, cue: "complete" },
    { id: "shared", atMs: 1500, cue: "complete" },
    { id: "second-contact", atMs: 2200, cue: "contact" },
    { id: "second-send", atMs: 2500, cue: "send" },
    { id: "second-finish", atMs: 3500, cue: "complete" },
  ],
  flights: [
    { startMs: 500, endMs: 900 },
    { startMs: 2500, endMs: 2900 },
  ],
};
export function mountSceneAudioFixture() {
  disposeAudioFixture();
  const root = document.createElement("main");
  root.className = "nk-note";
  root.style.cssText = "width:min(760px,calc(100% - 40px));margin:20px auto;padding:0";
  document.body.replaceChildren(root);
  dispose = render(() => {
    scene = createScene([
      { label: "First request", ms: 2000 },
      { label: "Second request", ms: 2000 },
    ]);
    return (
      <>
        <Experiment
          scene={scene}
          timeline="Request time"
          sound={plan}
          question="Watch and hear one scene"
          caption="Original quiet synthesis; sound starts off."
        >
          <svg
            viewBox="0 0 500 180"
            style={{ width: "100%", display: "block" }}
            aria-label="Request flight"
          >
            <path d="M30 90H470" stroke="var(--rule-strong)" />
            <line
              x1={30 + (440 * scene.t()) / scene.length}
              x2={30 + (440 * scene.t()) / scene.length}
              y1="60"
              y2="120"
              stroke="var(--diagram-blue)"
              stroke-width="3"
            />
          </svg>
        </Experiment>
        <div style={{ height: "1800px" }} aria-hidden="true" />
      </>
    );
  }, root);
}
