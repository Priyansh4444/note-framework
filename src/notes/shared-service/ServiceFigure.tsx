import { For, Show } from "solid-js";
import { auditLayout, springCurve, tip } from "../../kit";
import {
  CLIENTS,
  CLIENT_LABEL,
  SESSIONS,
  SESSION_LABEL,
  type Client,
  type ServiceFrame,
  type ServiceTrace,
} from "./model";

const GLYPH: Readonly<Record<Client, string>> = {
  terminal: ">_",
  web: "▤",
  desktop: "□",
  script: "{}",
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Things that land overshoot and settle. All of it is read from the scene clock, so it seeks. */
const land = springCurve({ visualDuration: 0.42, bounce: 0.38 });
const pop = springCurve({ visualDuration: 0.3, bounce: 0.5 });
const settle = springCurve({ visualDuration: 0.45, bounce: 0 });
const smooth = (u: number) => u * u * (3 - 2 * u);
const WIRE_DELAY = 200;

/** A working arc turns; when the work ends it closes into a check that draws itself. */
function Progress(props: { ms: number; since?: number; doneAt?: number }) {
  const done = () => (props.doneAt === undefined ? 0 : clamp(settle(props.ms - props.doneAt)));
  const appear = () => (props.since === undefined ? 0 : clamp((props.ms - props.since) / 180));
  return (
    <svg class="ss-progress" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        class="ss-arc"
        cx="8"
        cy="8"
        r="5.5"
        pathLength="1"
        stroke-dasharray="0.3 0.7"
        transform={`rotate(${(props.ms * 0.36) % 360} 8 8)`}
        opacity={appear() * (1 - done())}
      />
      <path
        class="ss-check"
        d="M3.5 8.5 7 12l5.5-7.5"
        pathLength="1"
        stroke-dasharray="1"
        stroke-dashoffset={1 - done()}
      />
    </svg>
  );
}

/** Only attributes and text change. Cards, rows, ports, wires and packets stay mounted. */
export function ServiceFigure(props: { trace: ServiceTrace; frame: ServiceFrame }) {
  const session = (id: (typeof SESSIONS)[number]) => props.frame.sessions.find((s) => s.id === id);
  const ms = () => props.frame.ms;
  const arrivedAt = (client: Client) =>
    props.trace.stamps.find((s) => s.event.kind === "arrive" && s.event.client === client)?.atMs;
  const wireProgress = (client: Client) => {
    const landed = props.frame.clients[client].landedAt;
    return landed === undefined ? 0 : clamp(settle(ms() - landed - WIRE_DELAY));
  };
  /** A soft bloom where a packet arrives. */
  const glow = (client: Client, side: "client" | "service") =>
    props.trace.flights
      .filter(
        (f) =>
          f.client === client && (side === "service" ? f.kind === "request" : f.kind === "update"),
      )
      .reduce(
        (peak, f) => Math.max(peak, ms() >= f.endMs ? (1 - clamp((ms() - f.endMs) / 520)) ** 2 : 0),
        0,
      );
  const running = () => props.frame.process.kind === "running";
  const runningSince = () =>
    props.trace.stamps.find((s) => s.event.kind === "running")?.atMs ?? Infinity;
  return (
    <div class="ss-figure">
      <div
        class="ss-diagram"
        role="group"
        aria-label="Four clients connected to one service"
        data-service-diagram
        data-service-time={ms()}
      >
        <div
          class="ss-clients"
          {...auditLayout({ count: 4, align: "y-start", gaps: "x", separate: 6 })}
        >
          <For each={CLIENTS}>
            {(client) => {
              const state = () => props.frame.clients[client];
              const landed = () => state().landedAt !== undefined;
              const since = () => ms() - (state().landedAt ?? 0);
              const drop = () => (landed() ? 1 - land(since()) : 1);
              const status = () =>
                state().deliveredAt !== undefined
                  ? "Done"
                  : state().session
                    ? "Joined"
                    : state().request
                      ? "Sent"
                      : state().connectedAt !== undefined
                        ? "Online"
                        : "Opening";
              const resting = () =>
                state().deliveredAt === undefined ? 0 : settle(ms() - state().deliveredAt! - 500);
              return (
                <div class="ss-client-slot">
                  {/* The closed window's name sits exactly where the open card's heading lands. */}
                  <div
                    class="ss-client-ghost"
                    aria-hidden="true"
                    style={{ opacity: landed() ? 1 - clamp(since() / 110) : 1 }}
                  >
                    <div class="ss-client-heading">
                      <span class="ss-glyph">{GLYPH[client]}</span>
                      <span>{CLIENT_LABEL[client]}</span>
                    </div>
                  </div>
                  <section
                    class="ss-client"
                    aria-label={CLIENT_LABEL[client]}
                    aria-hidden={!landed()}
                    data-client={client}
                    data-state={landed() ? status() : "absent"}
                    style={{
                      visibility: landed() ? "visible" : "hidden",
                      opacity: clamp(since() / 110) * (1 - 0.38 * resting()),
                      transform: `translateY(${-24 * drop()}px)`,
                      "--ss-pulse": clamp(1 - since() / 640) ** 2,
                      "--ss-bloom": glow(client, "client"),
                    }}
                  >
                    <div class="ss-client-heading">
                      <span class="ss-glyph" aria-hidden="true">
                        {GLYPH[client]}
                      </span>
                      <span>{CLIENT_LABEL[client]}</span>
                    </div>
                    <p class="ss-client-task">
                      {state().request ? SESSION_LABEL[state().request!.session] : "\u00a0"}
                    </p>
                    <p class="ss-client-status" data-complete={state().deliveredAt !== undefined}>
                      <Progress
                        ms={ms()}
                        since={
                          arrivedAt(client) !== undefined && state().session
                            ? arrivedAt(client)
                            : undefined
                        }
                        doneAt={state().deliveredAt}
                      />
                      <span class="ss-word">{status()}</span>
                    </p>
                  </section>
                </div>
              );
            }}
          </For>
        </div>
        <div class="ss-port-columns" aria-hidden="true">
          <For each={CLIENTS}>
            {(client) => (
              <div class="ss-port-column" data-wire={client}>
                <svg class="ss-wires" viewBox="0 0 20 96" preserveAspectRatio="none">
                  <path
                    class="ss-wire"
                    d="M10 1 V95"
                    pathLength="1"
                    stroke-dasharray="1"
                    stroke-dashoffset={1 - wireProgress(client)}
                  />
                  <For each={props.trace.flights.filter((f) => f.client === client)}>
                    {(flight) => {
                      const frame = () => props.frame.flights.find((f) => f.id === flight.id)!;
                      // Ease the trip, and stretch the comet with its speed: 0 at each end.
                      const eased = () => smooth(frame().progress);
                      const speed = () => 6 * frame().progress * (1 - frame().progress);
                      const y = () => 1 + 94 * (flight.kind === "request" ? eased() : 1 - eased());
                      const tail = () => 2 + 15 * speed();
                      const back = () => (flight.kind === "request" ? -tail() : tail());
                      return (
                        <path
                          class="ss-packet"
                          data-packet={flight.id}
                          data-kind={flight.kind}
                          data-active={frame().active}
                          d={`M10 ${back()} V0`}
                          transform={`translate(0 ${y()})`}
                          stroke-linecap="round"
                          opacity={frame().active ? 1 : 0}
                        />
                      );
                    }}
                  </For>
                </svg>
                <i class="ss-port-dot ss-port-client" data-connected={wireProgress(client) > 0} />
                <i
                  class="ss-port-dot ss-port-service"
                  data-connected={wireProgress(client) === 1}
                  style={{ transform: `scale(${1 + 0.9 * glow(client, "service")})` }}
                />
                <i
                  class="ss-arrival ss-arrival-client"
                  style={{ opacity: glow(client, "client") }}
                />
                <i
                  class="ss-arrival ss-arrival-service"
                  style={{ opacity: glow(client, "service") }}
                />
              </div>
            )}
          </For>
        </div>
        <section
          class="ss-service"
          aria-label="One illustrative background service"
          data-process={props.frame.process.kind}
        >
          <header class="ss-service-header">
            <div>
              <span class="ss-service-name">Background service</span>
              <span class="ss-pid">
                {running()
                  ? `PID ${props.frame.process.kind === "running" ? props.frame.process.pid : ""} · illustrative`
                  : "One process for every window"}
              </span>
            </div>
            <span class="ss-process-state">
              <Show
                when={props.frame.process.kind === "starting"}
                fallback={
                  <i
                    aria-hidden="true"
                    style={{
                      transform: `scale(${running() ? 0.4 + 0.6 * pop(ms() - runningSince()) : 1})`,
                    }}
                  />
                }
              >
                <Progress ms={ms()} since={0} />
              </Show>
              {running()
                ? "Running"
                : props.frame.process.kind === "starting"
                  ? "Starting"
                  : "Stopped"}
            </span>
          </header>
          <div class="ss-sessions">
            <p class="ss-empty" style={{ opacity: props.frame.sessions.length ? 0 : 1 }}>
              Sessions appear when requests arrive.
            </p>
            <div
              class="ss-session-rows"
              {...auditLayout({ count: 3, align: "x-start", gaps: "y" })}
            >
              <For each={SESSIONS}>
                {(id) => {
                  const row = () => session(id);
                  const since = () => ms() - (row()?.arrivedAt ?? 0);
                  const rest = () =>
                    row()?.finishedAt === undefined ? 0 : settle(ms() - row()!.finishedAt! - 900);
                  return (
                    <div
                      class="ss-session"
                      data-session={id}
                      data-state={
                        !row() ? "absent" : row()!.finishedAt !== undefined ? "complete" : "working"
                      }
                      aria-hidden={!row()}
                    >
                      <div
                        class="ss-session-content"
                        style={{
                          visibility: row() ? "visible" : "hidden",
                          opacity: clamp(since() / 140) * (1 - 0.38 * rest()),
                          transform: `translateY(${10 * (1 - land(since()))}px)`,
                        }}
                      >
                        <span class="ss-session-title">{SESSION_LABEL[id]}</span>
                        <span class="ss-subscribers">
                          <span class="ss-word">Watching: </span>
                          <span class="ss-subscriber-names">
                            <For each={CLIENTS}>
                              {(client) => {
                                const joined = () => row()?.subscribers.includes(client) ?? false;
                                return (
                                  <span
                                    class="ss-subscriber"
                                    aria-hidden="true"
                                    {...tip(() => CLIENT_LABEL[client])}
                                    hidden={!joined()}
                                    style={{
                                      transform: `scale(${joined() ? pop(ms() - (arrivedAt(client) ?? 0)) : 0})`,
                                    }}
                                  >
                                    {GLYPH[client]}
                                  </span>
                                );
                              }}
                            </For>
                            <span class="ss-word">
                              {row()
                                ?.subscribers.map((c) => CLIENT_LABEL[c])
                                .join(" + ")}
                            </span>
                          </span>
                        </span>
                        <span class="ss-session-status">
                          <Progress ms={ms()} since={row()?.arrivedAt} doneAt={row()?.finishedAt} />
                          <span class="ss-word">
                            {row()?.finishedAt !== undefined ? "Complete" : "Working"}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
