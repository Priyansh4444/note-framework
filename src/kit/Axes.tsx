import { type JSX, For, Show } from "solid-js";
import "./marks.css";
import { useDiagram } from "./DiagramViewer";

/** A tick at a position already in SVG units, so linear and log scales share one component. */
export type Tick = { at: number; label: JSX.Element };

/**
 * A chart frame for a DiagramViewer: a solid baseline, faint grid lines at the ticks and their
 * labels. `y0` is the bottom of the plot. Put the data after it so it draws on top.
 */
export function Axes(props: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  x?: readonly Tick[];
  y?: readonly Tick[];
  /** Faint lines across the plot at every tick. */
  grid?: boolean;
  /** How far x labels sit below the baseline, e.g. "2.4em" to clear a grip. */
  xLabelGap?: string;
  /** Axis titles: below the x labels, and above the plot's top-left corner. */
  xTitle?: JSX.Element;
  yTitle?: JSX.Element;
}) {
  const { u } = useDiagram();
  const labelled = () => {
    const ticks = [...(props.y ?? [])].sort((a, b) => a.at - b.at);
    const kept = new Set<number>();
    let last = -Infinity;
    for (const tick of ticks) {
      if (
        tick === ticks[0] ||
        (tick.at - last >= 20 * u() && ticks.at(-1)!.at - tick.at >= 20 * u())
      ) {
        kept.add(tick.at);
        last = tick.at;
      }
    }
    if (ticks.length > 1 && ticks.at(-1)!.at - ticks[0].at >= 20 * u()) kept.add(ticks.at(-1)!.at);
    return kept;
  };
  return (
    <g>
      <line class="nk-axis" x1={props.x0} x2={props.x1} y1={props.y0} y2={props.y0} />
      <For each={props.x ?? []}>
        {(tick) => (
          <>
            <Show when={props.grid}>
              <line
                class="nk-axis"
                opacity="0.5"
                x1={tick.at}
                x2={tick.at}
                y1={props.y1}
                y2={props.y0}
              />
            </Show>
            <text
              class="nk-label"
              x={tick.at}
              y={props.y0}
              dy={props.xLabelGap ?? "1.4em"}
              text-anchor="middle"
            >
              {tick.label}
            </text>
          </>
        )}
      </For>
      <For each={props.y ?? []}>
        {(tick) => (
          <>
            <Show when={props.grid}>
              <line
                class="nk-axis"
                opacity="0.5"
                x1={props.x0}
                x2={props.x1}
                y1={tick.at}
                y2={tick.at}
              />
            </Show>
            <text
              visibility={labelled().has(tick.at) ? "visible" : "hidden"}
              class="nk-label"
              x={props.x0 - 10}
              y={tick.at}
              dy="0.35em"
              text-anchor="end"
            >
              {tick.label}
            </text>
          </>
        )}
      </For>
      <Show when={props.xTitle}>
        <text
          class="nk-label"
          x={(props.x0 + props.x1) / 2}
          y={props.y0}
          dy="2.9em"
          text-anchor="middle"
        >
          {props.xTitle}
        </text>
      </Show>
      <Show when={props.yTitle}>
        <text class="nk-label" x={props.x0} y={props.y1} dy="-0.9em" text-anchor="start">
          {props.yTitle}
        </text>
      </Show>
    </g>
  );
}
