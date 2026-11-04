import { type JSX, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  hide as anchorVisibility,
  inline,
  offset,
  shift,
  size,
  type Placement,
} from "@floating-ui/dom";
import "../reader.css";

const TOOLTIP_ID = "nk-reader-tooltip";
/** Long enough that skimming across linked words opens nothing. */
const OPEN_DELAY = 90;
const CLOSE_DELAY = 120;
/** A reader moving between reminders is already reading them, so the next opens at once. */
const WARM_FOR = 400;
/** Content scrolling under a still pointer is not a request for a reminder. */
const SCROLL_SETTLE = 150;

type Point = { x: number; y: number };
const [anchor, setAnchor] = createSignal<Element | null>(null);
const [content, setContent] = createSignal<() => JSX.Element>(() => null);
const [point, setPoint] = createSignal<Point | undefined>();
let hideTimer: number | undefined;
let openTimer: number | undefined;
let touchTarget: Element | null = null;
let openedByPointer = false;
let closedAt = -Infinity;
let scrolledAt = -Infinity;
let pending: (() => void) | undefined;

function describe(el: Element, active: boolean) {
  const ids = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== TOOLTIP_ID);
  if (active) ids.push(TOOLTIP_ID);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

function cancelOpen() {
  window.clearTimeout(openTimer);
  pending = undefined;
}

function show(el: Element, render: () => JSX.Element, at?: Point) {
  cancelOpen();
  window.clearTimeout(hideTimer);
  const previous = anchor();
  if (previous && previous !== el) describe(previous, false);
  setPoint(at);
  setContent(() => render);
  describe(el, true);
  setAnchor(el);
}

function dismiss() {
  cancelOpen();
  window.clearTimeout(hideTimer);
  const previous = anchor();
  if (previous) {
    describe(previous, false);
    closedAt = performance.now();
  }
  setAnchor(null);
}

function hide() {
  cancelOpen();
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(dismiss, CLOSE_DELAY);
}

function schedule(open: () => void, wait: number) {
  window.clearTimeout(openTimer);
  pending = open;
  openTimer = window.setTimeout(() => {
    pending = undefined;
    open();
  }, wait);
}

/** Fresh JSX thunks, shared by glossary, HTML and SVG anchors. */
export function tip(render: () => JSX.Element) {
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = e.currentTarget as Element,
        at = { x: e.clientX, y: e.clientY },
        now = performance.now();
      const open = () => {
        openedByPointer = true;
        show(el, render, at);
      };
      window.clearTimeout(hideTimer);
      if (anchor() || now - closedAt < WARM_FOR) open();
      else schedule(open, Math.max(OPEN_DELAY, SCROLL_SETTLE - (now - scrolledAt)));
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
      else {
        openedByPointer = true;
        show(touchTarget, render, { x: e.clientX, y: e.clientY });
      }
    },
    onFocus: (e: FocusEvent) => {
      if (touchTarget === e.currentTarget) return;
      // A click also focuses; only keyboard focus should outlast the pointer.
      if ((e.currentTarget as Element).matches(":focus-visible")) {
        openedByPointer = false;
        show(e.currentTarget as Element, render);
      }
    },
    onBlur: hide,
  };
}

/**
 * One reminder for the page. It never travels between anchors and keeps to one side while the
 * reader moves along the text, so nothing slides or swaps above and below. It sits on the line
 * the pointer entered, and it closes rather than chases its anchor when the page scrolls.
 */
export function TooltipLayer() {
  let el!: HTMLDivElement;
  let home!: HTMLDivElement;
  let pointerEl!: HTMLSpanElement;
  let body!: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  const [side, setSide] = createSignal<"top" | "bottom">("top");
  /** The side this reading session settled on. A cold open starts above again. */
  let preferred: Placement = "top";

  createEffect(() => {
    const a = anchor(),
      at = point();
    if (!a) {
      setReady(false);
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
    if (performance.now() - closedAt >= WARM_FOR && !ready()) preferred = "top";
    let alive = true;
    const stop = autoUpdate(
      a,
      el,
      async () => {
        const result = await computePosition(a, el, {
          placement: preferred,
          strategy: "fixed",
          middleware: [
            inline(at),
            offset(10),
            flip({ padding: 12, crossAxis: false }),
            shift({ padding: 12 }),
            size({
              padding: 12,
              apply({ availableHeight }) {
                body.style.maxHeight = `${Math.max(0, availableHeight)}px`;
              },
            }),
            arrow({ element: pointerEl, padding: 10 }),
            anchorVisibility(),
          ],
        });
        if (!alive || anchor() !== a) return;
        // Scrolled away from its anchor, a reminder explains nothing and can cover a control.
        if (result.middlewareData.hide?.referenceHidden) return dismiss();
        preferred = result.placement;
        setSide(result.placement.startsWith("bottom") ? "bottom" : "top");
        el.style.left = `${Math.round(result.x)}px`;
        el.style.top = `${Math.round(result.y)}px`;
        pointerEl.style.left = `${Math.round(result.middlewareData.arrow?.x ?? 0)}px`;
        setReady(true);
      },
      { elementResize: false, layoutShift: false },
    );
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
    const onScroll = (event: Event) => {
      if (el.contains(event.target as Node)) return;
      scrolledAt = performance.now();
      if (anchor() && openedByPointer) dismiss();
      // Entering a link mid-scroll waits for the page to come to rest.
      if (pending) schedule(pending, SCROLL_SETTLE);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, { capture: true });
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
          data-side={side()}
          data-ready={ready() && !!anchor()}
          style={{ visibility: ready() && anchor() ? "visible" : "hidden" }}
          onPointerEnter={() => window.clearTimeout(hideTimer)}
          onPointerLeave={hide}
        >
          <div ref={body} class="nk-tip-body">
            <Show when={anchor()}>{content()()}</Show>
          </div>
          <span ref={pointerEl} class="nk-tip-pointer" aria-hidden="true" />
        </div>
      </div>
    </Portal>
  );
}
