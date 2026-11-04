import { createEffect, createSignal, For, on, onCleanup } from "solid-js";
import "./copy-button.css";

export type CopyResult = "copied" | "selected";
type CopyState = "idle" | "pending" | CopyResult | "error";
const states = ["idle", "pending", "copied", "selected", "error"] as const;

/** Copy owns its operation; this button owns bounded, interruptible UI feedback. */
export function CopyButton(props: {
  label?: string;
  ariaLabel?: string;
  class?: string;
  onCopy: (signal: AbortSignal) => CopyResult | Promise<CopyResult>;
  /** Changing the source invalidates a pending result and clears stale confirmation. */
  resetKey?: unknown;
  errorMessage?: string;
}) {
  const [state, setState] = createSignal<CopyState>("idle");
  const [pointer, setPointer] = createSignal(false);
  let revision = 0;
  let operation: AbortController | undefined;
  let reset: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    revision++;
    operation?.abort();
    clearTimeout(reset);
    setState("idle");
  };
  createEffect(on(() => props.resetKey, invalidate, { defer: true }));
  onCleanup(() => {
    revision++;
    operation?.abort();
    clearTimeout(reset);
  });
  const text = (id: CopyState) =>
    ({
      idle: props.label ?? "Copy",
      pending: "Copying",
      copied: "Copied",
      selected: "Selected",
      error: "Try again",
    })[id];
  const status = () =>
    state() === "copied"
      ? "Copied to clipboard."
      : state() === "selected"
        ? "Text selected. Copy the selection to continue."
        : state() === "error"
          ? (props.errorMessage ?? "Could not copy. Select the text and copy it.")
          : "";
  const copy = async (animate: boolean) => {
    const current = ++revision;
    operation?.abort();
    operation = new AbortController();
    const { signal } = operation;
    clearTimeout(reset);
    setPointer(animate);
    setState("pending");
    try {
      const result = await props.onCopy(signal);
      if (current !== revision) return;
      setState(result);
    } catch {
      if (current !== revision) return;
      setState("error");
    }
    reset = setTimeout(() => {
      if (current === revision) setState("idle");
    }, 1800);
  };
  return (
    <span class="nk-copy-control">
      <button
        type="button"
        class={`nk-copy-button ${props.class ?? ""}`}
        aria-label={props.ariaLabel ?? props.label ?? "Copy"}
        aria-busy={state() === "pending"}
        data-copy-state={state()}
        data-copy-motion={pointer() ? "pointer" : "instant"}
        onPointerDown={() => setPointer(true)}
        onKeyDown={() => setPointer(false)}
        onClick={(event) => void copy(event.detail > 0)}
      >
        <svg
          class="nk-copy-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <g class="nk-copy-icon-paper" stroke="currentColor" stroke-width="1.4">
            <rect x="5" y="5" width="8" height="9" rx="1.5" />
            <path d="M10 5V3A1.5 1.5 0 0 0 8.5 1.5h-6A1.5 1.5 0 0 0 1 3v7A1.5 1.5 0 0 0 2.5 11.5H5" />
          </g>
          <path
            class="nk-copy-icon-check"
            d="m3 8 3 3 7-7"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="nk-copy-labels" aria-hidden="true">
          <For each={states}>
            {(id) => (
              <span
                class={`nk-copy-feedback nk-copy-${id}${id === "copied" ? " nk-copy-feedback-result" : ""}`}
                data-active={state() === id ? "" : undefined}
              >
                {text(id)}
              </span>
            )}
          </For>
        </span>
      </button>
      <span class="nk-copy-status" role="status">
        {status()}
      </span>
    </span>
  );
}
