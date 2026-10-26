import { type JSX, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import "../../kit/reader.css";

const TOOLTIP_ID = "nk-reader-tooltip";
const [anchor, setAnchor] = createSignal<Element | null>(null);
const [content, setContent] = createSignal<() => JSX.Element>(() => null);
let hideTimer: number | undefined;
let touchTarget: Element | null = null;

function describe(el: Element, active: boolean) {
  const ids = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== TOOLTIP_ID);
  if (active) ids.push(TOOLTIP_ID);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

function show(el: Element, render: () => JSX.Element) {
  window.clearTimeout(hideTimer);
  const previous = anchor();
  if (previous && previous !== el) describe(previous, false);
  setContent(() => render);
  describe(el, true);
  setAnchor(el);
}

function dismiss() {
  window.clearTimeout(hideTimer);
  const previous = anchor();
  if (previous) describe(previous, false);
  setAnchor(null);
}

function hide() {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(dismiss, 120);
}

/** Fresh JSX thunks, shared by glossary, HTML and SVG anchors. */
export function tip(render: () => JSX.Element) {
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== "touch") show(e.currentTarget as Element, render);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType !== "touch" && document.activeElement !== e.currentTarget) hide();
    },
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== "touch") {
        touchTarget = null;
        return;
      }
      touchTarget = e.currentTarget as Element;
      if (anchor() === touchTarget) dismiss();
      else show(touchTarget, render);
    },
    onFocus: (e: FocusEvent) => {
      if (touchTarget !== e.currentTarget) show(e.currentTarget as Element, render);
    },
    onBlur: hide,
  };
}

/** One tooltip. A manual popover escapes clipping; moving under a dialog also preserves modal accessibility. */
export function TooltipLayer() {
  let el!: HTMLDivElement;
  let home!: HTMLDivElement;
  const [positioned, setPositioned] = createSignal(false);

  createEffect(() => {
    const a = anchor();
    setPositioned(false);
    if (!a) {
      if (el.matches(":popover-open")) el.hidePopover();
      home.appendChild(el);
      return;
    }
    const mount = a.closest("dialog[open]") ?? home;
    if (el.parentElement !== mount) {
      if (el.matches(":popover-open")) el.hidePopover();
      mount.appendChild(el);
    }
    if (!el.matches(":popover-open")) el.showPopover();
    let alive = true;
    const stop = autoUpdate(a, el, async () => {
      const result = await computePosition(a, el, {
        placement: "top",
        strategy: "fixed",
        middleware: [
          offset(10),
          flip({ padding: 12 }),
          shift({ padding: 12 }),
          size({
            padding: 12,
            apply({ availableHeight, elements }) {
              elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
            },
          }),
        ],
      });
      if (!alive || anchor() !== a) return;
      el.style.left = `${result.x}px`;
      el.style.top = `${result.y}px`;
      setPositioned(true);
    });
    onCleanup(() => {
      alive = false;
      stop();
    });
  });

  onMount(() => {
    const onDown = (event: PointerEvent) => {
      const a = anchor();
      const target = event.target as Node;
      if (a && !a.contains(target) && !el.contains(target)) {
        touchTarget = null;
        dismiss();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      touchTarget = null;
      if (event.key === "Escape" && anchor()) {
        event.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      dismiss();
      if (el.matches(":popover-open")) el.hidePopover();
      home.appendChild(el);
    });
  });

  return (
    <Portal>
      <div ref={home} style={{ display: "contents" }}>
        <div
          ref={el}
          id={TOOLTIP_ID}
          class="tip nk-reader-tip"
          role="tooltip"
          popover="manual"
          style={{ visibility: positioned() && anchor() ? "visible" : "hidden" }}
          onPointerEnter={() => window.clearTimeout(hideTimer)}
          onPointerLeave={hide}
        >
          <Show when={anchor()}>{content()()}</Show>
        </div>
      </div>
    </Portal>
  );
}
