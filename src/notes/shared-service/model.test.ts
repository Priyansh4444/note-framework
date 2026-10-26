import { describe, expect, test } from "bun:test";
import { buildServiceTrace, CLIENTS, serviceAt, serviceCues, type Stamp } from "./model";

const trace = buildServiceTrace();
const input = trace.stamps.filter((s) => s.event.kind !== "deliver");
const duration = trace.beats.reduce((sum, b) => sum + b.ms, 0);
const samples = [
  ...new Set([
    0,
    duration,
    ...trace.stamps.flatMap((s, i) => [
      Math.max(0, s.atMs - 0.01),
      s.atMs,
      s.atMs + 0.01,
      (s.atMs + (trace.stamps[i + 1]?.atMs ?? duration)) / 2,
    ]),
  ]),
];

describe("one service, three sessions, subscriber-only delivery", () => {
  test("four checkpoints keep the causal stamps off the compact timeline", () => {
    expect(trace.beats).toHaveLength(4);
    expect(trace.stamps.length).toBeGreaterThan(20);
    expect(trace.flights).toHaveLength(8);
    expect(new Set(trace.stamps.map((s) => s.id)).size).toBe(trace.stamps.length);
    expect(Object.isFrozen(trace.stamps[0])).toBe(true);
  });

  test("every boundary and midpoint agrees with the event history", () => {
    for (const ms of samples) {
      const frame = serviceAt(trace, ms),
        occurred = trace.stamps.filter((s) => s.atMs <= ms);
      const creates = occurred.filter(
        (s) => s.event.kind === "arrive" && s.event.request.kind === "create",
      );
      expect(frame.sessions).toHaveLength(creates.length);
      for (const session of frame.sessions) {
        const subscribers = occurred.flatMap((s) =>
          s.event.kind === "arrive" && s.event.request.session === session.id
            ? [s.event.client]
            : [],
        );
        expect(session.subscribers).toEqual(subscribers);
        expect(session.finishedAt).toBe(
          occurred.find((s) => s.event.kind === "finish" && s.event.session === session.id)?.atMs,
        );
      }
      for (const client of CLIENTS) {
        const delivered = occurred.find(
          (s) => s.event.kind === "deliver" && s.event.client === client,
        );
        expect(frame.clients[client].deliveredAt).toBe(delivered?.atMs);
        const event = delivered?.event;
        if (event?.kind === "deliver") {
          expect(frame.sessions.find((s) => s.id === event.session)?.subscribers).toContain(client);
        }
      }
      expect(frame.sessions.length).toBeLessThanOrEqual(3);
      if (frame.process.kind === "running") expect(frame.process.pid).toBe(48213);
      for (const flight of frame.flights) {
        expect(flight.progress).toBeGreaterThanOrEqual(0);
        expect(flight.progress).toBeLessThanOrEqual(1);
        expect(flight.active).toBe(ms >= flight.startMs && ms < flight.endMs);
      }
    }
  });

  test("a session and its new subscriber exist exactly at request arrival", () => {
    for (const flight of trace.flights.filter((f) => f.kind === "request")) {
      const before = serviceAt(trace, flight.endMs - 0.001),
        at = serviceAt(trace, flight.endMs);
      expect(before.clients[flight.client].session).toBeUndefined();
      expect(at.clients[flight.client].session).toBe(flight.session);
      if (flight.client !== "web")
        expect(before.sessions.find((s) => s.id === flight.session)).toBeUndefined();
      expect(at.sessions.find((s) => s.id === flight.session)?.subscribers).toContain(
        flight.client,
      );
      const midway = serviceAt(trace, (flight.startMs + flight.endMs) / 2).flights.find(
        (f) => f.id === flight.id,
      )!;
      expect(midway.progress).toBe(0.5);
      expect(midway.active).toBe(true);
    }
    expect(serviceAt(trace, 5750).sessions).toHaveLength(1);
    expect(serviceAt(trace, 5750).sessions[0].subscribers).toEqual(["terminal", "web"]);
  });

  test("completion in the service precedes receipt, in the specified order", () => {
    const returns = trace.flights.filter((f) => f.kind === "update");
    expect(returns.map((f) => f.client)).toEqual(["desktop", "script", "terminal", "web"]);
    expect(returns[2].startMs).toBe(returns[3].startMs);
    expect(returns[2].endMs).toBe(returns[3].endMs);
    for (const flight of returns) {
      expect(
        serviceAt(trace, flight.startMs).sessions.find((s) => s.id === flight.session)?.finishedAt,
      ).toBeDefined();
      expect(
        serviceAt(trace, flight.endMs - 0.001).clients[flight.client].deliveredAt,
      ).toBeUndefined();
      expect(serviceAt(trace, flight.endMs).clients[flight.client].deliveredAt).toBe(flight.endMs);
    }
  });

  test("backward and arbitrary seeks preserve old frames and reconstruct identical state", () => {
    const original = serviceAt(trace, 5750),
      saved = structuredClone(original);
    const expected = new Map(samples.map((ms) => [ms, serviceAt(trace, ms)]));
    for (const ms of [...samples].reverse())
      expect(serviceAt(trace, ms)).toEqual(expected.get(ms)!);
    for (const ms of [15850, 0, 8400, 3300, 5750, duration, 250])
      expect(serviceAt(trace, ms)).toEqual(serviceAt(buildServiceTrace(), ms));
    expect(original).toEqual(saved);
    expect(serviceAt(trace, -100)).toEqual(serviceAt(trace, 0));
    expect(serviceAt(trace, 1e9)).toEqual(serviceAt(trace, duration));
    for (const ms of [NaN, Infinity, -Infinity])
      expect(() => serviceAt(trace, ms)).toThrow("finite");
  });

  test("sound cues and flight intervals derive only from the visual trace", () => {
    const cues = serviceCues(trace);
    expect(cues.flights).toEqual(trace.flights.map(({ startMs, endMs }) => ({ startMs, endMs })));
    for (const cue of cues.events)
      expect(trace.stamps.some((s) => cue.id.startsWith(`${s.id}:`) && s.atMs === cue.atMs)).toBe(
        true,
      );
    expect(cues.events.filter((e) => e.atMs === 15850).map((e) => e.cue)).toEqual([
      "contact",
      "complete",
    ]);
    expect(cues.events.filter((e) => e.atMs === 5750).map((e) => e.cue)).toEqual([
      "contact",
      "appear",
    ]);
    expect(cues.events.find((e) => e.atMs === 2050)?.cue).toBe("complete");
  });
});

test("construction rejects malformed and causally impossible traces", () => {
  const replace = (id: string, patch: Partial<Stamp>) =>
    input.map((s) => (s.id === id ? { ...s, ...patch } : s));
  expect(() => buildServiceTrace(replace("terminal-land", { atMs: NaN }))).toThrow("finite");
  expect(() => buildServiceTrace(replace("terminal-connect", { id: "terminal-land" }))).toThrow(
    "unique",
  );
  expect(() => buildServiceTrace([...input].reverse())).toThrow();
  expect(() => buildServiceTrace(input.filter((s) => s.id !== "running"))).toThrow("running");
  expect(() => buildServiceTrace(input.filter((s) => s.id !== "terminal-arrive"))).toThrow(
    "existing session",
  );
  expect(() => buildServiceTrace(input.filter((s) => s.id !== "script-arrive"))).toThrow();
  expect(() =>
    buildServiceTrace(
      replace("web-arrive", {
        event: { kind: "arrive", client: "web", request: { kind: "create", session: "flaky" } },
      }),
    ),
  ).toThrow("matching request");
  expect(
    () =>
      buildServiceTrace(
        replace("web-send", {
          event: { kind: "send", client: "web", request: { kind: "create", session: "flaky" } },
        }),
      ).stamps,
  ).toThrow();
  expect(() =>
    buildServiceTrace(
      replace("theme-update", { event: { kind: "deliver", client: "terminal", session: "theme" } }),
    ),
  ).toThrow("compiled");
  expect(() =>
    buildServiceTrace(
      replace("terminal-land", { event: { kind: "land", client: "unknown" } as never }),
    ),
  ).toThrow("unknown client");
});
