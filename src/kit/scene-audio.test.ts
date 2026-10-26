import { afterEach, expect, test } from "bun:test";
import { batch, createRoot, createSignal } from "solid-js";
import type { Scene } from "../post/scene/clock";
import { crossedCues, observeSceneAudio, type AudioSample, type CuePlan } from "./scene-audio";

const plan: CuePlan = {
  events: [
    { id: "one", atMs: 10, cue: "contact" },
    { id: "shared", atMs: 10, cue: "contact" },
    { id: "two", atMs: 20, cue: "complete" },
    { id: "three", atMs: 200, cue: "send" },
  ],
  flights: [{ startMs: 30, endMs: 90 }],
};
const sample = (time: number, changes: Partial<AudioSample> = {}): AudioSample => ({
  time,
  revision: 0,
  active: true,
  audible: true,
  ...changes,
});
test("crossings coalesce simultaneous semantics and reject all transport discontinuities", () => {
  expect(crossedCues(plan, sample(0), sample(20))).toEqual(["contact", "complete"]);
  expect(crossedCues(plan, sample(10), sample(20))).toEqual(["complete"]);
  for (const [previous, current] of [
    [undefined, sample(20)],
    [sample(0), sample(10, { revision: 1 })],
    [sample(0), sample(200)],
    [sample(20), sample(10)],
    [sample(10), sample(10)],
    [sample(0, { active: false }), sample(20)],
    [sample(0), sample(20, { active: false })],
    [sample(0, { audible: false }), sample(20)],
    [sample(0), sample(20, { audible: false })],
  ] as const)
    expect(crossedCues(plan, previous, current)).toEqual([]);
});

let dispose: (() => void) | undefined;
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  dispose?.();
  dispose = undefined;
  if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
  else Reflect.deleteProperty(globalThis, "window");
});
function setup(deferResume = false) {
  let starts = 0,
    stops = 0,
    closes = 0,
    contexts = 0;
  let resume!: () => void;
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = () => ({
    connect() {},
    disconnect() {},
    gain: param(),
    frequency: param(),
    start() {
      starts++;
    },
    stop() {
      stops++;
    },
    onended: null,
  });
  class Audio {
    state = "running";
    currentTime = 0;
    sampleRate = 1000;
    destination = {};
    constructor() {
      contexts++;
    }
    createGain = node;
    createBiquadFilter = node;
    createBufferSource = node;
    createOscillator = node;
    createBuffer() {
      return { getChannelData: () => new Float32Array(500) };
    }
    addEventListener() {}
    removeEventListener() {}
    resume() {
      return deferResume
        ? new Promise<void>((resolve) => {
            resume = resolve;
          })
        : Promise.resolve();
    }
    close() {
      closes++;
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: Audio },
  });
  return createRoot((cleanup) => {
    dispose = cleanup;
    const [time, setTime] = createSignal(0),
      [revision, setRevision] = createSignal(0),
      [active, setActive] = createSignal(true);
    const scene = { t: time, revision, active } as Scene;
    const audio = observeSceneAudio(scene, plan);
    return {
      audio,
      setTime,
      setRevision,
      setActive,
      resume: () => resume(),
      stats: () => ({ starts, stops, closes, contexts }),
    };
  });
}
test("observer is off until gesture, silent on tiny seeks, and cancels on every gate", async () => {
  const fixture = setup();
  fixture.setTime(1);
  expect(fixture.stats().contexts).toBe(0);
  await fixture.audio.toggle();
  expect(fixture.audio.status()).toBe("on");
  fixture.setTime(10);
  expect(fixture.stats().starts).toBe(1);
  batch(() => {
    fixture.setRevision(1);
    fixture.setTime(20);
  });
  expect(fixture.stats().stops).toBeGreaterThan(0);
  const count = fixture.stats().starts;
  fixture.setActive(false);
  fixture.setTime(200);
  fixture.setActive(true);
  expect(fixture.stats().starts).toBe(count);
  fixture.setTime(201);
  expect(fixture.stats().starts).toBe(count);
  await fixture.audio.toggle();
  expect(fixture.audio.status()).toBe("off");
  fixture.setTime(210);
  expect(fixture.stats().starts).toBe(count);
  dispose?.();
  dispose = undefined;
  expect(fixture.stats().closes).toBe(1);
});
test("mute and disposal invalidate a pending context resume", async () => {
  const fixture = setup(true);
  const enabling = fixture.audio.toggle();
  expect(fixture.audio.status()).toBe("enabling");
  await fixture.audio.toggle();
  fixture.resume();
  await enabling;
  expect(fixture.audio.status()).toBe("off");
  expect(fixture.stats().starts).toBe(0);
  const second = fixture.audio.toggle();
  dispose?.();
  dispose = undefined;
  fixture.resume();
  await second;
  expect(fixture.stats().starts).toBe(0);
  expect(fixture.stats().closes).toBe(1);
});
test("missing WebAudio reports unavailable without throwing", async () => {
  const fixture = setup();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  await fixture.audio.toggle();
  expect(fixture.audio.status()).toBe("unavailable");
  expect(fixture.stats().contexts).toBe(0);
});
