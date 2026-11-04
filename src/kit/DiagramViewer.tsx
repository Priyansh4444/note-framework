import {
  type Accessor,
  type ParentComponent,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import "./reader.css";

type Bounds = readonly [number, number, number, number];

const Units = createContext<{ u: Accessor<number>; box: Bounds }>();

/**
 * SVG units per CSS pixel of the enclosing DiagramViewer, and its viewBox. Use it to keep a
 * mark a real screen size or a label inside the figure; 1 outside a viewer.
 */
export const useDiagram = () => useContext(Units) ?? { u: () => 1, box: [0, 0, 0, 0] as Bounds };

/**
 * Owns one SVG root and nothing else: no camera, no second reading mode.
 * It measures SVG units per CSS pixel as `--nk-u`, so `.nk-diagram text` renders
 * at a real screen size (`--nk-label-px`) whatever the figure's width.
 */
export const DiagramViewer: ParentComponent<{ label: string; viewBox: Bounds }> = (props) => {
  const bounds = createMemo(() => {
    const box = props.viewBox;
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
      throw new Error("DiagramViewer needs a finite viewBox with positive width and height.");
    return box;
  });
  let svg!: SVGSVGElement;
  const [u, setU] = createSignal(1);
  onMount(() => {
    const measure = () => {
      const shown = svg.getBoundingClientRect().width;
      if (shown > 0) {
        svg.style.setProperty("--nk-u", String(bounds()[2] / shown));
        setU(bounds()[2] / shown);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    onCleanup(() => observer.disconnect());
  });
  return (
    <svg
      ref={svg}
      class="nk-diagram"
      viewBox={bounds().join(" ")}
      role="img"
      aria-label={props.label}
    >
      <Units.Provider
        value={{
          u,
          get box() {
            return bounds();
          },
        }}
      >
        {props.children}
      </Units.Provider>
    </svg>
  );
};
