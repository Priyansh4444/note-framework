import { type JSX, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Scene } from "../post/scene/clock";
import { CurveTimeline } from "./CurveTimeline";
import { observeSceneAudio, type CuePlan } from "./scene-audio";
import "./experiment.css";

export type ExperimentProps = {
  /** What to do or look for. Do not repeat the chapter title: the heading already names the topic. */
  question: string;
  children: JSX.Element;
  id?: string;
  controls?: JSX.Element;
  /** An author-named native <details> element; its DOM stays mounted when closed. */
  details?: JSX.Element;
  caption?: JSX.Element;
  scene?: Scene;
  /** Opt in to a compact curved time control below the picture. */
  timeline?: boolean | string;
  actionsPlacement?: "top" | "bottom";
  /** Original quiet cues, off until this figure's sound button is activated. */
  sound?: CuePlan;
};

/** The supplied scene and sound plan stay stable for this component's lifetime. */
export function Experiment(props: ExperimentProps) {
  const scene = props.scene;
  const audio = scene && props.sound ? observeSceneAudio(scene, props.sound) : undefined;
  const [reduced, setReduced] = createSignal(false);
  let root!: HTMLElement;
  onMount(() => {
    scene?.attach(root);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    onCleanup(() => media.removeEventListener("change", update));
  });
  onCleanup(() => scene?.pause());
  const action = () =>
    scene?.playing() ? "Pause" : scene?.ended() ? "Replay" : reduced() ? "Next step" : "Play";
  const act = () => {
    if (!scene) return;
    if (scene.playing()) scene.pause();
    else if (reduced()) {
      scene.pause();
      scene.seek(
        scene.ended()
          ? 0
          : (scene.beats.map((_, i) => scene.start(i)).find((t) => t > scene.t() + 0.001) ??
              scene.length),
      );
    } else if (scene.ended()) scene.replay();
    else scene.play();
  };
  const Actions = () => (
    <Show when={scene}>
      <div
        class="nk-experiment-actions"
        style={props.actionsPlacement === "bottom" ? { order: 3 } : undefined}
      >
        <button
          type="button"
          class="nk-experiment-action"
          data-nk-scene-action={scene?.playing() ? "pause" : "play"}
          onClick={act}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5 2.5 12 8l-7 5.5z" fill="currentColor" opacity={scene?.playing() ? 0 : 1} />
            <path
              d="M5 3v10M11 3v10"
              stroke="currentColor"
              stroke-width="2"
              opacity={scene?.playing() ? 1 : 0}
            />
          </svg>
          <span>{action()}</span>
        </button>
        <Show when={!scene?.ended()}>
          <button
            type="button"
            class="nk-experiment-action nk-experiment-replay"
            onClick={() => {
              scene?.pause();
              scene?.seek(0);
              if (!reduced()) scene?.play();
            }}
          >
            Replay
          </button>
        </Show>
        <Show when={audio}>
          {(sound) => (
            <button
              type="button"
              class="nk-experiment-action nk-experiment-sound"
              aria-label={`Sound ${sound().status()}`}
              aria-pressed={
                sound().status() === "on" ||
                sound().status() === "enabling" ||
                sound().status() === "suspended"
              }
              disabled={sound().status() === "unavailable"}
              onClick={() => void sound().toggle()}
            >
              <span role="status">
                Sound {sound().status() === "enabling" ? "enabling…" : sound().status()}
              </span>
            </button>
          )}
        </Show>
      </div>
    </Show>
  );
  return (
    <figure
      ref={root}
      id={props.id}
      class="nk-experiment"
      data-nk-scene={scene ? "" : undefined}
      data-nk-scene-beats={scene ? JSON.stringify(scene.beats) : undefined}
      data-nk-scene-length={scene?.length}
      data-nk-scene-time={scene?.t()}
      data-nk-scene-active={scene?.active()}
      data-nk-scene-revision={scene?.revision()}
      data-actions-placement={props.actionsPlacement ?? "top"}
    >
      <p class="nk-experiment-question">{props.question}</p>
      <Show when={props.controls}>
        <div class="nk-experiment-controls">{props.controls}</div>
      </Show>
      <Show when={props.actionsPlacement !== "bottom"}>
        <Actions />
      </Show>
      <div
        class="nk-experiment-body"
        style={props.actionsPlacement === "bottom" ? { order: 2 } : undefined}
        classList={{ "nk-experiment-with-timeline": !!props.timeline && !!scene }}
      >
        <div class="nk-experiment-stage">{props.children}</div>
        <Show when={props.timeline ? scene : undefined}>
          {(s) => (
            <CurveTimeline
              scene={s()}
              label={typeof props.timeline === "string" ? props.timeline : "Scene position"}
            />
          )}
        </Show>
      </div>
      <Show when={props.actionsPlacement === "bottom"}>
        <Actions />
      </Show>
      <Show when={props.caption}>
        <figcaption style={props.actionsPlacement === "bottom" ? { order: 4 } : undefined}>
          {props.caption}
        </figcaption>
      </Show>
      <Show when={props.details}>
        <div
          class="nk-experiment-details"
          style={props.actionsPlacement === "bottom" ? { order: 5 } : undefined}
        >
          {props.details}
        </div>
      </Show>
    </figure>
  );
}
