import { createMemo, createUniqueId, For, onMount } from "solid-js";
import { createScene, DiagramViewer, Experiment, Instrument } from "../../kit";
import {
  COMMANDS,
  d,
  fractionAt,
  LINES,
  lineThroughSlit,
  positionAt,
  stateAt,
  SLIT_REACH,
  STEP_FRACTIONS,
} from "./path-model";

const round = (n: number) => Math.round(n);

/** The slit is the figure's one position control: dragging it pauses and seeks the same clock. */
export function PathWriter() {
  const length = 6400;
  const scene = createScene([{ label: "Write the path", ms: length }]);
  const dots = createUniqueId();
  // Rest on the finished bell. Play writes it again from the first line.
  scene.seek(length);
  const position = createMemo(() => positionAt(scene.t() / length));
  const state = createMemo(() => stateAt(position()));
  const line = () => Math.min(LINES.length - 1, Math.floor(position()));
  const seekTo = (p: number) => {
    scene.pause();
    scene.seek(fractionAt(p) * length);
  };
  // The window of lines that read true, clipped to the source.
  const windowTop = () => Math.max(0, position() - SLIT_REACH);
  const windowBottom = () => Math.min(LINES.length, position() + SLIT_REACH);
  const slit = () => ({
    top: `${(windowTop() / LINES.length) * 100}%`,
    height: `${((windowBottom() - windowTop()) / LINES.length) * 100}%`,
  });
  const grip = () => ({
    top: `calc(${((position() - windowTop()) / (windowBottom() - windowTop() || 1)) * 100}% - 22px)`,
  });
  let column!: HTMLDivElement;
  let dragging: number | undefined;
  const fromPointer = (event: PointerEvent) => {
    const box = column.getBoundingClientRect();
    seekTo(((event.clientY - box.top) / box.height) * LINES.length);
  };
  const grab = (event: PointerEvent) => {
    // On touch, only the grip takes the drag, so the column above it still scrolls the page.
    if (event.pointerType === "touch" && !(event.target as Element).closest("[data-slit-grip]"))
      return;
    event.preventDefault();
    dragging = event.pointerId;
    column.setPointerCapture(event.pointerId);
    column.focus({ preventScroll: true });
    fromPointer(event);
  };
  onMount(() => {
    column.addEventListener("pointerdown", grab);
  });
  const keys: Record<string, (p: number) => number> = {
    // Seeking through time and back can land a hair off a line, so snap before stepping.
    ArrowDown: (p) => Math.floor(p + 1e-6) + 1,
    ArrowRight: (p) => Math.floor(p + 1e-6) + 1,
    ArrowUp: (p) => Math.ceil(p - 1e-6) - 1,
    ArrowLeft: (p) => Math.ceil(p - 1e-6) - 1,
    Home: () => 0,
    End: () => LINES.length,
  };
  return (
    <Experiment
      id="svg-path"
      scene={scene}
      stepTimes={STEP_FRACTIONS.map((fraction) => fraction * length)}
    >
      <Instrument
        name="PATH"
        hint="drag the slit down the source"
        model="B(u) = (1−u)³P₀ + 3(1−u)²uP₁ + 3(1−u)u²P₂ + u³P₃"
        params={`bell · ${COMMANDS} commands · viewBox 100`}
        live={
          <>
            {state().reached}/{COMMANDS} {state().letter} · pen {round(state().pen[0])}{" "}
            {round(state().pen[1])} · length {round(state().length)}
          </>
        }
      >
        <div class="svg-path-bench" data-path-position={position()}>
          <div
            ref={column}
            class="svg-path-source"
            role="slider"
            tabIndex={0}
            aria-label="Source line"
            aria-valuemin={0}
            aria-valuemax={LINES.length}
            aria-valuenow={Number(position().toFixed(2))}
            aria-valuetext={`Line ${line() + 1} of ${LINES.length}: ${LINES[line()].text.trim()}`}
            onPointerMove={(event) => {
              if (dragging === event.pointerId) fromPointer(event);
            }}
            onPointerUp={() => (dragging = undefined)}
            onPointerCancel={() => (dragging = undefined)}
            onKeyDown={(event) => {
              const next = keys[event.key];
              if (!next) return;
              event.preventDefault();
              seekTo(next(position()));
            }}
          >
            <For each={LINES}>
              {(_, i) => {
                const seen = () => lineThroughSlit(i(), position());
                return (
                  <div
                    class="svg-path-line"
                    data-open={seen().open >= 1}
                    data-reading={i() === line() ? "" : undefined}
                    data-command={LINES[i()].segment ? "" : undefined}
                    aria-hidden="true"
                  >
                    <span class="svg-path-number">{i() + 1}</span>
                    <span class="svg-path-text">
                      {seen().clear}
                      <span class="svg-path-noise">{seen().noise}</span>
                    </span>
                  </div>
                );
              }}
            </For>
            <div class="svg-path-slit" aria-hidden="true" style={slit()}>
              <span class="svg-path-grip" data-slit-grip style={grip()} />
            </div>
          </div>
          <DiagramViewer
            viewBox={[-6, -6, 112, 112]}
            label={`The bell as written so far: ${state().reached} of ${COMMANDS} commands.`}
          >
            <defs>
              <pattern id={dots} width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.28" class="svg-path-dot" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="100" height="100" fill={`url(#${dots})`} />
            <rect class="svg-path-frame" x="0" y="0" width="100" height="100" />
            <text class="nk-label svg-path-corner" x="1.5" y="3" dominant-baseline="hanging">
              0 0
            </text>
            <text class="nk-label svg-path-corner" x="98.5" y="97" text-anchor="end">
              100 100
            </text>
            <path class="svg-path-ghost" d={d} />
            <path
              class="svg-path-ink"
              data-path-ink
              d={state().ink || "M 50 10"}
              stroke-width={state().width}
              stroke-linejoin={state().join}
            />
            <g class="svg-path-pen" data-path-pen>
              <line x1="0" x2="100" y1={state().pen[1]} y2={state().pen[1]} />
              <line y1="0" y2="100" x1={state().pen[0]} x2={state().pen[0]} />
              <circle r="1.4" cx={state().pen[0]} cy={state().pen[1]} />
            </g>
          </DiagramViewer>
        </div>
      </Instrument>
    </Experiment>
  );
}
