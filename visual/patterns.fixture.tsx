import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import {
  LayerFigure,
  MorphFigure,
  InkFigure,
  brushStroke,
  type MorphShape,
  type FigureLayer,
  type InkScene,
} from "../src/kit";
export function mountPatterns() {
  const root = document.createElement("main");
  root.style.cssText = "max-width:680px;margin:0 auto;padding:20px;color:var(--text)";
  document.body.replaceChildren(root);
  const [customLayers, setLayers] = createSignal<FigureLayer[]>();
  const [value, setValue] = createSignal("a"),
    [delta, setDelta] = createSignal(0),
    [shown, setShown] = createSignal(true);
  const shapes = (): MorphShape[] => [
    {
      id: "a",
      label: "Left",
      contours: [
        [
          [60 + delta(), 60],
          [160 + delta(), 60],
          [160 + delta(), 160],
          [60 + delta(), 160],
        ],
      ],
    },
    {
      id: "b",
      label: "Right",
      filled: false,
      contours: [
        [
          [260, 80],
          [360, 80],
          [360, 180],
          [260, 180],
        ],
      ],
    },
  ];
  const layers = (): FigureLayer[] =>
    customLayers() ?? [
      { id: "a", label: "Guide", paths: [{ d: `M40 ${40 + delta()}L300 40L300 180` }] },
      { id: "b", label: "Curve", paths: [{ d: "M40 180Q180 0 300 180" }] },
    ];
  const scenes = (): InkScene[] => [
    {
      id: "a",
      label: "Low",
      marks: brushStroke(
        [
          [40, 80 + delta()],
          [360, 80 + delta()],
        ],
        { count: 40 },
      ),
    },
    {
      id: "b",
      label: "High",
      marks: brushStroke(
        [
          [40, 180],
          [360, 180],
        ],
        { count: 40 },
      ),
    },
  ];
  const dispose = render(
    () => (
      <>
        <button id="external" onClick={() => setValue(value() === "a" ? "b" : "a")}>
          External selection
        </button>
        <button id="geometry" onClick={() => setDelta((v) => v + 10)}>
          Move source geometry
        </button>
        <button id="remove" onClick={() => setShown(false)}>
          Remove
        </button>
        <Show when={shown()}>
          <MorphFigure
            shapes={shapes()}
            value={value()}
            onChange={setValue}
            label="Custom contours"
            viewBox={[0, 0, 400, 240]}
          />
          <LayerFigure
            layers={layers()}
            value={value()}
            onChange={setValue}
            label="Custom sheets"
            viewBox={[0, 0, 400, 240]}
          />
          <InkFigure
            scenes={scenes()}
            value={value()}
            onChange={setValue}
            label="Custom bristles"
            viewBox={[0, 0, 400, 240]}
          />
        </Show>
      </>
    ),
    root,
  );
  Object.assign(window, { patternsFixture: { setValue, setDelta, setShown, setLayers, dispose } });
}
