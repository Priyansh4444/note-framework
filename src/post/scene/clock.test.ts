import { afterEach, expect, spyOn, test } from "bun:test";
import { createComputed, createRoot } from "solid-js";
import { createScene } from "./clock";

const originals = new Map<string, PropertyDescriptor | undefined>();
let dispose: (() => void) | undefined;
let clockSpy: ReturnType<typeof spyOn> | undefined;
const frames = new Map<number, FrameRequestCallback>();
let id = 0;
let motionChanged: (() => void) | undefined;
let reduced = false;
let mediaListeners = 0;

function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function setup(beats = [{ label: "Move", ms: 1000 }]) {
  id = 0;
  reduced = false;
  mediaListeners = 0;
  install("window", {
    matchMedia: () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_: string, listener: () => void) => {
        mediaListeners++;
        motionChanged = listener;
      },
      removeEventListener: () => {
        mediaListeners--;
        motionChanged = undefined;
      },
    }),
  });
  install("document", { hidden: false });
  install("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  install("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  clockSpy = spyOn(performance, "now").mockReturnValue(100);
  return createRoot((cleanup) => {
    dispose = cleanup;
    return createScene(beats);
  });
}

function frame(timestamp: number) {
  const next = frames.entries().next().value;
  if (!next) throw new Error("No animation frame scheduled");
  frames.delete(next[0]);
  next[1](timestamp);
}

afterEach(() => {
  dispose?.();
  clockSpy?.mockRestore();
  frames.clear();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

test("a first frame earlier than performance.now never makes scene time negative", () => {
  const scene = setup();
  scene.play();
  frame(90);
  expect(scene.t()).toBe(0);
  frame(110);
  expect(scene.t()).toBe(20);
});

test("normal playback, pause, resumed playback and endpoint clamping remain consistent", () => {
  const scene = setup();
  scene.play();
  frame(116);
  expect(scene.t()).toBe(16);
  scene.pause();
  frame(132);
  expect(scene.t()).toBe(16);
  scene.play();
  frame(116);
  expect(scene.t()).toBe(32);
  scene.seek(990);
  frame(180);
  expect(scene.t()).toBe(1000);
  expect(scene.playing()).toBe(false);
  expect(scene.ended()).toBe(true);
});

test("seekBeat lands at the end of that beat, not the start of the next", () => {
  const scene = setup([
    { label: "One", ms: 1000 },
    { label: "Two", ms: 500 },
    { label: "Three", ms: 500 },
  ]);
  scene.seekBeat(0);
  expect(scene.beat()).toBe(0);
  expect(scene.progress(0)).toBeGreaterThan(0.99);
  expect(scene.progress(1)).toBe(0);
  scene.seekBeat(1);
  expect(scene.beat()).toBe(1);
  expect(scene.playing()).toBe(false);
  scene.seekBeat(2);
  expect(scene.beat()).toBe(2);
  expect(scene.ended()).toBe(true);
});

test("a live reduced-motion preference pauses the current frame and cleans up its listener", () => {
  const scene = setup();
  scene.play();
  frame(116);
  reduced = true;
  motionChanged!();
  expect(scene.playing()).toBe(false);
  frame(132);
  expect(scene.t()).toBe(16);
  reduced = false;
  motionChanged!();
  expect(scene.playing()).toBe(false);
  dispose?.();
  expect(mediaListeners).toBe(0);
  dispose = undefined;
});

test("every discontinuity publishes time and revision as one atomic state", () => {
  const scene = setup();
  const states: { time: number; revision: number }[] = [];
  createRoot((cleanup) => {
    const previousDispose = dispose;
    dispose = () => {
      cleanup();
      previousDispose?.();
    };
    createComputed(() => states.push({ time: scene.t(), revision: scene.revision() }));
  });
  scene.seek(1);
  scene.seek(1);
  scene.seekBeat(0);
  scene.play(); // implicit restart at the endpoint
  scene.replay();
  expect(states).toEqual([
    { time: 0, revision: 0 },
    { time: 1, revision: 1 },
    { time: 1, revision: 2 },
    { time: 1000, revision: 3 },
    { time: 0, revision: 4 },
    { time: 0, revision: 5 },
  ]);
  frame(116);
  expect(scene.revision()).toBe(5);
  expect(scene.t()).toBe(16);
});

test("active reacts immediately to hidden and offscreen gates without a clock frame", () => {
  const scene = setup();
  const listeners = new Map<string, () => void>();
  install("document", {
    hidden: false,
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  });
  // Recreate with the event-capable document installed.
  dispose?.();
  let intersection: (entries: { isIntersecting: boolean }[]) => void = () => {};
  install(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersection) {
        intersection = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const gated = createRoot((cleanup) => {
    dispose = cleanup;
    return createScene([{ label: "Move", ms: 1000 }]);
  });
  gated.attach({} as HTMLElement);
  gated.play();
  expect(gated.active()).toBe(true);
  intersection([{ isIntersecting: false }]);
  expect(gated.playing()).toBe(true);
  expect(gated.active()).toBe(false);
  intersection([{ isIntersecting: true }]);
  expect(gated.active()).toBe(true);
  Object.assign(document, { hidden: true });
  listeners.get("visibilitychange")!();
  expect(gated.active()).toBe(false);
  Object.assign(document, { hidden: false });
  listeners.get("visibilitychange")!();
  expect(gated.active()).toBe(true);
  gated.pause();
  expect(gated.active()).toBe(false);
  dispose?.();
  dispose = undefined;
  expect(listeners.size).toBe(0);
  expect(scene.playing()).toBe(false);
});
