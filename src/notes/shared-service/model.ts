import type { Beat } from "../../post/scene/clock";
import type { CueName, CuePlan } from "../../kit/scene-audio";

export const CLIENTS = ["terminal", "web", "desktop", "script"] as const;
export type Client = (typeof CLIENTS)[number];
export const SESSIONS = ["flaky", "theme", "review"] as const;
export type SessionId = (typeof SESSIONS)[number];
export const CLIENT_LABEL: Readonly<Record<Client, string>> = {
  terminal: "Terminal",
  web: "Web",
  desktop: "Desktop",
  script: "review.ts",
};
export const SESSION_LABEL: Readonly<Record<SessionId, string>> = {
  flaky: "Fix flaky test",
  theme: "Add dark mode",
  review: "Review changes",
};
export type Request =
  | Readonly<{ kind: "create"; session: SessionId }>
  | Readonly<{ kind: "join"; session: "flaky" }>;
export type ServiceEvent =
  | Readonly<{ kind: "land" | "connect"; client: Client }>
  | Readonly<{ kind: "starting" }>
  | Readonly<{ kind: "running"; pid: 48213 }>
  | Readonly<{ kind: "send" | "arrive"; client: Client; request: Request }>
  | Readonly<{ kind: "finish" | "update"; session: SessionId }>
  | Readonly<{ kind: "deliver"; client: Client; session: SessionId }>;
export type Stamp = Readonly<{ id: string; atMs: number; event: ServiceEvent }>;
export type Flight = Readonly<{
  id: string;
  client: Client;
  session: SessionId;
  kind: "request" | "update";
  startMs: number;
  endMs: number;
}>;
export type ProcessState =
  | Readonly<{ kind: "stopped" | "starting" }>
  | Readonly<{ kind: "running"; pid: 48213 }>;
export type ClientState = Readonly<{
  landedAt?: number;
  connectedAt?: number;
  request?: Request;
  session?: SessionId;
  deliveredAt?: number;
}>;
export type SessionState = Readonly<{
  id: SessionId;
  arrivedAt: number;
  subscribers: readonly Client[];
  finishedAt?: number;
}>;
export type ServiceTrace = Readonly<{
  beats: readonly Beat[];
  stamps: readonly Stamp[];
  flights: readonly Flight[];
}>;
export type ServiceFrame = Readonly<{
  ms: number;
  process: ProcessState;
  clients: Readonly<Record<Client, ClientState>>;
  sessions: readonly SessionState[];
  flights: readonly (Flight & { readonly progress: number; readonly active: boolean })[];
  caption: string;
}>;

const beats: readonly Beat[] = [
  { label: "Start one service", ms: 3700 },
  { label: "Join the same work", ms: 2800 },
  { label: "Add separate work", ms: 4300 },
  { label: "Return to subscribers", ms: 6000 },
];
const stamp = (atMs: number, id: string, event: ServiceEvent): Stamp => ({ atMs, id, event });
const create = (session: SessionId): Request => ({ kind: "create", session });
const authored: readonly Stamp[] = [
  stamp(250, "terminal-land", { kind: "land", client: "terminal" }),
  stamp(900, "terminal-connect", { kind: "connect", client: "terminal" }),
  stamp(1050, "boot", { kind: "starting" }),
  stamp(2050, "running", { kind: "running", pid: 48213 }),
  stamp(2450, "terminal-send", { kind: "send", client: "terminal", request: create("flaky") }),
  stamp(3300, "terminal-arrive", { kind: "arrive", client: "terminal", request: create("flaky") }),
  stamp(3850, "web-land", { kind: "land", client: "web" }),
  stamp(4500, "web-connect", { kind: "connect", client: "web" }),
  stamp(4900, "web-send", {
    kind: "send",
    client: "web",
    request: { kind: "join", session: "flaky" },
  }),
  stamp(5750, "web-arrive", {
    kind: "arrive",
    client: "web",
    request: { kind: "join", session: "flaky" },
  }),
  stamp(6550, "desktop-land", { kind: "land", client: "desktop" }),
  stamp(7200, "desktop-connect", { kind: "connect", client: "desktop" }),
  stamp(7550, "desktop-send", { kind: "send", client: "desktop", request: create("theme") }),
  stamp(8400, "desktop-arrive", { kind: "arrive", client: "desktop", request: create("theme") }),
  stamp(8650, "script-land", { kind: "land", client: "script" }),
  stamp(9300, "script-connect", { kind: "connect", client: "script" }),
  stamp(9650, "script-send", { kind: "send", client: "script", request: create("review") }),
  stamp(10500, "script-arrive", { kind: "arrive", client: "script", request: create("review") }),
  stamp(11300, "theme-finish", { kind: "finish", session: "theme" }),
  stamp(11600, "theme-update", { kind: "update", session: "theme" }),
  stamp(13000, "review-finish", { kind: "finish", session: "review" }),
  stamp(13300, "review-update", { kind: "update", session: "review" }),
  stamp(14700, "flaky-finish", { kind: "finish", session: "flaky" }),
  stamp(15000, "flaky-update", { kind: "update", session: "flaky" }),
];

type State = {
  process: ProcessState;
  clients: Record<Client, ClientState>;
  sessions: Map<SessionId, SessionState>;
};
const initial = (): State => ({
  process: { kind: "stopped" },
  clients: { terminal: {}, web: {}, desktop: {}, script: {} },
  sessions: new Map(),
});
function requireEvent(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid service trace: ${message}`);
}

/** The same reducer validates construction and projects every seek. No retained playback state. */
function apply(state: State, { atMs, event: e }: Stamp): void {
  switch (e.kind) {
    case "land":
      requireEvent(state.clients[e.client].landedAt === undefined, "client landed twice");
      state.clients[e.client] = { landedAt: atMs };
      return;
    case "connect": {
      const c = state.clients[e.client];
      requireEvent(
        c.landedAt !== undefined && c.landedAt < atMs && c.connectedAt === undefined,
        "connection requires a landed client",
      );
      state.clients[e.client] = { ...c, connectedAt: atMs };
      return;
    }
    case "starting":
      requireEvent(
        state.process.kind === "stopped" && state.clients.terminal.connectedAt !== undefined,
        "boot requires Terminal contact",
      );
      state.process = { kind: "starting" };
      return;
    case "running":
      requireEvent(
        state.process.kind === "starting" && e.pid === 48213,
        "running requires one boot and illustrative PID",
      );
      state.process = { kind: "running", pid: e.pid };
      return;
    case "send": {
      const c = state.clients[e.client];
      requireEvent(
        state.process.kind === "running" && c.connectedAt !== undefined && !c.request,
        "send requires connection and running process",
      );
      requireEvent(SESSIONS.includes(e.request.session), "unknown session");
      requireEvent(
        e.request.kind === "create" || state.sessions.has(e.request.session),
        "join requires existing session",
      );
      state.clients[e.client] = { ...c, request: e.request };
      return;
    }
    case "arrive": {
      const c = state.clients[e.client],
        old = state.sessions.get(e.request.session);
      requireEvent(
        c.request?.kind === e.request.kind &&
          c.request?.session === e.request.session &&
          !c.session,
        "arrival requires matching request",
      );
      if (e.request.kind === "create") requireEvent(!old, "create cannot duplicate a session");
      else requireEvent(old && old.finishedAt === undefined, "join requires unfinished session");
      state.sessions.set(
        e.request.session,
        old
          ? { ...old, subscribers: [...old.subscribers, e.client] }
          : { id: e.request.session, arrivedAt: atMs, subscribers: [e.client] },
      );
      state.clients[e.client] = { ...c, session: e.request.session };
      return;
    }
    case "finish": {
      const session = state.sessions.get(e.session);
      requireEvent(
        session && session.finishedAt === undefined,
        "finish requires unfinished session",
      );
      state.sessions.set(e.session, { ...session, finishedAt: atMs });
      return;
    }
    case "update":
      requireEvent(
        state.sessions.get(e.session)?.finishedAt !== undefined,
        "update requires finished session",
      );
      return;
    case "deliver": {
      const session = state.sessions.get(e.session),
        c = state.clients[e.client];
      requireEvent(
        session?.finishedAt !== undefined &&
          session.subscribers.includes(e.client) &&
          c.session === e.session &&
          c.deliveredAt === undefined,
        "delivery requires a subscriber",
      );
      state.clients[e.client] = { ...c, deliveredAt: atMs };
      return;
    }
  }
}

/** Delivery recipients are captured from subscribers at dispatch, never broadcast to all clients. */
export function buildServiceTrace(input: readonly Stamp[] = authored): ServiceTrace {
  const state = initial(),
    stamps: Stamp[] = [],
    flights: Flight[] = [];
  const ids = new Set<string>(),
    sent = new Map<Client, Stamp>(),
    updated = new Set<SessionId>();
  let previous = -1;
  for (const s of input) {
    requireEvent(
      Number.isFinite(s.atMs) && s.atMs >= 0 && s.atMs >= previous,
      "times must be ordered finite milliseconds",
    );
    requireEvent(s.id.length > 0 && !ids.has(s.id), "stamp IDs must be unique");
    requireEvent(s.event.kind !== "deliver", "deliveries are compiled from subscribers");
    if ("client" in s.event) requireEvent(CLIENTS.includes(s.event.client), "unknown client");
    if ("session" in s.event) requireEvent(SESSIONS.includes(s.event.session), "unknown session");
    ids.add(s.id);
    previous = s.atMs;
    apply(state, s);
    stamps.push(s);
    if (s.event.kind === "send") sent.set(s.event.client, s);
    if (s.event.kind === "arrive") {
      const start = sent.get(s.event.client);
      requireEvent(start && start.atMs < s.atMs, "request must travel before arrival");
      flights.push({
        id: start.id,
        client: s.event.client,
        session: s.event.request.session,
        kind: "request",
        startMs: start.atMs,
        endMs: s.atMs,
      });
      sent.delete(s.event.client);
    }
    if (s.event.kind === "update") {
      requireEvent(!updated.has(s.event.session), "session update dispatched twice");
      updated.add(s.event.session);
      for (const client of state.sessions.get(s.event.session)!.subscribers) {
        const id = `${s.id}-${client}`;
        flights.push({
          id,
          client,
          session: s.event.session,
          kind: "update",
          startMs: s.atMs,
          endMs: s.atMs + 850,
        });
        stamps.push(stamp(s.atMs + 850, id, { kind: "deliver", client, session: s.event.session }));
      }
    }
  }
  requireEvent(sent.size === 0, "request has no arrival");
  stamps.sort((a, b) => a.atMs - b.atMs);
  const verified = initial(),
    finalIds = new Set<string>();
  for (const s of stamps) {
    requireEvent(!finalIds.has(s.id), "compiled stamp ID collision");
    finalIds.add(s.id);
    apply(verified, s);
  }
  const length = beats.reduce((sum, b) => sum + b.ms, 0);
  requireEvent(
    stamps.every((s) => s.atMs <= length),
    "event exceeds scene duration",
  );
  return Object.freeze({
    beats: Object.freeze(beats.map((b) => Object.freeze({ ...b }))),
    stamps: Object.freeze(
      stamps.map((s) =>
        Object.freeze({
          ...s,
          event: Object.freeze({
            ...s.event,
            ...("request" in s.event ? { request: Object.freeze({ ...s.event.request }) } : {}),
          }),
        }),
      ),
    ),
    flights: Object.freeze(flights.map((f) => Object.freeze(f))),
  });
}

function caption(e: ServiceEvent): string {
  switch (e.kind) {
    case "land":
      return `${CLIENT_LABEL[e.client]} opens. Its connection is being drawn to the service.`;
    case "connect":
      return `${CLIENT_LABEL[e.client]} is connected to the same service.`;
    case "starting":
      return "Terminal’s connection starts one background service. No session exists yet.";
    case "running":
      return "The service is running. PID 48213 is an illustrative process identifier; it stays the same.";
    case "send":
      return `${CLIENT_LABEL[e.client]} sends ${e.request.kind === "join" ? "a request to join" : "a request to start"} “${SESSION_LABEL[e.request.session]}”. The white packet travels down.`;
    case "arrive":
      return e.request.kind === "join"
        ? "Web’s request arrives. Web and Terminal now subscribe to the same “Fix flaky test” session. There is still only one row."
        : `${CLIENT_LABEL[e.client]}’s request arrives. “${SESSION_LABEL[e.request.session]}” now appears inside the service.`;
    case "finish":
      return `“${SESSION_LABEL[e.session]}” finishes inside the service. Its clients are still waiting for the update.`;
    case "update":
      return e.session === "flaky"
        ? "One shared session, two subscribers: its update travels up to Terminal and Web together."
        : `“${SESSION_LABEL[e.session]}” sends its update only to ${e.session === "theme" ? "Desktop" : "review.ts"}. The other clients keep waiting.`;
    case "deliver":
      return e.session === "flaky"
        ? "Terminal and Web receive the same completion together. Four clients, three sessions, one service."
        : `${CLIENT_LABEL[e.client]} receives “${SESSION_LABEL[e.session]}” complete. No other client receives that update.`;
  }
}

export function serviceAt(trace: ServiceTrace, ms: number): ServiceFrame {
  if (!Number.isFinite(ms)) throw new TypeError("Service time must be finite milliseconds");
  const state = initial();
  const time = Math.max(
    0,
    Math.min(
      trace.beats.reduce((sum, b) => sum + b.ms, 0),
      ms,
    ),
  );
  let current: ServiceEvent | undefined;
  for (const s of trace.stamps) {
    if (s.atMs > time) break;
    apply(state, s);
    current = s.event;
  }
  return {
    ms: time,
    process: state.process,
    clients: state.clients,
    sessions: [...state.sessions.values()],
    flights: trace.flights.map((f) => ({
      ...f,
      progress: Math.max(0, Math.min(1, (time - f.startMs) / (f.endMs - f.startMs))),
      active: time >= f.startMs && time < f.endMs,
    })),
    caption: current
      ? caption(current)
      : "Press Play. Terminal will open first and start a single service; the other windows will join it.",
  };
}

/** Original synthesis is owned by Experiment; this note supplies only semantic timings. */
export function serviceCues(trace: ServiceTrace): CuePlan {
  const cuesFor = (event: ServiceEvent): readonly CueName[] => {
    switch (event.kind) {
      case "land":
        return ["ready"];
      case "connect":
        return ["contact"];
      case "send":
        return ["send"];
      case "arrive":
        return ["contact", "appear"];
      case "running":
      case "finish":
        return ["complete"];
      case "deliver":
        return event.session === "flaky" ? ["contact", "complete"] : ["contact"];
      case "starting":
      case "update":
        return [];
    }
  };
  // A shared return is one audible arrival, even though it has two recipient wires.
  const seen = new Set<string>();
  return {
    events: trace.stamps.flatMap((s) =>
      cuesFor(s.event).flatMap((cue) => {
        const key = `${s.atMs}:${cue}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ id: `${s.id}:${cue}`, atMs: s.atMs, cue }];
      }),
    ),
    flights: trace.flights.map(({ startMs, endMs }) => ({ startMs, endMs })),
  };
}
