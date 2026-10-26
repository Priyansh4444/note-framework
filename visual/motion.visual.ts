import { expect, test } from "./browser-test";
import { measureDocument } from "../scripts/audit-measure";

test("drag and real WAAPI release frames stay attached to the native thumb", async ({ page }) => {
  await page.goto("/components", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Keep the one real fixture visible; the audit's hit testing may scroll targets.
  await page.addStyleTag({ content: ".ui-case:not([data-case=range]) { display:none }" });
  const root = page.locator('[data-case="range"]');
  const input = root.locator("input");
  await input.scrollIntoViewIfNeeded();
  const box = (await input.boundingBox())!;
  const start = box.x + 8 + 0.4 * (box.width - 16);
  await page.mouse.move(start, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(start + 100, box.y + 22, { steps: 8 });
  await expect
    .poll(() => root.evaluate((el) => el.getAnimations({ subtree: true }).length))
    .toBe(0);
  const value = await input.inputValue();
  expect(Number(value)).toBeGreaterThan(0.4);
  expect(
    (await page.evaluate(measureDocument)).findings.filter(
      (f) => f.kind === "failure" && f.rule.startsWith("parameter-"),
    ),
  ).toEqual([]);
  await expect(root).toHaveScreenshot("slider-drag.png", { animations: "allow" });
  await page.mouse.up();
  await root.evaluate((el) => {
    const animations = el.getAnimations({ subtree: true });
    if (animations.length !== 1)
      throw Error(`Expected one contour animation, got ${animations.length}`);
    animations[0].pause();
    animations[0].currentTime = 0;
  });
  for (const ms of [0, 60, 120]) {
    await root.evaluate((el, ms) => {
      el.getAnimations({ subtree: true })[0].currentTime = ms;
    }, ms);
    await expect(input).toHaveValue(value);
    expect(
      (await page.evaluate(measureDocument)).findings.filter(
        (f) => f.kind === "failure" && f.rule.startsWith("parameter-"),
      ),
    ).toEqual([]);
    await expect(root).toHaveScreenshot(`slider-release-${ms}.png`, { animations: "allow" });
  }
  // Let the actual owner complete; no synthetic timer assumes compositor progress.
  await root.evaluate((el) => {
    el.getAnimations({ subtree: true })[0].play();
  });
  await expect
    .poll(() => root.evaluate((el) => el.getAnimations({ subtree: true }).length))
    .toBe(0);
  await expect(input).toHaveValue(value);
  await expect(root).toHaveScreenshot("slider-release-rest.png", { animations: "allow" });
});
