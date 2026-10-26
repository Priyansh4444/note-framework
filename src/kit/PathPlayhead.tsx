import { playheadPath, type Rail } from "./timeline-model";

/** A line on the rail, with its logical cursor available to geometry inspection. */
export function PathPlayhead(props: { rail: Rail; distance: number; class: string }) {
  const point = () => props.rail.pointAt(props.distance);
  const path = () => playheadPath(props.rail, props.distance);
  return (
    <>
      <path
        class={`${props.class}-focus`}
        d={path()}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      />
      <path
        class={props.class}
        d={path()}
        fill="none"
        stroke="var(--diagram-blue, #87c5d1)"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
        data-distance={props.distance}
        data-center-x={point().x}
        data-center-y={point().y}
      />
    </>
  );
}
