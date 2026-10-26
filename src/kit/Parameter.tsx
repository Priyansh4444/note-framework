import {
  type JSX,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  on,
  untrack,
} from "solid-js";
import { formatParameterValue } from "./controls";
import "./parameter.css";

export type ParameterProps = {
  /** Text or inline markup such as <var>; its text is the input's accessible name. */
  label: JSX.Element;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
  /** Pause playback before the browser changes the value, including a held grab. */
  onInteractionStart?: () => void;
  unit?: string;
  disabled?: boolean;
};

// The native range is the only numerical owner. Source history: Parameter.SOURCES.md.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const releaseMs = 180;
const signed = (text: string) => text.replace(/^-/, "\u2212");
const withUnit = (text: string, unit?: string) => `${signed(text)}${unit ? ` ${unit}` : ""}`;
type TactileState =
  | { kind: "rest" }
  | { kind: "drag"; pointerId: number; lastX: number; travel: number };

/** Native range semantics and exact values; only an attached contour can deform. */
export function Parameter(props: ParameterProps) {
  const id = createUniqueId();
  const gradientId = `${id}-collar`;
  let input!: HTMLInputElement;
  let skin!: SVGSVGElement;
  let track!: SVGPathElement;
  let fill!: SVGPathElement;
  let collar!: SVGPathElement;
  let accentStop!: SVGStopElement;
  let neutralStop!: SVGStopElement;
  let width = 16;
  const [nativeValue, setNativeValue] = createSignal(props.value);
  let constraints = "";
  let state: TactileState = { kind: "rest" };
  let motion: Animation | undefined;
  let reduced: MediaQueryList | undefined;
  let forced: MediaQueryList | undefined;
  const readout = () => withUnit(formatParameterValue(nativeValue(), props.step), props.unit);
  const center = () => {
    const min = Number(input.min),
      max = Number(input.max);
    const ratio = max <= min ? 0 : clamp((input.valueAsNumber - min) / (max - min), 0, 1);
    return 8 + ratio * Math.max(0, width - 16);
  };
  const extension = (travel: number) => 6 * (1 - (1 - Math.min(Math.abs(travel) / 24, 1)) ** 2);
  const contour = (travel: number) => {
    const c = center();
    // Fixed-topology closed half-collars. Their root never leaves the native center;
    // only the trailing tip/shoulder change, with horizontal tangents at each tip.
    const half = (side: -1 | 1) => {
      const extra = Math.sign(travel) === -side ? extension(travel) : 0;
      const reach = Math.max(0, Math.min(8 + extra, side === -1 ? c - 8 : width - 8 - c));
      const x = (distance: number) => c + side * Math.min(distance, reach);
      const h = 3 + extra / 6;
      const tip = x(reach);
      const shoulder = Math.min(5, reach);
      const span = reach - shoulder;
      const outer = x(shoulder + span / 3);
      const neck = x(shoulder + (span * 2) / 3);
      return `M ${c} 22 L ${c} 19 C ${x(2)} 19 ${x(3)} ${22 - h} ${x(5)} ${22 - h} C ${outer} ${22 - h} ${neck} 22 ${tip} 22 C ${neck} 22 ${outer} ${22 + h} ${x(5)} ${22 + h} C ${x(3)} ${22 + h} ${x(2)} 25 ${c} 25 Z`;
    };
    return `${half(-1)} ${half(1)}`;
  };
  // Every command has x/y pairs. Snapshot the *painted* interpolated path,
  // translate its root to the current native center, and clip it to the rail.
  // Rebuilding from travel would discard the pose midway through an interruption.
  const paintedContour = () => {
    const c = center();
    const d = getComputedStyle(collar).d.slice(6, -2);
    let coordinate = 0,
      oldCenter = 0;
    return d.replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi, (text) => {
      const value = Number(text);
      if (coordinate++ === 0) oldCenter = value;
      return String(coordinate % 2 ? clamp(value + c - oldCenter, 8, width - 8) : value);
    });
  };
  const animateFrom = (from: string, duration: number) => {
    motion?.cancel();
    const target = contour(state.kind === "drag" ? state.travel : 0);
    collar.setAttribute("d", target);
    // One replaceable owner; numerical geometry and the rail never animate.
    const animation = collar.animate([{ d: `path("${from}")` }, { d: `path("${target}")` }], {
      duration,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
    motion = animation;
    animation.onfinish = () => {
      if (motion === animation) motion = undefined;
    };
  };
  const paint = () => {
    if (!track) return;
    const c = center();
    track.setAttribute("d", `M 8 22 H ${Math.max(8, width - 8)}`);
    fill.setAttribute("d", `M 8 22 H ${c}`);
    const split = String(c / width);
    accentStop.setAttribute("offset", split);
    neutralStop.setAttribute("offset", split);
    if (motion && !collar.getAttribute("d")?.startsWith(`M ${c} `)) {
      // Absolute d animation must move with native input, including input events
      // before pointermove. Keep its remaining deadline rather than queue motion.
      const remaining = Number(motion.effect!.getTiming().duration) - Number(motion.currentTime);
      const from = paintedContour();
      animateFrom(from, Math.max(0, remaining));
    } else if (!motion) collar.setAttribute("d", contour(state.kind === "drag" ? state.travel : 0));
  };
  const reset = () => {
    state = { kind: "rest" };
    motion?.cancel();
    motion = undefined;
    paint();
  };
  const release = (event: PointerEvent) => {
    if (state.kind !== "drag" || event.pointerId !== state.pointerId) return;
    if (event.type === "pointercancel" || reduced?.matches || forced?.matches) {
      reset();
      return;
    }
    const from = paintedContour();
    state = { kind: "rest" };
    animateFrom(from, releaseMs);
  };
  const move = (event: PointerEvent) => {
    if (state.kind !== "drag" || event.pointerId !== state.pointerId) return;
    if (props.disabled || reduced?.matches || forced?.matches) {
      reset();
      return;
    }
    const dx = event.clientX - state.lastX;
    state.lastX = event.clientX;
    if (!dx) return;
    const from = paintedContour();
    const continuing = Math.sign(dx) === Math.sign(state.travel);
    state.travel = clamp((continuing ? state.travel : 0) + dx, -24, 24);
    animateFrom(from, 90);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || props.disabled) return;
    props.onInteractionStart?.();
    if (reduced?.matches || forced?.matches) return;
    const from = paintedContour();
    state = { kind: "drag", pointerId: event.pointerId, lastX: event.clientX, travel: 0 };
    animateFrom(from, 90);
    // Observe only: the browser retains its default drag/capture and value mapping.
  };
  onMount(() => {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    forced = window.matchMedia("(forced-colors: active)");
    reduced.addEventListener("change", reset);
    forced.addEventListener("change", reset);
    const measure = () => {
      reset();
      width = Math.max(16, input.getBoundingClientRect().width);
      skin.setAttribute("viewBox", `0 0 ${width} 44`);
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    window.addEventListener("resize", reset);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", reset);
    onCleanup(() => {
      reset();
      observer.disconnect();
      reduced?.removeEventListener("change", reset);
      forced?.removeEventListener("change", reset);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", reset);
    });
  });
  createEffect(
    on(
      () => [props.min, props.max, props.step, props.value] as const,
      ([min, max, step, value]) => {
        if (!track) return;
        // Reapply constraints before value: native sanitization remains authoritative.
        // An echoed native input keeps the current drag; an external change resets it.
        const nextConstraints = `${min}/${max}/${step}`;
        const previous = untrack(nativeValue);
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        // Compare accepted native values, not raw floats: affine scene round trips
        // may echo 50.099999999999994 for the same native 50.1 percentage step.
        if (previous !== input.valueAsNumber || constraints !== nextConstraints) reset();
        setNativeValue(input.valueAsNumber);
        constraints = nextConstraints;
        paint();
      },
    ),
  );
  createEffect(() => {
    if (props.disabled) reset();
  });
  return (
    <div class="nk-parameter" data-disabled={props.disabled ? "" : undefined}>
      <div class="nk-parameter-label">
        <label for={id}>{props.label}</label>
        <output for={id} aria-live="off">
          {readout()}
        </output>
      </div>
      <div class="nk-parameter-range">
        <svg ref={skin} class="nk-parameter-skin" aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              x2="100%"
              y1="0%"
              y2="0%"
              gradientUnits="userSpaceOnUse"
            >
              <stop ref={accentStop} class="nk-parameter-accent-stop" />
              <stop ref={neutralStop} class="nk-parameter-neutral-stop" />
            </linearGradient>
          </defs>
          <path ref={track} class="nk-parameter-track" />
          <path ref={fill} class="nk-parameter-fill" />
          <path ref={collar} class="nk-parameter-collar" fill={`url(#${gradientId})`} />
        </svg>
        <input
          ref={input}
          id={id}
          type="range"
          disabled={props.disabled}
          aria-valuetext={readout()}
          onInput={(event) => {
            // Snapshot before publishing: a parent effect can rewrite the native input.
            const next = event.currentTarget.valueAsNumber;
            setNativeValue(next);
            paint();
            props.onInput(next);
          }}
          onPointerDown={down}
          onBlur={reset}
          onKeyDown={(event) => {
            if (
              !props.disabled &&
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(event.key)
            )
              props.onInteractionStart?.();
            reset();
          }}
        />
      </div>
      <div class="nk-parameter-bounds" aria-hidden="true">
        <span>{withUnit(String(props.min), props.unit)}</span>
        <span>{withUnit(String(props.max), props.unit)}</span>
      </div>
    </div>
  );
}
