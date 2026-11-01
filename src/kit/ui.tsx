import {
  type JSX,
  Show,
  type ParentProps,
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { DisclosureSummary } from "./disclosure";
import { glide, jump, resize } from "./motion";
import "./ui.css";

/**
 * Figure and page controls. Each one brings its own style and motion, so a note
 * composes them and writes CSS only for its own diagram colours.
 */

/** A quiet text button. `pressed` makes it a toggle. */
export function Action(
  props: ParentProps<{ onClick: () => void; disabled?: boolean; pressed?: boolean }>,
) {
  return (
    <button
      type="button"
      class="nk-action"
      disabled={props.disabled}
      aria-pressed={props.pressed}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

export type ChoiceOption<T extends string> = { id: T; label: string };

/**
 * One of several, as a segmented control. The selection indicator springs between
 * options and is interruptible; arrow keys move and select. `value` may match none.
 */
export function Choice<T extends string>(props: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | undefined;
  onChange: (id: T) => void;
}) {
  let root!: HTMLDivElement;
  let mark!: HTMLSpanElement;
  const buttons: HTMLButtonElement[] = [];
  const index = () => props.options.findIndex((o) => o.id === props.value);
  const place = (animate: boolean) => {
    const move = animate ? glide : jump;
    const b = buttons[index()];
    if (!b) return void move(mark, { opacity: 0 });
    const box = { x: b.offsetLeft, y: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight };
    // From nothing, appear in place; between options, travel.
    if (mark.style.opacity === "0") jump(mark, box);
    else move(mark, box);
    move(mark, { opacity: 1 });
  };
  onMount(() => {
    place(false);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(index, () => place(true), { defer: true }));
  const pick = (i: number) => {
    const n = props.options.length;
    const j = (i + n) % n;
    props.onChange(props.options[j].id);
    buttons[j]?.focus();
  };
  return (
    <div ref={root} class="nk-choice" role="radiogroup" aria-label={props.label}>
      <span ref={mark} class="nk-choice-mark" aria-hidden="true" style={{ opacity: 0 }} />
      <For each={props.options}>
        {(option, i) => (
          <button
            ref={(el) => (buttons[i()] = el)}
            type="button"
            role="radio"
            aria-checked={option.id === props.value}
            tabIndex={option.id === props.value || (index() < 0 && i() === 0) ? 0 : -1}
            onClick={() => props.onChange(option.id)}
            onKeyDown={(event) => {
              const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
              if (step === undefined && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              pick(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? props.options.length - 1
                    : i() + step!,
              );
            }}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * Panels behind a Choice. Every panel stays mounted (state and SVG nodes persist); switching
 * springs the box to the new height and settles the new panel in.
 */
export function Panels<T extends string>(props: {
  value: T;
  ids: readonly T[];
  children: (id: T) => JSX.Element;
}) {
  let box!: HTMLDivElement;
  const [shown, setShown] = createSignal(props.value);
  createEffect(
    on(
      () => props.value,
      (value) => {
        resize(box, () => setShown(() => value));
        const panel = box.querySelector(`:scope > [data-panel="${value}"]`);
        if (panel) glide(panel, { opacity: [0, 1], y: [6, 0] });
      },
      { defer: true },
    ),
  );
  return (
    <div ref={box} class="nk-panels">
      <For each={props.ids}>
        {(id) => (
          <div data-panel={id} hidden={shown() !== id}>
            {props.children(id)}
          </div>
        )}
      </For>
    </div>
  );
}

/** Reasoning kept within reach: a native disclosure with the kit's marker and reveal. */
export function More(props: ParentProps<{ summary: JSX.Element; id?: string }>) {
  return (
    <details class="nk-more" id={props.id}>
      <DisclosureSummary>{props.summary}</DisclosureSummary>
      {props.children}
    </details>
  );
}

/** Live numbers under a figure. Put values in <b>. Announces only when `quiet` is false. */
export function Readout(props: ParentProps<{ quiet?: boolean }>) {
  return (
    <p class="nk-readout" aria-live={props.quiet ? "off" : "polite"}>
      {props.children}
    </p>
  );
}

export type LegendItem = { label: JSX.Element; class: string; mark?: "line" | "dash" | "dot" };

/** A key for a figure's marks, using the same colour classes as the marks. */
export function Legend(props: { items: readonly LegendItem[] }) {
  return (
    <p class="nk-legend">
      <For each={props.items}>
        {(item) => (
          <span class={item.class}>
            <i data-mark={item.mark ?? "line"} aria-hidden="true" />
            {item.label}
          </span>
        )}
      </For>
    </p>
  );
}

/** A control row. `end` groups trailing actions so they wrap together, flush right. */
export function Toolbar(props: ParentProps<{ end?: JSX.Element }>) {
  return (
    <div class="nk-toolbar">
      {props.children}
      <Show when={props.end}>
        <span class="nk-toolbar-end">{props.end}</span>
      </Show>
    </div>
  );
}
