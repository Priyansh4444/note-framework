import { expect, test } from "./browser-test";

for (const width of [320, 390, 1440])
  test(`Service exposes one playback owner before its picture at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const root = page.locator("#service-experiment");
    await root
      .locator(".nk-experiment-question")
      .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    const play = root.getByRole("button", { name: "Play", exact: true });
    await expect(play).toHaveCount(1);
    const geometry = await root.evaluate((el) => {
      const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
      const action = box("[data-nk-scene-action]");
      const question = box(".nk-experiment-question");
      const timeline = box("[data-nk-timeline]");
      const stage = box(".nk-experiment-stage");
      const labels = [...el.querySelectorAll(".nk-timeline-label")].map((n) =>
        n.getBoundingClientRect(),
      );
      const words = [...el.querySelectorAll(".nk-timeline-label > span")].map((n) =>
        n.getBoundingClientRect(),
      );
      return {
        textGaps: words.slice(1).map((b, i) => b.left - words[i].right),
        phaseFont: Math.min(
          ...[...el.querySelectorAll(".nk-timeline-label")].map((n) =>
            parseFloat(getComputedStyle(n).fontSize),
          ),
        ),
        questionToAction: action.top - question.bottom,
        transportBottom: timeline.bottom,
        stageTop: stage.top,
        labelGaps: labels.slice(1).map((b, i) => b.left - labels[i].right),
        actionBottom: action.bottom,
        scrollY,
      };
    });
    expect(geometry.questionToAction).toBeLessThanOrEqual(24);
    expect(geometry.transportBottom).toBeLessThanOrEqual(geometry.stageTop - 12);
    expect(geometry.actionBottom).toBeLessThan(900);
    expect(Math.min(...geometry.labelGaps)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...geometry.textGaps)).toBeGreaterThanOrEqual(8);
    expect(geometry.phaseFont).toBeGreaterThanOrEqual(15);
    const nodes = await root.evaluateHandle((el) => [
      ...el.querySelectorAll(".ss-client,.ss-wire,.ss-packet,.ss-port-dot,.ss-session"),
    ]);
    await play.click();
    await expect(root.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect
      .poll(async () => Number(await root.getAttribute("data-nk-scene-time")))
      .toBeGreaterThan(500);
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(geometry.scrollY, 1);
    const terminal = root.locator('[data-client="terminal"]');
    await expect(terminal).not.toHaveAttribute("data-state", "absent");
    await root.getByRole("button", { name: "Pause", exact: true }).click();
    const paused = Number(await root.getAttribute("data-nk-scene-time"));
    await page.waitForTimeout(180);
    expect(Number(await root.getAttribute("data-nk-scene-time"))).toBe(paused);
    const slider = root.getByRole("slider", { name: "Service position", exact: true });
    await slider.press("End");
    await expect(root.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
    await root.getByRole("button", { name: "Replay", exact: true }).click();
    await expect
      .poll(async () => Number(await root.getAttribute("data-nk-scene-time")))
      .toBeGreaterThan(100);
    expect(Number(await root.getAttribute("data-nk-scene-time"))).toBeLessThan(2000);
    await root.getByRole("button", { name: "Pause", exact: true }).click();
    expect(
      await root.evaluate(
        (el, prior) =>
          prior.every(
            (node, i) =>
              node ===
              el.querySelectorAll(".ss-client,.ss-wire,.ss-packet,.ss-port-dot,.ss-session")[i],
          ),
        nodes,
      ),
    ).toBe(true);
    await expect(root.getByRole("button", { name: "Sound off", exact: true })).toBeVisible();
    await slider.press("End");
    await slider.press("End");
    await page.screenshot({ path: `artifacts/reading-motion/service-transport-${width}.png` });
    await nodes.dispose();
  });

test("Service keeps reduced-motion stepping and offscreen pause on its single scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
  const root = page.locator("#service-experiment");
  await root
    .locator(".nk-experiment-question")
    .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  await root.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => Number(await root.getAttribute("data-nk-scene-time")))
    .toBeGreaterThan(300);
  await page.evaluate(() => {
    const pad = document.createElement("div");
    pad.style.height = "1400px";
    document.body.append(pad);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await expect(root).toHaveAttribute("data-nk-scene-active", "false");
  const offscreen = Number(await root.getAttribute("data-nk-scene-time"));
  await page.waitForTimeout(200);
  expect(Number(await root.getAttribute("data-nk-scene-time"))).toBe(offscreen);
  await root
    .locator(".nk-experiment-question")
    .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  await expect
    .poll(async () => Number(await root.getAttribute("data-nk-scene-time")))
    .toBeGreaterThan(offscreen + 100);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const slider = root.getByRole("slider", { name: "Service position", exact: true });
  await slider.press("Home");
  await root.getByRole("button", { name: "Next step", exact: true }).click();
  expect(Number(await root.getAttribute("data-nk-scene-time"))).toBe(3700);
  await expect(root).toHaveAttribute("data-nk-scene-active", "false");
  await slider.press("End");
  await root.getByRole("button", { name: "Replay", exact: true }).click();
  expect(Number(await root.getAttribute("data-nk-scene-time"))).toBe(0);
});
