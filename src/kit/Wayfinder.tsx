import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  on,
} from "solid-js";
import "./reader.css";
import { PathPlayhead } from "./PathPlayhead";
import { playheadGrabOffset } from "./timeline-model";
import {
  readingMap,
  readingRail,
  distanceAtY,
  distanceAtScroll,
  scrollAtDistance,
  type ReadingMap,
} from "./wayfinder-model";

export interface WayChapter {
  id: string;
  n: string;
  title: string;
  question: string;
}

interface Mark {
  y: number;
  label: string;
}
const READ_LINE = 0.35;

/** A registry-derived margin outline, or a normal-flow disclosure on smaller screens. */
export const Wayfinder: Component<{ chapters: WayChapter[] }> = (props) => {
  let root!: HTMLElement;
  let trigger!: HTMLButtonElement;
  let rail!: HTMLOListElement;
  let slider!: HTMLDivElement;
  let svg!: SVGSVGElement;
  let dragging: number | undefined;
  let dragViewport = { width: 0, height: 0 };
  let grabOffset = 0;
  let maximum = 0;
  let map: ReadingMap = [];
  const [curve, setCurve] = createSignal<ReturnType<typeof readingRail>>();
  const [distance, setDistance] = createSignal(0);
  const [progress, setProgress] = createSignal(0);
  const [bandEnd, setBandEnd] = createSignal(0);
  const stopDragging = () => {
    const pointer = dragging;
    dragging = undefined;
    grabOffset = 0;
    if (pointer !== undefined && slider.hasPointerCapture(pointer))
      slider.releasePointerCapture(pointer);
  };
  const seek = (value: number) => {
    const top = Math.max(0, Math.min(maximum, value));
    scrollTo({ top, behavior: "instant" });
    setDistance(distanceAtScroll(map, top));
    setProgress(maximum ? (top / maximum) * 100 : 0);
  };
  const scrub = (event: PointerEvent) => {
    if (dragViewport.width !== innerWidth || dragViewport.height !== innerHeight) {
      stopDragging();
      return;
    }
    const rail = curve(),
      matrix = svg.getScreenCTM();
    if (!rail || !matrix || maximum <= 0) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    seek(scrollAtDistance(map, rail.project(point) - grabOffset));
  };
  const sliderKey = (event: KeyboardEvent) => {
    const next = map.find((stop) => stop.scroll > scrollY + 1)?.scroll ?? maximum;
    const previous = [...map].reverse().find((stop) => stop.scroll < scrollY - 1)?.scroll ?? 0;
    const commands: Record<string, number> = {
      Home: 0,
      End: maximum,
      ArrowDown: scrollY + maximum / 100,
      ArrowRight: scrollY + maximum / 100,
      ArrowUp: scrollY - maximum / 100,
      ArrowLeft: scrollY - maximum / 100,
      PageDown: next,
      PageUp: previous,
    };
    if (event.key === "Escape") {
      stopDragging();
      return;
    }
    if (!(event.key in commands) || !curve() || maximum <= 0) return;
    event.preventDefault();
    stopDragging();
    seek(commands[event.key]);
  };
  const listId = createUniqueId();
  const [current, setCurrent] = createSignal(-1);
  const [open, setOpen] = createSignal(false);
  const [trail, setTrail] = createSignal<Mark[]>([]);
  const [total, setTotal] = createSignal(0);
  // An author-placed Contents is a second map. While it is on screen, this outline stands down.
  const [route, setRoute] = createSignal<"none" | "visible" | "away">("none");
  let refreshLayout = () => {};
  let focusFrame = 0;

  const label = (i: number) =>
    i < 0 ? "the top" : `${props.chapters[i].n} · ${props.chapters[i].title}`;
  const position = () =>
    current() < 0
      ? `${props.chapters.length} chapters`
      : `${current() + 1} / ${props.chapters.length}`;
  const positionLabel = () =>
    current() < 0
      ? `Introduction; ${props.chapters.length} chapters`
      : `Reading chapter ${current() + 1} of ${props.chapters.length}`;
  const next = () => props.chapters[current() + 1];
  const close = () => {
    if (!open()) return;
    setOpen(false);
    trigger.focus({ preventScroll: true });
    // Native fragment navigation applies focus after click handlers have returned.
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  };

  onMount(() => {
    let frame = 0;
    let alive = true;
    let fontsReady = false;
    let previousGeometry = "";
    const observed = new Set<Element>();
    const schedule = (layout = false) => {
      if (layout) stopDragging();
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onLayout = () => schedule(true);
    const onScroll = () => schedule();
    const observer = new ResizeObserver(onLayout);
    let watchedRoute: Element | null = null;
    const routeObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) setRoute(entry.isIntersecting ? "visible" : "away");
    });
    refreshLayout = onLayout;

    function measure() {
      frame = 0;
      const chapters = props.chapters.map((c) => document.getElementById(c.id));
      const targets = new Set<Element>([
        document.documentElement,
        rail,
        ...chapters.filter((el): el is HTMLElement => !!el),
      ]);
      const article = root.closest(".nk-note");
      if (article) targets.add(article);
      const contents = article?.querySelector(".nk-contents") ?? null;
      if (contents !== watchedRoute) {
        if (watchedRoute) routeObserver.unobserve(watchedRoute);
        watchedRoute = contents;
        if (contents) routeObserver.observe(contents);
        else setRoute("none");
      }
      for (const el of observed)
        if (!targets.has(el)) {
          observer.unobserve(el);
          observed.delete(el);
        }
      for (const el of targets)
        if (!observed.has(el)) {
          observer.observe(el);
          observed.add(el);
        }

      const line = innerHeight * READ_LINE;
      let index = -1;
      chapters.forEach((chapter, i) => {
        if (!chapter) return;
        if (chapter.getBoundingClientRect().top <= line) index = i;
      });
      setCurrent(index);
      if (fontsReady) {
        const height = rail.offsetHeight;
        const origin = rail.getBoundingClientRect().top;
        const links = [...rail.querySelectorAll<HTMLAnchorElement>(":scope > li > a")];
        const centers = links.map((a) => {
          const bounds = a.getBoundingClientRect();
          return bounds.top - origin + bounds.height / 2;
        });
        maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        const targets = chapters.map((chapter) =>
          chapter
            ? Math.max(0, Math.min(maximum, chapter.getBoundingClientRect().top + scrollY - line))
            : 0,
        );
        const geometry = `${height}:${maximum}:${centers.join(",")}:${targets.map((value) => Math.round(value * 100) / 100).join(",")}:${innerWidth >= 1440}`;
        if (geometry !== previousGeometry) {
          stopDragging();
          const drawing = innerWidth >= 1440 ? readingRail(height) : undefined;
          setCurve(drawing);
          setTotal(height);
          map = drawing
            ? readingMap(
                targets.map((scroll, i) => ({
                  scroll,
                  distance: distanceAtY(drawing, centers[i] ?? 0),
                })),
                maximum,
                drawing.length,
              )
            : [];
          previousGeometry = geometry;
        }
        setDistance(distanceAtScroll(map, scrollY));
        setBandEnd(distanceAtScroll(map, Math.min(maximum, scrollY + innerHeight)));
        setProgress(maximum ? Math.max(0, Math.min(100, (scrollY / maximum) * 100)) : 0);
      }
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (
        !a ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      // Observe native jumps; leave URL, history and scroll behavior to the browser.
      setTrail((t) => [...t.slice(-4), { y: scrollY, label: label(current()) }]);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open()) {
        e.preventDefault();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (open() && !root.contains(e.target as Node)) close();
    };
    const onFonts = () => {
      if (alive) {
        fontsReady = true;
        onLayout();
      }
    };
    document.fonts.ready.then(onFonts);
    document.fonts.addEventListener("loadingdone", onFonts);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onLayout);
    document.addEventListener("toggle", onLayout, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    schedule(true);
    onCleanup(() => {
      alive = false;
      stopDragging();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      routeObserver.disconnect();
      refreshLayout = () => {};
      document.fonts.removeEventListener("loadingdone", onFonts);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onLayout);
      document.removeEventListener("toggle", onLayout, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    });
  });

  createEffect(on([() => props.chapters, open], () => refreshLayout()));

  const back = () => {
    const last = trail().at(-1);
    if (!last) return;
    setTrail((t) => t.slice(0, -1));
    scrollTo({
      top: last.y,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <nav
      ref={root}
      class="nk-way nk-reader-outline"
      aria-label="On this page"
      data-open={open() ? "" : undefined}
      data-route={route() === "none" ? undefined : route()}
    >
      <button
        ref={trigger}
        type="button"
        class="nk-outline-trigger"
        aria-expanded={open()}
        aria-controls={listId}
        onClick={() => (open() ? close() : setOpen(true))}
      >
        <span class="nk-outline-label">
          On this page{" "}
          <span class="nk-outline-count" aria-label={positionLabel()}>
            {position()}
          </span>
        </span>
        <span class="nk-outline-current">
          {current() < 0 ? "Introduction" : props.chapters[current()].title}
        </span>
        <span aria-hidden="true">{open() ? "−" : "+"}</span>
      </button>
      <div id={listId} class="nk-outline-body" hidden={!open()}>
        <div class="nk-outline-heading">
          <a class="nk-outline-top" href="#" onClick={close}>
            On this page
          </a>
          <span class="nk-outline-count" aria-label={positionLabel()}>
            {position()}
          </span>
        </div>
        <div class="nk-outline-route">
          <div
            ref={slider}
            class="nk-outline-slider"
            role="slider"
            tabIndex={0}
            aria-label="Reading position"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress() * 10) / 10}
            aria-valuetext={`${Math.round(progress())} percent; ${current() < 0 ? "Introduction" : props.chapters[current()].title}`}
            aria-disabled={!curve() || maximum <= 0}
            style={{ height: `${total()}px` }}
            onKeyDown={sliderKey}
            onPointerDown={(event) => {
              if (
                dragging !== undefined ||
                event.button !== 0 ||
                !event.isPrimary ||
                !curve() ||
                maximum <= 0
              )
                return;
              event.preventDefault();
              dragging = event.pointerId;
              dragViewport = { width: innerWidth, height: innerHeight };
              const matrix = svg.getScreenCTM();
              if (matrix) {
                const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(
                  matrix.inverse(),
                );
                grabOffset = playheadGrabOffset(curve()!, distance(), pointer);
              }
              slider.focus({ preventScroll: true });
              slider.setPointerCapture(event.pointerId);
              scrub(event);
            }}
            onPointerMove={(event) => {
              if (dragging === event.pointerId) scrub(event);
            }}
            onPointerUp={(event) => {
              if (dragging === event.pointerId) stopDragging();
            }}
            onPointerCancel={(event) => {
              if (dragging === event.pointerId) stopDragging();
            }}
            onLostPointerCapture={(event) => {
              if (dragging === event.pointerId) stopDragging();
            }}
          >
            <svg
              ref={svg}
              width="80"
              height={total()}
              viewBox={`0 0 80 ${Math.max(1, total())}`}
              aria-hidden="true"
            >
              <path d={curve()?.path ?? ""} class="nk-outline-track-base" />
              <path
                d={curve()?.path ?? ""}
                class="nk-outline-viewport"
                stroke-dasharray={`${Math.max(0, bandEnd() - distance())} ${curve()?.length ?? 0}`}
                stroke-dashoffset={-distance()}
              />
              <path
                d={curve()?.path ?? ""}
                class="nk-outline-track-active"
                stroke-dasharray={`${distance()} ${curve()?.length ?? 0}`}
              />
              <Show when={curve()}>
                {(rail) => (
                  <PathPlayhead class="nk-outline-playhead" rail={rail()} distance={distance()} />
                )}
              </Show>
            </svg>
          </div>
          <ol ref={rail}>
            <For each={props.chapters}>
              {(c, i) => (
                <li classList={{ now: i() === current(), past: i() < current() }}>
                  <a
                    href={`#${c.id}`}
                    aria-current={i() === current() ? "location" : undefined}
                    onClick={close}
                  >
                    <span class="nk-outline-number">{c.n}</span>
                    <span class="nk-outline-title">{c.title}</span>
                  </a>
                </li>
              )}
            </For>
          </ol>
        </div>
        <Show when={next()}>
          {(chapter) => (
            <a class="nk-outline-next" href={`#${chapter().id}`} onClick={close}>
              <span class="nk-outline-direction">
                {current() < 0 ? "Start reading" : "Next chapter"} <span aria-hidden="true">→</span>
              </span>
              <span class="nk-outline-title">
                {chapter().n} · {chapter().title}
              </span>
            </a>
          )}
        </Show>
      </div>
      <Show when={trail().length}>
        <button type="button" class="nk-outline-back" onClick={back}>
          ↩ <span>Back to {trail().at(-1)!.label}</span>
        </button>
      </Show>
    </nav>
  );
};
