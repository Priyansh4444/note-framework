import { expect, test, type Page } from "./browser-test";
async function setup(page: Page) {
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const probe = { starts: 0, stops: 0, closed: 0, contexts: 0, live: 0 };
    Object.assign(window, { soundProbe: probe });
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor() {
        super();
        probe.contexts++;
      }
      override close() {
        probe.closed++;
        return super.close();
      }
    };
    for (const type of [OscillatorNode, AudioBufferSourceNode]) {
      const start = type.prototype.start,
        stop = type.prototype.stop;
      type.prototype.start = function (...args: Parameters<typeof start>) {
        probe.starts++;
        probe.live++;
        this.addEventListener("ended", () => probe.live--, { once: true });
        return Reflect.apply(start, this, args);
      };
      type.prototype.stop = function (...args: Parameters<typeof stop>) {
        probe.stops++;
        return stop.apply(this, args);
      };
    }
  });
  await page.addScriptTag({
    type: "module",
    content:
      'import {mountSceneAudioFixture} from "/visual/scene-audio.fixture.tsx";mountSceneAudioFixture();',
  });
  await expect(page.getByRole("button", { name: "Sound off", exact: true })).toBeVisible();
}
const probe = (page: Page) =>
  page.evaluate(() => ({
    ...(window as unknown as { soundProbe: Record<string, number> }).soundProbe,
  }));
const seek = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const fixture = await import("/visual/scene-audio.fixture.tsx");
    fixture.seekAudioFixture(ms);
  }, ms);

test("original synthesis produces bounded nonzero offline signal for every cue", async ({
  page,
}) => {
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  const levels = await page.evaluate(async () => {
    const { createCueBus } = await import("/src/kit/scene-audio.ts");
    const results = [];
    for (const cue of ["ready", "contact", "send", "appear", "complete"] as const) {
      const context = new OfflineAudioContext(1, 24000, 48000),
        bus = createCueBus(context);
      bus.cue(cue);
      const buffer = await context.startRendering(),
        samples = buffer.getChannelData(0);
      let peak = 0,
        energy = 0;
      for (const value of samples) {
        peak = Math.max(peak, Math.abs(value));
        energy += value * value;
      }
      bus.dispose();
      results.push({ cue, peak, rms: Math.sqrt(energy / samples.length) });
    }
    return results;
  });
  for (const level of levels) {
    expect(level.peak).toBeGreaterThan(0.0001);
    expect(level.peak).toBeLessThan(0.05);
    expect(level.rms).toBeGreaterThan(0.00001);
  }
  console.log(JSON.stringify({ offlineLevels: levels }));
});

test("sound is opt-in, seeks are silent, gates stop voices and resume never catches up", async ({
  page,
}) => {
  await setup(page);
  expect((await probe(page)).contexts).toBe(0);
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sound on", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await probe(page)).starts).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(async () => (await probe(page)).live).toBe(0);
  const before = await probe(page);
  for (const time of [249, 250, 251, 1499, 1500, 4000, 0]) await seek(page, time);
  expect((await probe(page)).starts).toBe(before.starts);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  // Raw active tiny seek crossing an authored event is synchronous and silent.
  const tiny = await page.evaluate(async () => {
    const f = await import("/visual/scene-audio.fixture.tsx"),
      p = (window as unknown as { soundProbe: { starts: number } }).soundProbe;
    f.seekAudioFixture(249);
    const before = p.starts;
    f.seekAudioFixture(250);
    return { before, after: p.starts };
  });
  expect(tiny.after).toBe(tiny.before);
  await page.evaluate(() => scrollTo(0, 1500));
  await expect(page.locator("figure")).toHaveAttribute("data-nk-scene-active", "false");
  await expect.poll(async () => (await probe(page)).live).toBe(0);
  const offscreen = await probe(page);
  await page.waitForTimeout(160);
  expect((await probe(page)).starts).toBe(offscreen.starts);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator("figure")).toHaveAttribute("data-nk-scene-active", "true");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  const muted = await probe(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(200);
  expect((await probe(page)).starts).toBe(muted.starts);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await page.locator("figure").screenshot({ path: "/tmp/service-curves/kit-sound-on.png" });
  await page.evaluate(async () => {
    (await import("/visual/scene-audio.fixture.tsx")).disposeAudioFixture();
  });
  await expect.poll(async () => (await probe(page)).live).toBe(0);
  expect((await probe(page)).closed).toBe(1);
});

test("hidden gate, replay and reduced-motion checkpoint steps remain silent", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(540);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("figure")).toHaveAttribute("data-nk-scene-active", "false");
  await expect.poll(async () => (await probe(page)).live).toBe(0);
  const hidden = await probe(page);
  await page.waitForTimeout(200);
  expect((await probe(page)).starts).toBe(hidden.starts);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const before = await probe(page);
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  expect((await probe(page)).starts).toBe(before.starts);
  await expect(page.locator("figure")).toHaveAttribute("data-nk-scene-active", "false");
});

test("unsupported audio has an honest disabled fallback", async ({ page }) => {
  await setup(page);
  await page.evaluate(() =>
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined }),
  );
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sound unavailable", exact: true })).toBeDisabled();
  await page
    .locator("figure")
    .screenshot({ path: "/tmp/service-curves/kit-sound-unavailable.png" });
});

test("simultaneous cue synthesis is capped at four voices and silence discards queued sources", async ({
  page,
}) => {
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  const bounded = await page.evaluate(async () => {
    const { createCueBus } = await import("/src/kit/scene-audio.ts");
    const context = new OfflineAudioContext(1, 12000, 48000);
    let sources = 0;
    const create = context.createOscillator.bind(context);
    context.createOscillator = () => {
      sources++;
      return create();
    };
    const bus = createCueBus(context);
    for (let i = 0; i < 40; i++) bus.cue("complete");
    bus.silence();
    const buffer = await context.startRendering();
    const peak = buffer
      .getChannelData(0)
      .reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
    bus.dispose();
    return { sources, peak };
  });
  expect(bounded.sources).toBe(8); // four dyads
  expect(bounded.peak).toBe(0);
});

test("real Service consumer exposes the sound button name in every enabled state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
  const off = page.getByRole("button", { name: "Sound off", exact: true });
  await expect(off).toBeVisible();
  await expect(off).toHaveAttribute("aria-label", "Sound off");
  await off.click();
  const on = page.getByRole("button", { name: "Sound on", exact: true });
  await expect(on).toBeVisible();
  await expect(on).toHaveAttribute("aria-pressed", "true");
  await page
    .locator("figure.nk-experiment")
    .screenshot({ path: "/tmp/service-curves/kit-service-sound-on-1440.png" });
  await on.click();
  await expect(page.getByRole("button", { name: "Sound off", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
