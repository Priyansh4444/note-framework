import { expect, test, type Page } from "./browser-test";

const NOTE = "/notes/framework-demo";
const tooltip = (page: Page) => page.locator("#nk-reader-tooltip");
const top = (page: Page) =>
  tooltip(page).evaluate((el) => Math.round(el.getBoundingClientRect().top));

async function placeAt(page: Page, name: string, y: number) {
  const term = page.locator(".term", { hasText: name }).first();
  await term.evaluate((el, y) => {
    scrollBy({ top: el.getClientRects()[0].top - y, behavior: "instant" });
  }, y);
  await page.waitForTimeout(220);
  return term.evaluate((el) => {
    const r = el.getClientRects()[0];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(NOTE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
});

test("a reminder holds still: no position change while the pointer moves within its link", async ({
  page,
}) => {
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toBeVisible();
  await page.waitForTimeout(160);
  const first = await top(page);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(at.x + (i % 2 ? -8 : 8), at.y + (i % 2 ? -2 : 2));
    await page.waitForTimeout(30);
    expect(await top(page)).toBe(first);
  }
});

test("moving between links never slides the reminder and keeps it on one side", async ({
  page,
}) => {
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toHaveAttribute("data-ready", "true");
  expect(await tooltip(page).getAttribute("data-side")).toBe("top");
  const next = await page
    .locator(".term", { hasText: "de Casteljau" })
    .first()
    .evaluate((el) => {
      const r = el.getClientRects()[0];
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  const before = await top(page);
  await page.mouse.move(next.x, next.y);
  await page.waitForTimeout(40);
  // Whatever frame we catch, it is at the old place or the new one, with nothing in between.
  const samples: number[] = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await top(page));
    await page.waitForTimeout(16);
  }
  expect(new Set(samples).size).toBe(1);
  expect(await tooltip(page).getAttribute("data-side")).toBe("top");
  expect(samples[0]).not.toBeNaN();
  expect(before).not.toBeNaN();
  await expect(tooltip(page)).toContainText("Casteljau");
});

test("position is never animated", async ({ page }) => {
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toHaveAttribute("data-ready", "true");
  const transition = await tooltip(page).evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(transition).not.toMatch(/top|left|all/);
});

test("skimming across a link opens nothing; resting on it does", async ({ page }) => {
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await page.mouse.move(at.x, at.y + 200);
  await page.waitForTimeout(250);
  await expect(tooltip(page)).toBeHidden();
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toBeVisible();
});

test("a reminder on a wrapped term sits on the line the pointer entered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const wrapped = page.locator(".term", { hasText: "linear interpolation" }).first();
  await wrapped.evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" });
  });
  await page.waitForTimeout(220);
  const lines = await wrapped.evaluate((el) =>
    [...el.getClientRects()].map((r) => ({ x: r.x + r.width / 2, y: r.y, bottom: r.bottom })),
  );
  const line = lines.at(-1)!;
  await page.mouse.move(line.x, line.y + 6);
  await expect(tooltip(page)).toHaveAttribute("data-ready", "true");
  const box = await tooltip(page).boundingBox();
  const side = await tooltip(page).getAttribute("data-side");
  const gap = side === "top" ? line.y - (box!.y + box!.height) : box!.y - line.bottom;
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(14);
});

test("scrolling closes a hovered reminder, and a resting pointer does not reopen it", async ({
  page,
}) => {
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toBeVisible();
  await page.mouse.wheel(0, 12);
  await expect(tooltip(page)).toBeHidden();
  await page.waitForTimeout(350);
  await expect(tooltip(page)).toBeHidden();
});

test("keyboard focus opens at once, survives a scroll and returning; Escape closes it", async ({
  page,
}) => {
  await placeAt(page, "control points", 420);
  const term = page.locator(".term", { hasText: "control points" }).first();
  // The focusable just before the term, so these are the keys a reader actually presses.
  const before = page.locator("#nest .nk-chapter-n");
  await before.focus();
  await page.keyboard.press("Tab");
  await expect(term).toBeFocused();
  await expect(tooltip(page)).toBeVisible();
  await page.mouse.wheel(0, 12);
  await page.waitForTimeout(120);
  await expect(tooltip(page)).toBeVisible();
  // Away and straight back, faster than the close delay.
  await page.keyboard.press("Shift+Tab");
  await expect(before).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(term).toBeFocused();
  await page.waitForTimeout(200);
  await expect(tooltip(page)).toBeVisible();
  // Away for longer than the close delay, then back.
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(200);
  await expect(tooltip(page)).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(tooltip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toBeHidden();
});

test("reduced motion shows the reminder without a transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const at = await placeAt(page, "control points", 420);
  await page.mouse.move(at.x, at.y);
  await expect(tooltip(page)).toHaveAttribute("data-ready", "true");
  const style = await tooltip(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { duration: s.transitionDuration, opacity: s.opacity, transform: s.transform };
  });
  expect(style).toEqual({ duration: "0s", opacity: "1", transform: "none" });
});
