import { type Component, For, createSignal } from "solid-js";
import {
  Parameter,
  SceneFrame,
  DiagramViewer,
  auditLayout,
  createScene,
  enter,
  tip,
} from "../../../kit";

import { SLOTS, FILLED, TARGET, letters } from "../examples/selection";
const x = (k: number) => 66 + (k % 4) * 76;
const y = (k: number) => 40 + Math.floor(k / 4) * 78;

/** Persistent nodes, one clock. Rows wrap a single illustrative array for phone readability. */
export const FillFigure: Component<{ n: number }> = (props) => {
  const [index, setIndex] = createSignal(TARGET);
  const scene = createScene([
    { label: "Start with sixteen places", ms: 1200 },
    { label: "Put nine letters in order", ms: 2600 },
    { label: "Select a slot", ms: 1600 },
  ]);
  const fill = (k: number) => (k < FILLED ? enter(scene, 1, k * 160, "fill") : 0);
  const selected = () => enter(scene, 2, 150, "settle");
  const choose = (next: number) => {
    // Finish construction before applying a discrete selection; keep one clock.
    scene.pause();
    scene.seek(scene.length);
    setIndex(next);
  };
  const readout = () =>
    scene.beat() < 0
      ? ""
      : [
          "Each number identifies one slot, starting at zero.",
          "Add A through I in order. The unused slots stay empty.",
          index() < FILLED
            ? `Slot ${index()} contains ${letters[index()]}: item ${index() + 1} in order. Indices start at zero.`
            : `Slot ${index()} is empty. Only slots 0 through ${FILLED - 1} hold letters.`,
        ][scene.beat()];
  return (
    <div class="starter-figure">
      <Parameter label="Index" value={index()} min={0} max={SLOTS - 1} step={1} onInput={choose} />
      <SceneFrame
        scene={scene}
        n={props.n}
        label="Show the example"
        caption={
          <>
            Filled squares hold letters; open squares are empty. Rows wrap one array. Change Index
            to finish construction and select a slot.
          </>
        }
      >
        <div>
          <DiagramViewer
            viewBox={[0, 0, 360, 336]}
            label={`Sixteen numbered slots. Nine hold A through I; selected index ${index()}.`}
          >
            <For each={[0, 1, 2, 3]}>
              {(row) => (
                <g {...auditLayout({ align: "y-start", gaps: "x", count: 4 })}>
                  <For each={Array.from({ length: SLOTS / 4 }, (_, col) => row * 4 + col)}>
                    {(k) => (
                      <g
                        tabIndex={0}
                        {...tip(() => (
                          <span>
                            Slot {k}: {k < FILLED ? letters[k] : "empty"}
                          </span>
                        ))}
                      >
                        <rect
                          x={x(k) - 23}
                          y={y(k) - 22}
                          width="46"
                          height="44"
                          rx="4"
                          class="slot"
                        />
                        <rect
                          x={x(k) - 23}
                          y={y(k) - 22}
                          width="46"
                          height="44"
                          rx="4"
                          class="slot-fill"
                          opacity={fill(k)}
                        />
                        <text
                          x={x(k)}
                          y={y(k) + 7}
                          text-anchor="middle"
                          class="slot-value"
                          opacity={fill(k)}
                        >
                          {k < FILLED ? letters[k] : ""}
                        </text>
                        <text x={x(k)} y={y(k) + 47} text-anchor="middle" class="slot-n">
                          {k}
                        </text>
                      </g>
                    )}
                  </For>
                </g>
              )}
            </For>
            <rect
              x={x(index()) - 29}
              y={y(index()) - 28}
              width="58"
              height="56"
              rx="7"
              class="slot-ring"
              opacity={selected()}
            />
          </DiagramViewer>
          <p class="starter-readout" aria-live={scene.playing() ? "off" : "polite"}>
            {readout()}
          </p>
        </div>
      </SceneFrame>
    </div>
  );
};
