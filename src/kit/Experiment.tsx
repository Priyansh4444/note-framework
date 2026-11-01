import { type JSX, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Scene } from "../post/scene/clock";
import { CurveTimeline } from "./CurveTimeline";
import { observeSceneAudio, type CuePlan } from "./scene-audio";
import "./experiment.css";

export type ExperimentProps = {
  /** Semantic discrete positions for reduced-motion stepping, in scene milliseconds. */
  stepTimes?: readonly number[];
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
  /** A stable annotation between the picture and transport. Reserve its footprint when hidden. */
  annotation?: JSX.Element;
  /** Original quiet cues, off until this figure's sound button is activated. */
  sound?: CuePlan;
};

/** The supplied scene and sound plan stay stable for this component's lifetime. */
export function Experiment(props: ExperimentProps) {
  const scene = props.scene;
  const audio = scene && props.sound ? observeSceneAudio(scene, props.sound) : undefined;
  const [reduced, setReduced] = createSignal(false);
  let root!: HTMLElement;
  // A figure may rest on a mid-way picture. Until the reader moves it, Play performs from the
  // start and the timeline marks no step as under way.
  const [rest, setRest] = createSignal<number>();
  const idle = () => rest() !== undefined && scene?.revision() === rest();
  onMount(() => {
    setRest(scene?.revision());
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
          : ((props.stepTimes ?? scene.beats.map((_, i) => scene.start(i))).find(
              (t) => t > scene.t() + 0.001,
            ) ?? scene.length),
      );
    } else if (scene.ended() || idle()) scene.replay();
    else scene.play();
    setRest(undefined);
  };
  const Actions = () => (
    <Show when={scene}>
      <div class="nk-experiment-actions">
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
    >
      <p class="nk-experiment-question">{props.question}</p>
      <div
        class="nk-experiment-body"
        classList={{ "nk-experiment-with-timeline": !!props.timeline && !!scene }}
      >
        <div class="nk-experiment-stage">{props.children}</div>
        <Show when={props.annotation}>
          <div class="nk-experiment-annotation">{props.annotation}</div>
        </Show>
        <Show when={props.timeline ? scene : undefined}>
          {(s) => (
            <CurveTimeline
              scene={s()}
              actions={<Actions />}
              idle={idle()}
              label={typeof props.timeline === "string" ? props.timeline : "Scene position"}
            />
          )}
        </Show>
      </div>
      <Show when={!props.timeline || !scene}>
        <Actions />
      </Show>
      <Show when={props.controls}>
        <div class="nk-experiment-controls">{props.controls}</div>
      </Show>
      <Show when={props.caption}>
        <figcaption>{props.caption}</figcaption>
      </Show>
      <Show when={props.details}>
        <div class="nk-experiment-details">{props.details}</div>
      </Show>
    </figure>
  );
}
