import { For } from "solid-js";
import { auditLayout } from "../../kit";
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

/** Only attributes and HTML text change. Cards, rows, ports, wires and packets stay mounted. */
export function ServiceFigure(props: { trace: ServiceTrace; frame: ServiceFrame }) {
  const session = (id: (typeof SESSIONS)[number]) => props.frame.sessions.find((s) => s.id === id);
  const wireProgress = (client: Client) => {
    const landed = props.frame.clients[client].landedAt;
    return landed === undefined ? 0 : clamp((props.frame.ms - landed - 220) / 430);
  };
  const flash = (client: Client, side: "client" | "service") => {
    const arrivals = props.trace.flights.filter(
      (f) =>
        f.client === client && (side === "service" ? f.kind === "request" : f.kind === "update"),
    );
    return arrivals.reduce(
      (glow, f) =>
        Math.max(glow, props.frame.ms >= f.endMs ? clamp(1 - (props.frame.ms - f.endMs) / 350) : 0),
      0,
    );
  };
  return (
    <div class="ss-figure">
      <p class="ss-scroll-hint" id="ss-scroll-hint">
        Four windows, one service.{" "}
        <span>Swipe sideways, or focus here and use the arrow keys.</span>
      </p>
      <div
        class="ss-scroll"
        role="region"
        tabIndex={0}
        aria-label="Four clients connected to one service"
        aria-describedby="ss-scroll-hint"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          e.currentTarget.scrollLeft += e.key === "ArrowRight" ? 140 : -140;
        }}
      >
        <div class="ss-diagram" data-service-diagram data-service-time={props.frame.ms}>
          <div
            class="ss-clients"
            {...auditLayout({ count: 4, align: "y-start", gaps: "x", separate: 16 })}
          >
            <For each={CLIENTS}>
              {(client) => {
                const state = () => props.frame.clients[client];
                const landed = () => state().landedAt !== undefined;
                const entrance = () =>
                  landed() ? clamp((props.frame.ms - state().landedAt!) / 220) : 0;
                const status = () =>
                  state().deliveredAt !== undefined
                    ? "Complete"
                    : state().session
                      ? "Watching"
                      : state().request
                        ? "Sent"
                        : state().connectedAt !== undefined
                          ? "Connected"
                          : "Opening";
                return (
                  <div class="ss-client-slot">
                    <section
                      class="ss-client"
                      aria-label={CLIENT_LABEL[client]}
                      aria-hidden={!landed()}
                      data-client={client}
                      data-state={landed() ? status() : "absent"}
                      style={{
                        visibility: landed() ? "visible" : "hidden",
                        opacity: entrance(),
                        transform: `translateY(${8 * (1 - entrance())}px)`,
                      }}
                    >
                      <div class="ss-client-heading">
                        <span class="ss-glyph" aria-hidden="true">
                          {GLYPH[client]}
                        </span>
                        <span>{CLIENT_LABEL[client]}</span>
                      </div>
                      <p class="ss-client-task">
                        {state().request
                          ? SESSION_LABEL[state().request!.session]
                          : "Opening a window"}
                      </p>
                      <p class="ss-client-status" data-complete={state().deliveredAt !== undefined}>
                        <span aria-hidden="true">
                          {state().deliveredAt !== undefined ? "✓" : "·"}
                        </span>{" "}
                        {status()}
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
                        const y = () =>
                          1 +
                          94 *
                            (flight.kind === "request" ? frame().progress : 1 - frame().progress);
                        return (
                          <path
                            class="ss-packet"
                            data-packet={flight.id}
                            data-kind={flight.kind}
                            data-active={frame().active}
                            d="M10 -0.5 V0.5"
                            transform={`translate(0 ${y()})`}
                            stroke-width="7"
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
                  />
                  <i
                    class="ss-arrival ss-arrival-client"
                    style={{ opacity: flash(client, "client") * 0.35 }}
                  />
                  <i
                    class="ss-arrival ss-arrival-service"
                    style={{ opacity: flash(client, "service") * 0.35 }}
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
                  {props.frame.process.kind === "running"
                    ? `PID ${props.frame.process.pid} · illustrative`
                    : "One process for every window"}
                </span>
              </div>
              <span class="ss-process-state">
                <i aria-hidden="true" />
                {props.frame.process.kind === "running"
                  ? "Running"
                  : props.frame.process.kind === "starting"
                    ? "Starting"
                    : "Stopped"}
              </span>
            </header>
            <div class="ss-sessions">
              <p
                class="ss-empty"
                style={{ visibility: props.frame.sessions.length ? "hidden" : "visible" }}
              >
                Sessions appear when requests arrive.
              </p>
              <div
                class="ss-session-rows"
                {...auditLayout({ count: 3, align: "x-start", gaps: "y" })}
              >
                <For each={SESSIONS}>
                  {(id) => (
                    <div
                      class="ss-session"
                      data-session={id}
                      data-state={
                        !session(id)
                          ? "absent"
                          : session(id)!.finishedAt !== undefined
                            ? "complete"
                            : "working"
                      }
                      aria-hidden={!session(id)}
                    >
                      <div
                        class="ss-session-content"
                        style={{ visibility: session(id) ? "visible" : "hidden" }}
                      >
                        <div>
                          <span class="ss-session-title">{SESSION_LABEL[id]}</span>
                          <span class="ss-subscribers">
                            Watching:{" "}
                            <span class="ss-subscriber-names">
                              {session(id)
                                ?.subscribers.map((c) => CLIENT_LABEL[c])
                                .join(" + ")}
                            </span>
                          </span>
                        </div>
                        <span class="ss-session-status">
                          {session(id)?.finishedAt !== undefined ? "Complete" : "Working"}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
