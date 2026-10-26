import { batch, createSignal, For, onMount } from "solid-js";
import { DisclosureSummary, createScene, createPlayback, Experiment } from "../../../kit";
import { CurveScene } from "../bezier/CurveScene";
import { pointAt, PRESETS } from "../bezier/model";
import {
  moved,
  movePoint,
  points,
  resetPoints,
  selectPreset,
  selectedPreset,
} from "../bezier/store";

export function Construction() {
  const scene = createScene([
    { label: "Near start", ms: 1800 },
    { label: "Middle mixes", ms: 2400 },
    { label: "Near end", ms: 1800 },
  ]);
  const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.5 });
  const tNow = playback.value;
  onMount(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) scene.seek(scene.length);
  });
  const [showGuides, setShowGuides] = createSignal(false);
  const guides = showGuides;
  const take = playback.pause;
  const b = () => pointAt(points(), tNow());
  return (
    <Experiment
      timeline="Curve playback"
      id="construction"
      scene={scene}
      question="Drag a coloured dot to bend the line."
      details={
        <details class="bz-numbers">
          <DisclosureSummary>See the position numbers</DisclosureSummary>
          <p class="bz-readout" aria-live={scene.playing() ? "off" : "polite"}>
            <span>
              t = <b>{tNow().toFixed(2)}</b>
            </span>
            <span>
              B(t) = (<b>{Math.round(b()[0])}</b>, <b>{Math.round(b()[1])}</b>)
            </span>
          </p>
        </details>
      }
      controls={
        <>
          <div class="bz-presets" role="group" aria-label="Curve shape">
            <span>Try a shape</span>
            <For each={PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  aria-pressed={selectedPreset() === preset.id}
                  onClick={() =>
                    batch(() => {
                      take();
                      selectPreset(preset.id);
                    })
                  }
                >
                  {preset.label}
                </button>
              )}
            </For>
          </div>
          <div class="bz-simple-actions">
            <button
              type="button"
              class="bz-reset"
              aria-pressed={guides()}
              onClick={() => {
                const next = !guides();
                take();
                setShowGuides(next);
              }}
            >
              {guides() ? "Hide the guide lines" : "Show the guide lines"}
            </button>
            <button
              type="button"
              class="bz-reset"
              disabled={!moved()}
              onClick={() => {
                take();
                resetPoints();
              }}
            >
              Reset shape
            </button>
          </div>
        </>
      }
      caption={
        <>
          Choose a shape or make your own. Use arrow keys on a coloured dot for small moves; Shift
          makes bigger moves.
        </>
      }
    >
      <CurveScene
        points={points()}
        t={tNow()}
        drawn={tNow()}
        ghost
        labels
        levels={[guides() ? 1 : 0, guides() ? 1 : 0, 1]}
        onMove={movePoint}
        onGrab={take}
        label={`A smooth curve held by four coloured dots. The white dot is ${Math.round(tNow() * 100)} percent of the way through drawing it.`}
      />
      <ol hidden={!guides()} class="bz-chain" aria-label="Points at each level">
        {["starting dots", "", "", "one final dot"].map((text, i) => (
          <li
            data-active=""
            aria-label={`${4 - i} ${i === 0 ? "control points" : i === 3 ? "point: B(t)" : "mixed points"}`}
          >
            <span class="bz-chain-n">{4 - i}</span>
            {text}
          </li>
        ))}
      </ol>
    </Experiment>
  );
}
