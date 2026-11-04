import { type JSX, createSignal } from "solid-js";
import "./marks.css";
import { useDiagram } from "./DiagramViewer";

export type Point = readonly [number, number];

export type HandleProps = {
  x: number;
  y: number;
  /** Accessible name, e.g. "Control point P₁". */
  label: string;
  /** Spoken value, e.g. "(120, 80)" or "t = 0.42". */
  value: string;
  /** For one-dimensional handles: the numeric value and its range. */
  now?: number;
  min?: number;
  max?: number;
  /** Receives the dragged position in SVG units, keeping the grab offset. Constrain it here. */
  onDrag: (p: Point) => void;
  /** Called once before a drag or key move: pause the scene here. */
  onGrab?: () => void;
  /** Arrow keys: unit direction, ×5 with Shift. Defaults to moving 4 SVG units. */
  onStep?: (dx: number, dy: number, big: boolean) => void;
  /** Home and End, for one-dimensional handles. */
  onLimit?: (end: 0 | 1) => void;
  /** CSS class for colour, e.g. "nk-blue". */
  class?: string;
  /** A hollow bar distinguishes a parameter grip from plotted point data. */
  mark?: "dot" | "bar";
  style?: JSX.CSSProperties;
  /** Drawn inside the handle, e.g. a label positioned away from the curve. */
  children?: JSX.Element;
};

const KEYS: Record<string, Point> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** A draggable SVG point: pointer capture, keyboard steps, 44px target and press feedback. */
export function Handle(props: HandleProps) {
  const { u } = useDiagram();
  const [dragging, setDragging] = createSignal<{ id: number; dx: number; dy: number }>();
  const local = (event: PointerEvent): Point | undefined => {
    const m = (event.currentTarget as SVGGraphicsElement).ownerSVGElement?.getScreenCTM();
    if (!m || m.a * m.d - m.b * m.c === 0) return;
    const q = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const end = (el: Element) => {
    const d = dragging();
    if (!d) return;
    setDragging();
    if (el.hasPointerCapture(d.id)) el.releasePointerCapture(d.id);
  };
  return (
    <g
      class={`nk-handle ${props.class ?? ""}`}
      style={props.style}
      tabIndex={0}
      role="slider"
      aria-label={props.label}
      aria-valuetext={props.value}
      aria-valuenow={props.now}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      data-dragging={dragging() ? "" : undefined}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || dragging()) return;
        const q = local(event);
        if (!q) return;
        props.onGrab?.();
        setDragging({ id: event.pointerId, dx: q[0] - props.x, dy: q[1] - props.y });
        const el = event.currentTarget;
        el.setPointerCapture(event.pointerId);
        el.focus({ preventScroll: true });
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const d = dragging();
        if (d?.id !== event.pointerId) return;
        const q = local(event);
        if (q) props.onDrag([q[0] - d.dx, q[1] - d.dy]);
      }}
      onPointerUp={(event) => end(event.currentTarget)}
      onPointerCancel={(event) => end(event.currentTarget)}
      onLostPointerCapture={(event) => end(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Escape") return end(event.currentTarget);
        if (props.onLimit && (event.key === "Home" || event.key === "End")) {
          event.preventDefault();
          props.onGrab?.();
          return props.onLimit(event.key === "End" ? 1 : 0);
        }
        const k = KEYS[event.key];
        if (!k) return;
        event.preventDefault();
        end(event.currentTarget);
        props.onGrab?.();
        if (props.onStep) props.onStep(k[0], k[1], event.shiftKey);
        else {
          const d = event.shiftKey ? 20 : 4;
          props.onDrag([props.x + k[0] * d, props.y + k[1] * d]);
        }
      }}
    >
      <circle class="nk-handle-hit" cx={props.x} cy={props.y} />
      <circle class="nk-handle-halo" cx={props.x} cy={props.y} />
      {props.mark === "bar" ? (
        <path
          data-handle-mark="bar"
          d={`M${props.x - 9 * u()} ${props.y - 3 * u()}h${6 * u()}v${2 * u()}h${6 * u()}v${-2 * u()}h${6 * u()}v${6 * u()}h${-18 * u()}Z`}
          fill="var(--bg)"
          stroke="var(--role, var(--bright))"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
      ) : (
        <circle class="nk-handle-dot" cx={props.x} cy={props.y} />
      )}
      {props.children}
    </g>
  );
}
