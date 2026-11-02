import { batch, createSignal, onMount } from "solid-js";
import { Action, Choice, Toolbar, createScene, createPlayback, Experiment } from "../../../kit";
import { CurveScene } from "../bezier/CurveScene";
import { PRESETS } from "../bezier/model";
import {
  moved,
  movePoint,
  points,
  resetPoints,
  selectPreset,
  selectedPreset,
} from "../bezier/store";

export function Construction() {
  // One beat, named for what happens in it: t sweeps and every row of mixes moves together.
  const scene = createScene([{ label: "Sweep t", ms: 6000 }]);
  // The full range: B(t) draws under the handles, so P₀ and P₃ stay visible at the ends.
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.5 });
  const tNow = playback.value;
  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) scene.seek(scene.length);
  });
  const [guides, setGuides] = createSignal(true);
  const take = playback.pause;
  const shown = () => (guides() ? 1 : 0);
  return (
    <Experiment
      timeline="Curve playback"
      id="construction"
      scene={scene}
      question="Can you bend the curve without moving its ends?"
      controls={
        <Toolbar
          end={
            <>
              <Action
                pressed={guides()}
                onClick={() => {
                  take();
                  setGuides(!guides());
                }}
              >
                Guide lines
              </Action>
              <Action
                disabled={!moved()}
                onClick={() => {
                  take();
                  resetPoints();
                }}
              >
                Reset
              </Action>
            </>
          }
        >
          <Choice
            label="Curve shape"
            options={PRESETS}
            value={selectedPreset()}
            onChange={(id) =>
              batch(() => {
                take();
                selectPreset(id);
              })
            }
          />
        </Toolbar>
      }
      caption={
        <>Drag a coloured dot, or focus it and use the arrow keys. Shift makes larger moves.</>
      }
    >
      <CurveScene
        points={points()}
        t={tNow()}
        drawn={1}
        ghost
        labels
        counts={guides()}
        levels={[shown(), shown(), 1]}
        onMove={movePoint}
        onGrab={take}
        label={`A smooth curve held by four coloured dots. The white dot uses parameter t = ${tNow().toFixed(2)} on the complete curve.`}
      />
    </Experiment>
  );
}
