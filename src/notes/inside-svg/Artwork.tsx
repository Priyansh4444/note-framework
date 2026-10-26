import { createUniqueId, For } from "solid-js";
import { opening, orderFor, shapes, type LayerId } from "./model";

export function Shape(props: { id: LayerId }) {
  const shape = shapes.find((s) => s.id === props.id)!;
  const common = { "data-layer": shape.id, class: `svg-shape svg-${shape.id}` };
  if (shape.kind === "rect")
    return <rect {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height} />;
  if (shape.kind === "circle")
    return <circle {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />;
  return <path {...common} d={shape.d} fill-rule="evenodd" />;
}

export function Artwork(props: {
  sunFront?: boolean;
  offset?: number;
  inspection?: boolean;
  label: string;
}) {
  const clipId = `arch-${createUniqueId()}`;
  // Solid's keyed For moves retained groups when their stable string IDs reorder.
  return (
    <svg viewBox="0 0 300 260" class="svg-artwork" role="img" aria-label={props.label}>
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={opening} transform={`translate(${props.offset ?? 0} 0)`} />
        </clipPath>
      </defs>
      <g data-scenery clip-path={props.inspection ? undefined : `url(#${clipId})`}>
        <For each={orderFor(!!props.sunFront).filter((id) => id !== "frame")}>
          {(id) => (
            <g data-painted-layer={id}>
              <Shape id={id} />
            </g>
          )}
        </For>
      </g>
      <g data-painted-layer="frame" transform={`translate(${props.offset ?? 0} 0)`}>
        <Shape id="frame" />
      </g>
    </svg>
  );
}
