import { type Component, For, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Tex } from "./Tex";
import { springCurve } from "../../post/scene/springs";
import { type MorphState, type MorphStep, type MorphToken, checkSteps, stepTex } from "./morph";
import "./math.css";

export { step, type MorphState, type MorphStep } from "./morph";

const exit = springCurve({ visualDuration: 0.22, bounce: 0 });
// Math never overshoots: a bouncing token would briefly sit somewhere it does not belong.
const glide = springCurve({ visualDuration: 0.5, bounce: 0 });
const enter = springCurve({ visualDuration: 0.3, bounce: 0 });
const tint = springCurve("settle");
const MOVE_AT = 110,
  ENTER_AT = 430;
/** A morph has settled by this point; beats should give readers time after it. */
export const MORPH_MS = 1000;

type Point = { x: number; y: number };
type Layout = Map<string, Point>[];

export const MathMorph: Component<{
  steps: readonly MorphStep[];
  state: MorphState;
  label: string;
}> = (props) => {
  const texByKey = checkSteps(props.steps);
  const keys = [...texByKey.keys()];
  let stage!: HTMLDivElement;
  const ghosts: HTMLDivElement[] = [];
  const [layout, setLayout] = createSignal<Layout>();

  const measure = () => {
    const box = stage.getBoundingClientRect();
    const scale = box.width / (stage.offsetWidth || 1) || 1;
    setLayout(
      ghosts.map((ghost) => {
        const points = new Map<string, Point>();
        for (const el of ghost.querySelectorAll<HTMLElement>("[data-k]")) {
          const r = el.getBoundingClientRect();
          points.set(el.dataset.k!, {
            x: (r.left - box.left) / scale,
            y: (r.top - box.top) / scale,
          });
        }
        return points;
      }),
    );
  };
  onMount(() => {
    measure();
    void document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });

  const at = (key: string) => {
    const l = layout();
    const { from, to, ms } = props.state;
    if (!l) return undefined;
    const a = l[from].get(key),
      b = l[to].get(key);
    const fa = props.steps[from].focus.has(key) ? 1 : 0,
      fb = props.steps[to].focus.has(key) ? 1 : 0;
    const focus = fa + (fb - fa) * tint(ms - MOVE_AT);
    if (from === to || (a && b)) {
      const p = from === to ? 1 : glide(ms - MOVE_AT);
      const s = (a ?? b)!,
        e = (b ?? a)!;
      return a || b
        ? { x: s.x + (e.x - s.x) * p, y: s.y + (e.y - s.y) * p, opacity: 1, blur: 0, focus }
        : undefined;
    }
    if (a) {
      const p = exit(ms);
      return { ...a, y: a.y - 4 * p, opacity: 1 - p, blur: 2 * p, focus };
    }
    if (b) {
      const p = enter(ms - ENTER_AT);
      return { ...b, y: b.y + 6 * (1 - p), opacity: p, blur: 2 * (1 - p), focus };
    }
    return undefined;
  };
  const current = createMemo(() =>
    props.state.ms >= MORPH_MS ? props.state.to : props.state.from,
  );

  return (
    <div class="nf-morph" role="group" aria-label={props.label}>
      <span class="nf-morph-a11y">
        <Tex tex={stepTex(props.steps[current()])} />
      </span>
      <div
        class="nf-morph-stage"
        ref={stage}
        aria-hidden="true"
        data-measured={layout() ? "" : undefined}
      >
        <For each={props.steps}>
          {(s, i) => (
            <div
              class="nf-morph-ghost"
              ref={(el) => (ghosts[i()] = el)}
              data-resting={current() === i() ? "" : undefined}
            >
              <For each={s.lines}>
                {(line) => {
                  const rel = line.findIndex((t) => t.kind === "rel");
                  const cell = (tokens: MorphToken[], side: string) => (
                    <span class={`nf-morph-cell ${side}`}>
                      <For each={tokens}>
                        {(t) => (
                          <span class="nf-morph-tok" data-k={t.k} data-kind={t.kind}>
                            <Tex tex={t.tex} />
                          </span>
                        )}
                      </For>
                    </span>
                  );
                  return (
                    <>
                      {cell(rel < 0 ? [] : line.slice(0, rel), "lhs")}
                      {cell(rel < 0 ? [] : [line[rel]], "rel")}
                      {cell(line.slice(rel + 1), "rhs")}
                    </>
                  );
                }}
              </For>
            </div>
          )}
        </For>
        <For each={keys}>
          {(key) => {
            const s = createMemo(() => at(key));
            return (
              <span
                class="nf-morph-live"
                style={{
                  transform: s() ? `translate(${s()!.x}px, ${s()!.y}px)` : "none",
                  opacity: s()?.opacity ?? 0,
                  filter: s() && s()!.blur > 0.05 ? `blur(${s()!.blur}px)` : "none",
                  color: `color-mix(in oklab, var(--accent) ${Math.round((s()?.focus ?? 0) * 100)}%, currentColor)`,
                }}
              >
                <Tex tex={texByKey.get(key)!} />
              </span>
            );
          }}
        </For>
      </div>
    </div>
  );
};
