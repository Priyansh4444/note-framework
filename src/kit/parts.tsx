import { type Component, type JSX, type ParentComponent, For, Show } from "solid-js";
import { Tex } from "../components/ui/Tex";
import { auditLayout } from "./layout";
export { DisclosureSummary } from "./disclosure";

/** A still figure: a wide panel with a numbered legend. Animated figures use `SceneFrame` instead. */
export const Figure: ParentComponent<{
  n: number;
  caption: JSX.Element;
  narrow?: boolean;
  id?: string;
}> = (props) => (
  <figure class={props.narrow ? "narrow" : undefined} id={props.id ?? `figure-${props.n}`}>
    {props.children}
    <figcaption>
      <span class="n">Fig. {props.n}</span>
      {props.caption}
    </figcaption>
  </figure>
);

/** Text and a directional icon share one spacing rule inside any link or button. */
export const ArrowLabel: ParentComponent<{ direction?: "out" | "right" | "down" }> = (props) => (
  <span class="nk-arrow-label">
    <span class="nk-arrow-text">{props.children}</span>
    <svg
      class="nk-arrow-icon"
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
    >
      <path
        d={
          props.direction === "down"
            ? "M8 3v10m-4-4 4 4 4-4"
            : props.direction === "right"
              ? "M3 8h10M9 4l4 4-4 4"
              : "M4 12 12 4M4 4h8v8"
        }
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
);

/**
 * Predict, then open. The answer says why, not just what.
 * Marker and label boxes are one question line tall, so all three share a top edge.
 */
export const Check: ParentComponent<{ q: JSX.Element; label?: string }> = (props) => (
  <details class="nk-check">
    {/* Selecting the question's text is reading, not answering: a drag-selection does not toggle. */}
    <summary
      {...auditLayout({ align: "y-start", count: 3 })}
      onClick={(e) => {
        if (
          e.detail > 0 &&
          !getSelection()?.isCollapsed &&
          e.currentTarget.contains(getSelection()!.anchorNode)
        )
          e.preventDefault();
      }}
    >
      <span class="nk-check-mark" aria-hidden="true" />
      <span class="nk-check-label">
        <span class="nk-check-k">{props.label ?? "Check"}</span>
      </span>
      <span class="nk-check-q">{props.q}</span>
    </summary>
    <div class="nk-check-a">{props.children}</div>
  </details>
);

/** A table of facts or numbers. Numeric columns line up by place value. */
export const Table: Component<{ head: JSX.Element[]; rows: JSX.Element[][]; numeric?: boolean }> = (
  props,
) => (
  <div class="nk-table">
    <table class="grid-table" classList={{ "nk-numeric": props.numeric }}>
      <thead>
        <tr>
          <For each={props.head}>{(h) => <th>{h}</th>}</For>
        </tr>
      </thead>
      <tbody>
        <For each={props.rows}>
          {(r) => (
            <tr>
              <For each={r}>{(c) => <td>{c}</td>}</For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
);

/**
 * A displayed equation with an optional label and note. `phone` is the same mathematics
 * broken onto more lines, shown on narrow screens so nothing scrolls sideways.
 */
export const Equation: ParentComponent<{ tex: string; phone?: string; label?: JSX.Element }> = (
  props,
) => (
  <div class="nk-equation">
    <Show when={props.label}>
      <span class="label">{props.label}</span>
    </Show>
    <Show when={props.phone} fallback={<Tex tex={props.tex} display />}>
      <span class="nk-eq-wide">
        <Tex tex={props.tex} display />
      </span>
      <span class="nk-eq-narrow">
        <Tex tex={props.phone!} display />
      </span>
    </Show>
    <Show when={props.children}>
      <small>{props.children}</small>
    </Show>
  </div>
);

/** A derivation, one step per row: left side, relation and right side, and the reason in words. */
export const Steps: Component<{
  label?: JSX.Element;
  rows: readonly (readonly [lhs: string, rhs: string, why?: JSX.Element])[];
}> = (props) => (
  <div class="nk-equation nk-steps">
    <Show when={props.label}>
      <span class="label">{props.label}</span>
    </Show>
    <div class="nk-steps-grid">
      <For each={props.rows}>
        {([lhs, rhs, why]) => (
          <>
            <span class="nk-steps-lhs">
              <Show when={lhs}>
                <Tex tex={`\\displaystyle ${lhs}`} />
              </Show>
            </span>
            <span class="nk-steps-rhs">
              {/* A row with a left side states "= rhs"; a row without one continues the line above. */}
              <Tex tex={`\\displaystyle ${lhs ? "{}=" : ""}${rhs}`} />
            </span>
            <span class="nk-steps-why">{why}</span>
          </>
        )}
      </For>
    </div>
  </div>
);

/** A setup, one statement per row: what the line does, the math, and why it holds. */
export const Model: Component<{
  title: string;
  rows: readonly (readonly [role: string, tex: string, why: JSX.Element])[];
}> = (props) => (
  <div class="nk-model" role="group" aria-label={props.title}>
    <div class="label">{props.title}</div>
    <dl>
      <For each={props.rows}>
        {([role, tex, why]) => (
          <div class="nk-model-row">
            <dt>{role}</dt>
            <dd class="nk-model-math">
              <Tex tex={tex} />
            </dd>
            <dd class="nk-model-why">{why}</dd>
          </div>
        )}
      </For>
    </dl>
  </div>
);
