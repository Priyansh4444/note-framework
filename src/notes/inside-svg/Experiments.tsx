import { createMemo, createSignal, createUniqueId, For, onCleanup, onMount } from "solid-js";
import { Action, Choice, createScene, Experiment, Toolbar } from "../../kit";
import { Artwork, Shape } from "./Artwork";
import {
  opening,
  orderFor,
  peelDuration,
  peelLayout,
  shapes,
  windowOffset,
  type WindowStop,
} from "./model";

export function DissectionExperiment() {
  const clipPrefix = createUniqueId();
  const scene = createScene([{ label: "Pull apart", ms: peelDuration }]);
  const [width, setWidth] = createSignal(280);
  let stage!: HTMLDivElement;
  onMount(() => {
    const measure = () => setWidth(stage.clientWidth);
    measure();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) scene.seek(peelDuration);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });
  const fraction = () => scene.t() / peelDuration;
  const layout = createMemo(() => peelLayout(width(), fraction()));
  return (
    <Experiment
      id="svg-peel"
      scene={scene}
      timeline="Separation"
      caption={
        fraction() >= 0.9
          ? "Nothing new was drawn. These five pieces were here all along."
          : "It looks like one drawing."
      }
    >
      <div
        ref={stage}
        class="svg-peel-stage"
        data-peel-progress={fraction()}
        style={{ height: `${layout().height}px` }}
        role="group"
        aria-label="Five persistent layers of the drawing"
      >
        <For each={shapes}>
          {(shape, i) => (
            <div
              class="svg-plane"
              data-plane={shape.id}
              style={{
                transform: `translate(${layout().planes[i()].x}px, ${layout().planes[i()].y}px)`,
                width: `${layout().planes[i()].width}px`,
              }}
            >
              <svg viewBox="0 0 300 260" role="img" aria-label={shape.label}>
                <defs>
                  <clipPath id={`${clipPrefix}-${shape.id}`}>
                    <path d={opening} />
                  </clipPath>
                </defs>
                <g clip-path={shape.id === "frame" ? undefined : `url(#${clipPrefix}-${shape.id})`}>
                  <Shape id={shape.id} />
                </g>
              </svg>
              <span class="svg-plane-label" style={{ opacity: layout().planes[i()].labelOpacity }}>
                {i() + 1}. {shape.label}
              </span>
            </div>
          )}
        </For>
      </div>
    </Experiment>
  );
}

export function PaintOrderExperiment() {
  const [front, setFront] = createSignal(false);
  return (
    <Experiment
      id="svg-order"
      controls={
        <Choice
          label="Sun's place in the painting order"
          options={[
            { id: "behind", label: "Sun behind" },
            { id: "front", label: "Sun in front" },
          ]}
          value={front() ? "front" : "behind"}
          onChange={(id) => setFront(id === "front")}
        />
      }
      caption={
        <span aria-live="polite">
          {front()
            ? "The sun now covers the rear hill. Only its place in the order changed."
            : "The rear hill covers the bottom of the sun."}
        </span>
      }
    >
      <Artwork sunFront={front()} label="The sun and hills, painted in the selected order" />
      <div class="svg-order-strip">
        <span>First → last</span>
        <ol aria-label="Painting order">
          <For each={orderFor(front())}>
            {(id) => <li data-order={id}>{shapes.find((s) => s.id === id)!.label}</li>}
          </For>
        </ol>
      </div>
    </Experiment>
  );
}

export function ClippingExperiment() {
  const [stop, setStop] = createSignal<WindowStop>("center");
  const [inspection, setInspection] = createSignal(false);
  return (
    <Experiment
      id="svg-clip"
      controls={
        <Toolbar
          end={
            <Action pressed={inspection()} onClick={() => setInspection((v) => !v)}>
              Show beyond the window
            </Action>
          }
        >
          <Choice
            label="Window position"
            options={[
              { id: "left", label: "Left" },
              { id: "center", label: "Center" },
              { id: "right", label: "Right" },
            ]}
            value={stop()}
            onChange={setStop}
          />
        </Toolbar>
      }
      caption={
        <span aria-live="polite">
          {inspection()
            ? "Clipping is off: paint extends beyond the frame. The hills still cover part of the sun."
            : `The window is ${stop() === "center" ? "centered" : `on the ${stop()}`}. The sun and hills stay in the same place.`}
        </span>
      }
    >
      <Artwork
        offset={windowOffset(stop())}
        inspection={inspection()}
        label="Fixed scenery seen through a movable arch window"
      />
    </Experiment>
  );
}
