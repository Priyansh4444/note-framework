import { For } from "solid-js";
import type { Cubic, Point } from "./model";

export const ROLE = ["p0", "p1", "p2", "p3"] as const;
export const NAME = ["P₀", "P₁", "P₂", "P₃"] as const;
const STEP = 4,
  BIG = 20;

/**
 * Four draggable control points. Pointer drags map through the SVG's own transform;
 * arrow keys move a focused point (Shift for larger steps). The hit area keeps a
 * 44px screen size at any figure width.
 */
export function Handles(props: {
  points: Cubic;
  onMove: (i: number, q: Point) => void;
  onGrab?: () => void;
  labels?: boolean;
  dim?: (i: number) => number;
}) {
  let drag: { i: number; id: number } | undefined;
  const local = (event: PointerEvent): Point | undefined => {
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!m) return;
    const q = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  const down = (i: number) => (event: PointerEvent) => {
    if (event.button !== 0) return;
    props.onGrab?.();
    drag = { i, id: event.pointerId };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const q = local(event);
    if (q) props.onMove(drag.i, q);
  };
  const up = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) drag = undefined;
  };
  const key = (i: number) => (event: KeyboardEvent) => {
    const d = event.shiftKey ? BIG : STEP;
    const delta = (
      { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<
        string,
        [number, number]
      >
    )[event.key];
    if (!delta) return;
    event.preventDefault();
    props.onGrab?.();
    const p = props.points[i];
    props.onMove(i, [p[0] + delta[0], p[1] + delta[1]]);
  };
  return (
    <For each={[0, 1, 2, 3]}>
      {(i) => {
        const p = () => props.points[i];
        // Put the label on the side away from the curve: opposite the neighbouring control points.
        const away = () => {
          const ps = props.points,
            q = p();
          const near = i === 0 ? [ps[1]] : i === 3 ? [ps[2]] : [ps[i - 1], ps[i + 1]];
          let dx = 0,
            dy = 0;
          for (const n of near) {
            const l = Math.hypot(n[0] - q[0], n[1] - q[1]) || 1;
            dx += (q[0] - n[0]) / l;
            dy += (q[1] - n[1]) / l;
          }
          const l = Math.hypot(dx, dy);
          return l < 1e-6 ? [0, -1] : [dx / l, dy / l];
        };
        return (
          <g
            class={`bz-handle bz-${ROLE[i]}`}
            tabIndex={0}
            role="slider"
            aria-label={`Control point ${NAME[i]}, x ${p()[0]}, y ${p()[1]}. Arrow keys move it.`}
            aria-valuetext={`(${p()[0]}, ${p()[1]})`}
            style={{ opacity: props.dim?.(i) ?? 1 }}
            onPointerDown={down(i)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={key(i)}
          >
            <circle class="bz-hit" cx={p()[0]} cy={p()[1]} r="22" />
            <circle class="bz-dot" cx={p()[0]} cy={p()[1]} r="7" />
            {props.labels !== false && (
              <text
                class="bz-label"
                x={p()[0]}
                y={p()[1]}
                dx={`${away()[0] * 1.3}em`}
                dy={`${away()[1] * 1.3 + 0.35}em`}
                text-anchor="middle"
              >
                P<tspan dx="0.04em">{i}</tspan>
              </text>
            )}
          </g>
        );
      }}
    </For>
  );
}
