import { expect, test } from "./browser-test";
import { railPoint, scrubTo } from "./scene-control";

test("play continues from the curve position chosen by the slider", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction");
  const slider = root.getByRole("slider", { name: "Curve playback", exact: true });
  await scrubTo(page, slider, 0.72);
  expect((await inspectCurve(page)).t).toBeCloseTo(0.72, 4);
  await root.locator("[data-nk-scene-action]").click();
  const value = (await inspectCurve(page)).t;
  expect(value).toBeGreaterThanOrEqual(0.72);
  expect(value).toBeLessThan(0.85);
});

test("grabbing the curve slider pauses playback on pointer down", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction"),
    slider = root.getByRole("slider", { name: "Curve playback", exact: true });
  await slider.scrollIntoViewIfNeeded();
  await root.locator("[data-nk-scene-action]").click();
  await expect(root).not.toHaveAttribute("data-nk-scene-time", "0");
  const grab = await railPoint(slider, (await inspectCurve(page)).t);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await expect(root.locator("[data-nk-scene-action]")).toHaveAttribute(
    "data-nk-scene-action",
    "play",
  );
  const held = await root.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(160);
  await expect(root).toHaveAttribute("data-nk-scene-time", held!);
  await page.mouse.up();
});

async function inspectCurve(page: import("@playwright/test").Page) {
  return page.locator("#construction").evaluate((el) => {
    const points = [...el.querySelectorAll<SVGCircleElement>(".bz-dot")].map((n) => [
      Number(n.getAttribute("cx")),
      Number(n.getAttribute("cy")),
    ]);
    const t =
      Number(el.getAttribute("data-nk-scene-time")) /
      Number(el.getAttribute("data-nk-scene-length"));
    const w = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
    const expected = [0, 1].map((axis) =>
      w.reduce((sum, weight, i) => sum + weight * points[i][axis], 0),
    );
    const dot = el.querySelector(".bz-point")!;
    return {
      t,
      expected,
      actual: [Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy"))],
      position:
        Number(el.querySelector(".nk-timeline-slider")!.getAttribute("aria-valuenow")) /
        Number(el.getAttribute("data-nk-scene-length")),
    };
  });
}

test("pointer scrubbing and curve geometry share the same clock", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction"),
    slider = root.getByRole("slider", { name: "Curve playback", exact: true });
  await expect(root.locator("[data-nk-timeline]")).toHaveCount(1);
  for (const value of [0.13, 0.5, 0.87]) {
    await scrubTo(page, slider, value);
    const state = await inspectCurve(page);
    expect(state.t).toBeCloseTo(value, 4);
    expect(state.position).toBeCloseTo(value, 4);
    state.actual.forEach((value, i) => expect(value).toBeCloseTo(state.expected[i], 6));
  }
  await slider.focus();
  await slider.press("Home");
  expect((await inspectCurve(page)).t).toBe(0);
  await slider.press("End");
  expect((await inspectCurve(page)).t).toBe(1);
});

test("the curved scene scrubber keyboard seeks the measured curve point", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction");
  const slider = root.getByRole("slider", { name: "Curve playback", exact: true });
  await expect(slider).toHaveAttribute("aria-orientation", "horizontal");
  await expect(root.locator(".nk-timeline-thumb")).toHaveCount(1);
  expect(await root.locator(".nk-timeline-thumb").evaluate((el) => el.tagName.toLowerCase())).toBe(
    "path",
  );
  for (const key of ["Home", "ArrowRight", "End", "ArrowLeft"]) {
    await slider.press(key);
    const state = await inspectCurve(page);
    expect(state.position).toBeCloseTo(state.t, 2);
    state.actual.forEach((value, i) => expect(value).toBeCloseTo(state.expected[i], 6));
    expect(Number(await slider.getAttribute("aria-valuenow"))).toBeCloseTo(
      state.t * Number(await root.getAttribute("data-nk-scene-length")),
      4,
    );
  }
  const held = await root.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(100);
  await expect(root).toHaveAttribute("data-nk-scene-time", held!);
});

test("reduced-motion playback stays still while manual seeking remains usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction"),
    slider = root.getByRole("slider", { name: "Curve playback", exact: true });
  expect((await inspectCurve(page)).t).toBe(1);
  await scrubTo(page, slider, 0.4);
  expect((await inspectCurve(page)).t).toBeCloseTo(0.4, 4);
  const time = await root.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(160);
  await expect(root).toHaveAttribute("data-nk-scene-time", time!);
  await root.locator("[data-nk-scene-action]").click();
  await expect(root.locator("[data-nk-scene-action]")).toHaveAttribute(
    "data-nk-scene-action",
    "play",
  );
});

test("line mixing, weights and subdivisions keep their measured models during playback", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  // The more detailed weights explanation is intentionally folded on the beginner page.
  await page.locator("#weight-experiment").evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p instanceof HTMLDetailsElement) p.open = true;
  });
  for (const selector of [
    "#mix figure[data-nk-scene]",
    "#weight-experiment",
    "#flatten-experiment",
  ]) {
    const root = page.locator(selector).first();
    await root.scrollIntoViewIfNeeded();
    const action = root.locator("[data-nk-scene-action]");
    await action.click();
    await expect(action).toHaveAttribute("data-nk-scene-action", "pause");
    const before = await root.getAttribute("data-nk-scene-time");
    await expect.poll(() => root.getAttribute("data-nk-scene-time")).not.toBe(before);
    await action.click();
    const time = await root.getAttribute("data-nk-scene-time");
    await page.waitForTimeout(100);
    await expect(root).toHaveAttribute("data-nk-scene-time", time!);
    expect(await root.locator("[data-nk-timeline]").count()).toBe(1);
    const model = await root.evaluate((el) => {
      const position = Number(
        el.querySelector(".nk-timeline-slider")!.getAttribute("aria-valuenow"),
      );
      const t =
        Number(el.getAttribute("data-nk-scene-time")) /
        Number(el.getAttribute("data-nk-scene-length"));
      const sum = el.querySelector(".bz-weights-sum dd")?.textContent;
      const point = el.querySelector<SVGCircleElement>(".bz-point");
      const end = el.querySelector<SVGLineElement>(".bz-mix-done");
      const chordDots = [...el.querySelectorAll<SVGCircleElement>(".bz-chord-dot")].filter(
        (n) =>
          getComputedStyle(n).display !== "none" && getComputedStyle(n).visibility !== "hidden",
      );
      return {
        t,
        position,
        length: Number(el.getAttribute("data-nk-scene-length")),
        pieces: Number(el.querySelector(".bz-piece-count")?.textContent),
        sum: sum ? Number(sum) : null,
        point: point ? [Number(point.getAttribute("cx")), Number(point.getAttribute("cy"))] : null,
        lineEnd: end ? [Number(end.getAttribute("x2")), Number(end.getAttribute("y2"))] : null,
        chords: chordDots.length,
      };
    });
    if (selector.startsWith("#mix")) {
      expect(model.point![0]).toBeCloseTo(80 + 400 * model.t, 5);
      expect(model.point![1]).toBeCloseTo(120 - 60 * model.t, 5);
      expect(model.lineEnd).toEqual(model.point);
    } else if (selector.startsWith("#weight")) expect(model.sum).toBeCloseTo(1, 3);
    else {
      expect(model.position).toBeCloseTo(model.t * model.length, 6);
      expect(model.pieces).toBe(Math.min(32, Math.floor(model.t * 32) + 1));
      expect(model.chords).toBe(model.pieces + 1);
    }
  }
});

test("explanations open smoothly and keep native reduced-motion behavior", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const details = page.locator("#mix .bz-deeper").first();
  const summary = details.locator(":scope > summary");
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  const first = await details.evaluate((el) => el.getBoundingClientRect().height);
  await page.waitForTimeout(280);
  const open = await details.evaluate((el) => el.getBoundingClientRect().height);
  expect(open).toBeGreaterThan(first + 2);
  await expect(details).toHaveAttribute("open", "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await summary.click();
  await expect(details).not.toHaveAttribute("open", "");
  await summary.click();
  const reduced = await details.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    animations: el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
  }));
  expect(reduced.height).toBeCloseTo(open, 0);
  expect(reduced.animations).toBe(0);
});

test("end offers Replay and resets the same curve and timeline together", async ({ page }) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#construction");
  await root.getByRole("slider", { name: "Curve playback", exact: true }).press("End");
  expect((await inspectCurve(page)).t).toBe(1);
  const action = root.locator("[data-nk-scene-action]");
  await expect(action).toHaveText("Replay");
  await action.click();
  expect((await inspectCurve(page)).t).toBeLessThan(0.1);
  await action.click();
  const state = await inspectCurve(page);
  state.actual.forEach((value, i) => expect(value).toBeCloseTo(state.expected[i], 6));
});

test("mix labels stay separate throughout the sweep, including coincident endpoints", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const root = page.locator("#mix figure[data-nk-scene]");
  const slider = root.getByRole("slider", { name: "Mix playback", exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let step = 0; step <= 40; step++) {
      await scrubTo(page, slider, step / 40);
      const boxes = await root.locator(".nk-experiment-stage text").evaluateAll((elements) =>
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
          };
        }),
      );
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          expect(
            overlapX <= 1 || overlapY <= 1,
            `${a.text}/${b.text} at ${step / 40}, ${width}px`,
          ).toBe(true);
        }
    }
  }
});

test("curved refinement keeps exact whole-piece bins, endpoints and keyboard", async ({ page }) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment");
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await expect(root.locator(".bz-piece-count")).toHaveText("4");
  await expect(slider).toHaveAttribute("aria-valuemin", "0");
  await expect(slider).toHaveAttribute("aria-valuemax", "9600");
  // Retain the fine probes on either side of the old percentage input's bin boundaries.
  for (const fraction of [0.031, 0.032, 0.499, 0.501, 0.999]) {
    await scrubTo(page, slider, fraction);
    const n = Math.min(32, Math.floor(fraction * 32) + 1);
    await expect(root.locator(".bz-piece-count")).toHaveText(String(n));
    expect(await root.locator('.bz-chord-dot[visibility="visible"]').count()).toBe(n + 1);
    expect(Number(await root.getAttribute("data-nk-scene-time")) / 9600).toBeCloseTo(fraction, 4);
  }
  // Beat buttons select exact starts, including the n=17 boundary; arrows move 1%.
  for (const [beat, keys, fraction] of [
    ["1–8 pieces", [], 0],
    ["1–8 pieces", ["ArrowRight", "ArrowRight", "ArrowRight"], 0.03],
    ["1–8 pieces", ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"], 0.04],
    ["17–24 pieces", ["ArrowLeft"], 0.49],
    ["17–24 pieces", [], 0.5],
    ["17–24 pieces", ["ArrowRight"], 0.51],
    ["End", ["ArrowLeft"], 0.99],
    ["End", [], 1],
  ] as const) {
    await root.getByRole("button", { name: beat, exact: false }).click();
    for (const key of keys) await slider.press(key);
    const n = Math.min(32, Math.floor(fraction * 32) + 1);
    await expect(root.locator(".bz-piece-count")).toHaveText(String(n));
    expect(await root.locator('.bz-chord-dot[visibility="visible"]').count()).toBe(n + 1);
    expect(Number(await root.getAttribute("data-nk-scene-time"))).toBeCloseTo(fraction * 9600, 6);
    await expect(slider).toHaveAttribute(
      "aria-valuetext",
      new RegExp(`${Math.round(fraction * 100)} percent$`),
    );
  }
  for (const [key, fraction, n] of [
    ["Home", 0, "1"],
    ["ArrowRight", 0.01, "1"],
    ["End", 1, "32"],
    ["ArrowLeft", 0.99, "32"],
  ] as const) {
    await slider.press(key);
    expect(Number(await slider.getAttribute("aria-valuenow"))).toBeCloseTo(fraction * 9600, 6);
    await expect(root.locator(".bz-piece-count")).toHaveText(n);
    await expect(root.locator("[data-nk-scene-action]")).not.toHaveAttribute(
      "data-nk-scene-action",
      "pause",
    );
  }
});
