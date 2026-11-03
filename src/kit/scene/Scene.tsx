import { type JSX, type ParentComponent, For, Show, onCleanup, onMount } from "solid-js";
import type { Scene } from "./clock";
import { tip } from "./tooltip";

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor" />
  </svg>
);
const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
    <path
      d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4v4.5H9"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

/** Reader-started playback with replay and beat navigation; this component alone attaches its scene. */
export const SceneFrame: ParentComponent<{
  scene: Scene;
  n: number;
  caption: JSX.Element;
  label?: string;
  id?: string;
}> = (props) => {
  let root!: HTMLElement;
  const s = props.scene;

  onMount(() => {
    s.attach(root);
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === "r" || e.key === "R") &&
        !e.metaKey &&
        !e.ctrlKey &&
        root.matches(":hover") &&
        s.started()
      ) {
        e.preventDefault();
        s.replay();
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <figure
      ref={root}
      id={props.id ?? `figure-${props.n}`}
      class="scene"
      data-started={s.started() ? "" : undefined}
    >
      <div class="scene-stage">
        <div class="scene-content" aria-hidden={!s.started()} inert={!s.started()}>
          {props.children}
        </div>
        <Show when={!s.started()}>
          <button
            type="button"
            class="scene-gate"
            onClick={() => s.play()}
            aria-label={props.label ?? "Play"}
          >
            <span class="gate-pulse" aria-hidden="true">
              <PlayIcon />
            </span>
            <span class="gate-icon">
              <PlayIcon />
            </span>
            <span class="gate-label">{props.label ?? "Play"}</span>
          </button>
        </Show>
      </div>

      <div
        class="scene-controls"
        data-visible={s.started() ? "" : undefined}
        inert={!s.started()}
        aria-hidden={!s.started()}
      >
        <button
          type="button"
          class="ctl"
          aria-label={s.playing() ? "Pause" : "Play"}
          onClick={() => s.toggle()}
        >
          <Show when={s.playing()} fallback={<PlayIcon />}>
            <PauseIcon />
          </Show>
        </button>
        <button type="button" class="ctl" aria-label="Restart (R)" onClick={() => s.replay()}>
          <ReplayIcon />
        </button>
        <div class="beats" role="group" aria-label="Timeline">
          <For each={s.beats}>
            {(b, i) => (
              <button
                type="button"
                class="beat"
                data-beat-ms={b.ms}
                style={{ "flex-grow": b.ms }}
                aria-label={`${i() + 1}. ${b.label}`}
                onClick={() => s.seekBeat(i())}
                {...tip(() => (
                  <span>
                    <span class="tip-k">{i() + 1}</span> {b.label}
                  </span>
                ))}
              >
                <span class="beat-track">
                  <span class="beat-fill" style={{ transform: `scaleX(${s.progress(i())})` }} />
                </span>
              </button>
            )}
          </For>
        </div>
        <span class="beat-now" aria-live="polite">
          {s.beat() >= 0 ? s.beats[s.beat()].label : ""}
        </span>
      </div>

      <figcaption>
        <span class="n">Fig. {props.n}</span>
        {props.caption}
      </figcaption>
    </figure>
  );
};
