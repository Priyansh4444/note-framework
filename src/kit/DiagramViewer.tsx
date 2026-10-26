import { type ParentComponent, onCleanup, onMount } from "solid-js";
import "./reader.css";

type Bounds = readonly [number, number, number, number];

/**
 * Owns one SVG root and nothing else: no camera, no second reading mode.
 * It measures SVG units per CSS pixel as `--nk-u`, so `.nk-diagram text` renders
 * at a real screen size (`--nk-label-px`) whatever the figure's width.
 */
export const DiagramViewer: ParentComponent<{ label: string; viewBox: Bounds }> = (props) => {
  const [x, y, width, height] = props.viewBox;
  if (
    props.viewBox.length !== 4 ||
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("DiagramViewer needs a finite viewBox with positive width and height.");
  }
  let svg!: SVGSVGElement;
  onMount(() => {
    const measure = () => {
      const shown = svg.getBoundingClientRect().width;
      if (shown > 0) svg.style.setProperty("--nk-u", String(width / shown));
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
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label={props.label}
    >
      {props.children}
    </svg>
  );
};
