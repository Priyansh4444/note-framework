import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { Scene } from "../post/scene/clock";

export type CueName = "ready" | "contact" | "send" | "appear" | "complete";
export type CuePlan = Readonly<{
  events: readonly Readonly<{ id: string; atMs: number; cue: CueName }>[];
  flights: readonly Readonly<{ startMs: number; endMs: number }>[];
}>;
export type SoundStatus = "off" | "enabling" | "on" | "suspended" | "unavailable";
export interface SceneAudio {
  readonly status: Accessor<SoundStatus>;
  /** Called only by the Experiment's explicit sound button. */
  toggle(): Promise<void>;
}
export type AudioSample = Readonly<{
  time: number;
  revision: number;
  active: boolean;
  audible: boolean;
}>;

function uninterrupted(previous: AudioSample | undefined, current: AudioSample) {
  return (
    !!previous &&
    previous.active &&
    current.active &&
    previous.audible &&
    current.audible &&
    previous.revision === current.revision &&
    current.time >= previous.time &&
    current.time - previous.time <= 120
  );
}

/** Coalesce identical simultaneous semantics, including shared-client returns. */
export function crossedCues(
  plan: CuePlan,
  previous: AudioSample | undefined,
  current: AudioSample,
): CueName[] {
  if (!uninterrupted(previous, current)) return [];
  const simultaneous = new Set<string>();
  return plan.events
    .filter((event) => {
      if (event.atMs <= previous!.time || event.atMs > current.time) return false;
      const key = `${event.atMs}:${event.cue}`;
      if (simultaneous.has(key)) return false;
      simultaneous.add(key);
      return true;
    })
    .map((event) => event.cue);
}

type Voice = { stop(): void };
/** Original, bounded synthesis. Context time shapes envelopes; it never drives the model. */
export function createCueBus(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);
  const voices = new Set<Voice>();
  let flight: Voice | undefined;
  let disposed = false;
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 164;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    data[i] = seed / 2147483648;
  }

  function voice(
    duration: number,
    frequencies: readonly number[],
    amplitude: number,
    air = false,
    looping = false,
  ): Voice | undefined {
    if (disposed || voices.size >= 4) return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(master);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amplitude, now + 0.004);
    if (!looping) gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);
    const filter = air ? context.createBiquadFilter() : undefined;
    if (filter) {
      filter.type = "lowpass";
      filter.frequency.value = looping ? 950 : 1700;
      filter.connect(gain);
    }
    const sources: AudioScheduledSourceNode[] = [];
    if (air) {
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = looping;
      source.connect(filter!);
      sources.push(source);
    } else
      for (const frequency of frequencies) {
        const source = context.createOscillator();
        source.type = "sine";
        source.frequency.setValueAtTime(frequency, now);
        if (duration === 0.07)
          source.frequency.exponentialRampToValueAtTime(frequency * 1.45, now + duration);
        source.connect(gain);
        sources.push(source);
      }
    let stopped = false,
      ended = 0;
    const disconnect = () => {
      voices.delete(result);
      for (const source of sources) source.disconnect();
      filter?.disconnect();
      gain.disconnect();
    };
    const result: Voice = {
      stop: () => {
        const at = context.currentTime;
        // A suspended context must not keep a queued release to play on resume.
        if (context.state !== "running") {
          stopped = true;
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(0, at);
          for (const source of sources) source.stop(at);
          disconnect();
        } else {
          if (stopped) return;
          stopped = true;
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(Math.min(amplitude, gain.gain.value), at);
          gain.gain.linearRampToValueAtTime(0, at + 0.008);
          for (const source of sources) source.stop(at + 0.008);
        }
      },
    };
    voices.add(result);
    for (const source of sources) {
      source.onended = () => {
        if (++ended === sources.length) disconnect();
      };
      source.start(now);
      if (!looping) source.stop(now + duration + 0.002);
    }
    return result;
  }
  return {
    cue(name: CueName) {
      switch (name) {
        case "ready":
          voice(0.03, [], 0.16, true);
          break;
        case "contact":
          voice(0.055, [360], 0.11);
          break;
        case "send":
          voice(0.07, [520], 0.085);
          break;
        case "appear":
          voice(0.02, [740], 0.075);
          break;
        case "complete":
          voice(0.14, [440, 660], 0.065);
          break;
      }
    },
    flight(active: boolean) {
      if (active && !flight) flight = voice(0, [], 0.035, true, true);
      else if (!active && flight) {
        flight.stop();
        flight = undefined;
      }
    },
    silence() {
      for (const voice of voices) voice.stop();
      flight = undefined;
    },
    dispose() {
      disposed = true;
      // Disconnect immediately as well as stopping sources; no release can escape disposal.
      for (const voice of voices) voice.stop();
      master.disconnect();
    },
  };
}

/** Owned by Experiment. No host binding, scheduler, RAF, or audio preference storage. */
export function observeSceneAudio(scene: Scene, plan: CuePlan): SceneAudio {
  const [status, setStatus] = createSignal<SoundStatus>("off");
  let context: AudioContext | undefined;
  let bus: ReturnType<typeof createCueBus> | undefined;
  let previous: AudioSample | undefined;
  let desired = false,
    disposed = false,
    request = 0;
  const stateChanged = () => {
    bus?.silence();
    if (!desired || disposed) return;
    setStatus(
      context?.state === "running"
        ? "on"
        : context?.state === "closed"
          ? "unavailable"
          : "suspended",
    );
  };
  createEffect(() => {
    const current: AudioSample = {
      time: scene.t(),
      revision: scene.revision(),
      active: scene.active(),
      audible: status() === "on",
    };
    if (!uninterrupted(previous, current)) bus?.silence();
    else {
      for (const cue of crossedCues(plan, previous, current)) bus?.cue(cue);
      bus?.flight(
        plan.flights.some(
          (flight) => flight.startMs <= current.time && current.time < flight.endMs,
        ),
      );
    }
    previous = current;
  });
  onCleanup(() => {
    disposed = true;
    desired = false;
    request++;
    bus?.dispose();
    context?.removeEventListener("statechange", stateChanged);
    void context?.close().catch(() => {});
  });
  return {
    status,
    async toggle() {
      if (disposed) return;
      if (desired && status() !== "suspended") {
        desired = false;
        request++;
        bus?.silence();
        setStatus("off");
        return;
      }
      desired = true;
      const ticket = ++request;
      setStatus("enabling");
      try {
        if (!context) {
          const Audio = typeof window !== "undefined" ? window.AudioContext : undefined;
          if (!Audio) {
            desired = false;
            setStatus("unavailable");
            return;
          }
          context = new Audio();
          bus = createCueBus(context);
          context.addEventListener("statechange", stateChanged);
        }
        await context.resume();
        if (disposed || ticket !== request || !desired) return;
        // Async permission/resume is a new cursor, even if time advanced meanwhile.
        bus?.silence();
        previous = undefined;
        setStatus(context.state === "running" ? "on" : "suspended");
      } catch {
        if (disposed || ticket !== request) return;
        bus?.silence();
        setStatus(context ? "suspended" : "unavailable");
      }
    },
  };
}
