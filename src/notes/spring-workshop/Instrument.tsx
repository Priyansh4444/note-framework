import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  untrack,
  type JSX,
} from "solid-js";
import { createScene } from "../../kit";
import * as g from "./geometry";
import { clampStroke, response, rest, safeRelease, tuning, type Feel, type Pose } from "./model";
import order from "./paint-order.json";
import * as kit from "./vendor/iso-kit";
import type { SolidPaths } from "./vendor/iso-kit";

function Rod(props: { paths: SolidPaths }) {
  return (
    <g class="iso-solid">
      <path class="iso-fill" d={props.paths.fill} />
      <For each={[0, 1, 2, 3]}>
        {(i) => <path class="iso-shade" data-shade={i} d={props.paths.shades[i]} />}
      </For>
      <path class="iso-top" d={props.paths.top} />
      <path class="iso-line iso-edge" data-tone="hi" d={props.paths.outline} />
    </g>
  );
}
const paintParts = order.map((entry) => {
  const part = g.parts.find((p) => p.id === entry.id);
  if (!part && entry.id !== "spring" && entry.id !== "rod")
    throw new Error(`Unknown generated part ${entry.id}`);
  return { ...entry, part };
});

export function SpringInstrument() {
  const scene = createScene([{ label: "Return to center", ms: 6000 }]);
  const [feel, setFeel] = createSignal<Feel>("bounce");
  const [initial, setInitial] = createSignal<Pose>(rest);
  const [held, setHeld] = createSignal<Pose | null>(null);
  const [reduced, setReduced] = createSignal(false);
  const [paper, setPaper] = createSignal(false);
  const [announcement, announce] = createSignal("");
  const [choice, setChoice] = createSignal(
    "At center. Arrow keys move the carriage; Space releases it.",
  );
  const pose = createMemo(
    () => held() ?? response(initial(), scene.t() / 1000, tuning[feel()].ratio),
  );
  const coil = createMemo(() => g.spring(pose().x));
  const rod = createMemo(() => g.rod(pose().x));
  const ordered = createMemo(() => {
    const lift = kit.depthOf([pose().x, 0, 0], g.P);
    const key = (entry: (typeof paintParts)[number]) =>
      entry.key + (entry.motion === "carriage" ? lift : entry.motion === "half" ? lift / 2 : 0);
    return [...paintParts].sort((a, b) => key(a) - key(b));
  });
  const point = () => ({
    x: g.gripPoint[0] + g.axis[0] * pose().x,
    y: g.gripPoint[1] + g.axis[1] * pose().x,
  });
  let root!: HTMLElement, svg!: SVGSVGElement;
  let drag: { id: number; pointer: number; at: number; lastX: number; time: number } | undefined;
  let knob!: HTMLDivElement;
  const say = () =>
    setChoice(
      `${pose().x.toFixed(1)} millimeters from center. Arrow keys move; Space releases; Escape holds.`,
    );
  onMount(() => {
    scene.attach(root);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReduced(media.matches);
      if (media.matches && !held())
        batch(() => {
          scene.pause();
          setInitial(rest);
          scene.seek(0);
        });
    };
    change();
    media.addEventListener("change", change);
    onCleanup(() => media.removeEventListener("change", change));
  });
  createEffect(() => {
    const p = pose();
    if (scene.playing() && Math.abs(p.x) < 0.005 && Math.abs(p.v) < 0.05) {
      batch(() => {
        scene.pause();
        setInitial(rest);
        scene.seek(0);
      });
      announce("Settled at center.");
      setChoice("At center. Arrow keys move the carriage; Space releases it.");
    }
  });
  const run = (p: Pose) =>
    batch(() => {
      scene.pause();
      setHeld(null);
      setInitial(reduced() ? rest : safeRelease(p));
      scene.seek(0);
      if (!reduced()) scene.play();
      announce(reduced() ? "At center. Motion reduced." : "Released. Returning to center.");
      setChoice(
        reduced()
          ? "At center. Motion reduced."
          : `Released from ${p.x.toFixed(1)} millimeters. Returning to center. Arrow keys hold; Space releases.`,
      );
    });
  const hold = () => {
    const p = untrack(pose);
    batch(() => {
      scene.pause();
      setHeld({ x: p.x, v: 0 });
    });
    say();
    return p;
  };
  const select = (next: Feel) => {
    const p = untrack(pose),
      wasHeld = !!held(),
      wasPlaying = scene.playing();
    batch(() => {
      scene.pause();
      setFeel(next);
      setInitial(p);
      scene.seek(0);
      if (wasHeld) setHeld(p);
      else if (wasPlaying && !reduced()) scene.play();
    });
    announce(`${tuning[next].label}. ${tuning[next].why}`);
  };
  const axisAt = (event: PointerEvent) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return 0;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return (
      ((p.x - g.gripPoint[0]) * g.axis[0] + (p.y - g.gripPoint[1]) * g.axis[1]) /
      (g.axis[0] ** 2 + g.axis[1] ** 2)
    );
  };
  const down: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const p = hold();
    drag = {
      id: event.pointerId,
      pointer: axisAt(event),
      at: p.x,
      lastX: p.x,
      time: event.timeStamp,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  };
  const move: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const x = clampStroke(drag.at + axisAt(event) - drag.pointer);
    const dt = Math.max(8, event.timeStamp - drag.time) / 1000;
    setHeld({ x, v: (x - drag.lastX) / dt });
    drag.lastX = x;
    drag.time = event.timeStamp;
    say();
  };
  const up: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const p = untrack(pose),
      idle = event.timeStamp - drag.time > 90;
    drag = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    run({ x: p.x, v: idle ? 0 : p.v });
  };
  const cancel = () => {
    if (drag) {
      drag = undefined;
      const p = untrack(pose);
      setHeld({ x: p.x, v: 0 });
      say();
    }
  };
  const key: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        " ",
        "Enter",
        "Escape",
      ].includes(event.key)
    )
      event.preventDefault();
    else return;
    if (event.key === " " || event.key === "Enter") {
      run(untrack(pose));
      return;
    }
    if (event.key === "Escape") {
      hold();
      if (drag && knob.hasPointerCapture(drag.id)) knob.releasePointerCapture(drag.id);
      drag = undefined;
      return;
    }
    const p = hold();
    const x =
      event.key === "Home"
        ? -30
        : event.key === "End"
          ? 30
          : clampStroke(
              p.x +
                (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1) *
                  (event.shiftKey ? 10 : 2),
            );
    setHeld({ x, v: 0 });
    say();
  };
  const changeTheme = () => setPaper((v) => !v);
  return (
    <figure
      ref={root}
      id="spring-instrument"
      class="nk-experiment spring-instrument"
      data-x={pose().x}
      data-v={pose().v}
      data-time={scene.t()}
      data-active={scene.active()}
      data-held={!!held()}
    >
      <div class="spring-toolbar">
        <div class="spring-feels" role="group" aria-label="Damping">
          <For each={Object.entries(tuning)}>
            {([id, value]) => (
              <button type="button" aria-pressed={feel() === id} onClick={() => select(id as Feel)}>
                {value.label}
              </button>
            )}
          </For>
        </div>
        <button type="button" onClick={changeTheme} aria-pressed={paper()}>
          Paper {paper() ? "on" : "off"}
        </button>
      </div>
      <div class="iso spring-card" data-theme={paper() ? "light" : "dark"}>
        <div class="spring-card-top">
          <span>Fig. 01</span>
          <span>Spring & damper</span>
        </div>
        <div class="spring-stage">
          <div class="spring-canvas">
            <svg
              ref={svg}
              class="iso-svg iso-figure"
              viewBox={`0 0 ${g.width} ${g.height}`}
              role="img"
              aria-label="A spring-loaded metal carriage on two rails, joined to a damper and a dial measuring its displacement."
            >
              <path class="iso-halo" d={g.shadow} />
              <For each={ordered()}>
                {(entry) => (
                  <g
                    data-part={entry.id === "spring" || entry.id === "rod" ? entry.id : undefined}
                    data-solid={entry.part?.id}
                    transform={entry.motion === "carriage" ? g.translate(pose().x) : undefined}
                  >
                    {entry.part ? (
                      <g innerHTML={entry.part.html} />
                    ) : entry.id === "rod" ? (
                      <Rod paths={rod()} />
                    ) : (
                      <>
                        <path class="iso-line" data-tone="lo" d={coil().back} />
                        <path class="iso-line" data-tone="hi" d={coil().front} />
                        <g class="iso-dots" data-tone="mid">
                          <circle
                            cx={g.at([-83, 3.6, 26])[0]}
                            cy={g.at([-83, 3.6, 26])[1]}
                            r=".8"
                          />
                          <circle
                            cx={g.at([pose().x - 26, 3.6, 26])[0]}
                            cy={g.at([pose().x - 26, 3.6, 26])[1]}
                            r=".8"
                          />
                        </g>
                      </>
                    )}
                  </g>
                )}
              </For>
              <path class="iso-line" data-tone="lit" data-free="" d={g.needle(pose().x)} />
              <circle
                class="spring-needle-hub"
                cx={g.at([50, 47, 23.2])[0]}
                cy={g.at([50, 47, 23.2])[1]}
                r="1.6"
              />
              <path class="iso-line" data-tone="hi" d={g.zero} />
            </svg>
            <div
              ref={knob}
              class="spring-grip"
              role="slider"
              tabindex="0"
              aria-label="Carriage displacement"
              aria-valuemin={-30}
              aria-valuemax={30}
              aria-valuenow={Number(pose().x.toFixed(1))}
              aria-valuetext={choice()}
              aria-describedby="spring-hint"
              style={{
                left: `${(point().x / g.width) * 100}%`,
                top: `${(point().y / g.height) * 100}%`,
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onLostPointerCapture={cancel}
              onKeyDown={key}
              onFocus={say}
            />
          </div>
        </div>
        <div class="spring-card-bottom">
          <span id="spring-hint">Drag the round grip. Release.</span>
          <output aria-label="Displacement">
            {(Math.abs(pose().x) < 0.05 ? 0 : pose().x).toFixed(1)} mm
          </output>
        </div>
      </div>
      <div class="spring-footer">
        <button type="button" onClick={() => run({ x: pose().x, v: pose().v + 200 })}>
          Give it a nudge
        </button>
        <button
          type="button"
          onClick={() => {
            const p = hold();
            setHeld({ x: p.x, v: 0 });
          }}
        >
          Hold still
        </button>
        <span>{held() ? "Held" : scene.playing() ? "Returning" : "At center"}</span>
      </div>
      <figcaption>
        <p>{tuning[feel()].why}</p>
        <p>Grab it again while it moves. The next release begins where your hand leaves it.</p>
      </figcaption>
      <span class="spring-sr" role="status">
        {announcement()}
      </span>
    </figure>
  );
}
