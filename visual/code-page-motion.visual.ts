import { expect, test } from "./browser-test";

async function revealPatch(page: import("@playwright/test").Page) {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const patch = page.locator('figure.nk-code-block[data-kind="diff"]').first();
  await patch.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p instanceof HTMLDetailsElement) p.open = true;
  });
  await patch.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  return patch;
}

async function choose(patch: import("@playwright/test").Locator, side: "before" | "after") {
  if ((await patch.getAttribute("data-current-version")) === side) return;
  const toggle = patch.getByRole("button", {
    name: `Show the ${side} version of the code`,
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  else {
    const tools = patch.locator("..").locator(".nk-code-source-tools");
    if ((await tools.getAttribute("open")) === null) await tools.locator("summary").click();
    await tools
      .getByRole("button", { name: side === "before" ? "Before" : "After", exact: true })
      .click();
  }
}

test("the numerical patch offers readable before and after versions", async ({ page }) => {
  const patch = await revealPatch(page);
  await expect(patch).toHaveAttribute("data-current-version", "before");
  await choose(patch, "after");
  await expect(patch).toHaveAttribute("data-current-version", "after");
  await choose(patch, "before");
  await expect(patch).toHaveAttribute("data-current-version", "before");
});

test("the curved reading slider belongs to the top-right page navigator", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.locator("#mix").scrollIntoViewIfNeeded();
  const nav = page.getByRole("navigation", { name: "On this page", exact: true });
  const slider = nav.getByRole("slider", { name: "Reading position", exact: true });
  await expect(slider).toBeAttached({ timeout: 1500 });
  const curve = await nav
    .locator("svg path")
    .evaluateAll((paths) => paths.some((p) => /[QC]/.test(p.getAttribute("d") ?? "")));
  expect(curve).toBe(true);
  const marker = nav.locator(".nk-outline-playhead");
  expect(await marker.evaluate((el) => el.tagName.toLowerCase())).toBe("path");
  expect(await marker.evaluate((el) => getComputedStyle(el).stroke)).not.toBe("none");
  await expect(nav.locator("circle.nk-outline-playhead, .nk-outline-playhead-halo")).toHaveCount(0);
});

test("the code morph retains shared text and animates the edit rather than the whole listing", async ({
  page,
}) => {
  const patch = await revealPatch(page);
  await choose(patch, "before");
  await page.waitForTimeout(600);
  await patch.evaluate((el) => {
    const shadow = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    const token = [...shadow.querySelectorAll("span")].find(
      (s) => s.textContent?.trim() === "Point" && !s.querySelector("span"),
    );
    if (!token) throw new Error("The unchanged Point token must remain real selectable text");
    (window as any).__retainedCodeToken = token;
  });
  await choose(patch, "after");
  const during = await patch.evaluate((el) => {
    const shadow = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    const token = (window as any).__retainedCodeToken as HTMLElement;
    const animations = [...shadow.querySelectorAll("*")].flatMap((e) => e.getAnimations());
    return {
      retained: token.isConnected && shadow.contains(token),
      structural: animations.some((a) =>
        (a.effect as KeyframeEffect)
          ?.getKeyframes()
          .some((k) => "width" in k || "transform" in k || "height" in k),
      ),
    };
  });
  expect(during.retained).toBe(true);
  expect(during.structural).toBe(true);
  await page.waitForTimeout(800);
  expect(
    await patch.evaluate(
      (el) =>
        [...el.querySelector(".nk-code-block-render")!.shadowRoot!.querySelectorAll("*")]
          .flatMap((e) => e.getAnimations())
          .filter((a) => a.playState === "running").length,
    ),
  ).toBe(0);
});

test("the page timeline follows native scrolling and seeks without changing history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.locator("#mix").scrollIntoViewIfNeeded();
  const nav = page.getByRole("navigation", { name: "On this page", exact: true });
  const slider = nav.getByRole("slider", { name: "Reading position", exact: true });
  await expect(slider).toBeVisible();
  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.mouse.wheel(0, 300);
  await expect
    .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
  const url = page.url(),
    history = await page.evaluate(() => window.history.length);
  await slider.focus();
  await slider.press("End");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)),
      ),
    )
    .toBeLessThanOrEqual(2);
  await slider.press("Home");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(2);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
});

test("keyboard and reduced-motion code changes settle immediately", async ({ page }) => {
  const patch = await revealPatch(page);
  const countRunning = () =>
    patch.evaluate(
      (el) =>
        [...el.querySelector(".nk-code-block-render")!.shadowRoot!.querySelectorAll("*")]
          .flatMap((e) => e.getAnimations())
          .filter((a) => a.playState === "running").length,
    );
  await patch.getByRole("button").focus();
  await page.keyboard.press("Enter");
  expect(await countRunning()).toBe(0);
  await expect(patch).toHaveAttribute("data-current-version", "after");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choose(patch, "before");
  expect(await countRunning()).toBe(0);
  await expect(patch).toHaveAttribute("data-current-version", "before");
});

for (const width of [320, 390, 768, 1440])
  test(`code change and page map fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const patch = await revealPatch(page);
    await choose(patch, "before");
    await page.waitForTimeout(600);
    await choose(patch, "after");
    await page.waitForTimeout(600);
    const result = await patch.evaluate((el) => {
      const f = el.getBoundingClientRect();
      const host = el.querySelector(".nk-code-block-render")!.getBoundingClientRect();
      return {
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        left: f.left,
        right: f.right,
        headerHeight: el.querySelector(".nk-code-block-header")!.getBoundingClientRect().height,
        listingContained: host.left >= f.left && host.right <= f.right,
        controls: [...el.querySelectorAll("button")].map((b) => ({
          text: b.textContent,
          h: b.getBoundingClientRect().height,
          right: b.getBoundingClientRect().right,
        })),
      };
    });
    expect(result.pageOverflow).toBeLessThanOrEqual(1);
    expect(result.listingContained).toBe(true);
    expect(result.headerHeight).toBe(18);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.right).toBeLessThanOrEqual(width);
    for (const control of result.controls) {
      expect(control.h, control.text ?? "control").toBe(width <= 640 ? 0 : 28);
      expect(control.right).toBeLessThanOrEqual(result.right);
    }
  });

test("selecting the active source keeps each original code line intact", async ({ page }) => {
  const patch = await revealPatch(page);
  await choose(patch, "before");
  await page.waitForTimeout(600);
  const lines = await patch.evaluate((el) => {
    const root = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    return [...root.querySelectorAll<HTMLElement>(".morph-text")]
      .filter((e) => e.parentElement?.getAttribute("aria-hidden") !== "true")
      .map((e) => e.innerText);
  });
  expect(lines).toContain("export type Point = readonly [x: number, y: number];");
  expect(lines).toContain(
    "export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;",
  );
});

test("font remeasurement under enlarged layout keeps token boxes fitted to text", async ({
  page,
}) => {
  const patch = await revealPatch(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    document.fonts.dispatchEvent(new Event("loadingdone"));
  });
  await patch.scrollIntoViewIfNeeded();
  await choose(patch, "before");
  await page.waitForTimeout(600);
  const fit = await patch.evaluate((el) => {
    const root = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    const token = [...root.querySelectorAll<HTMLElement>("span")].find(
      (e) => e.textContent?.trim() === "Point" && !e.querySelector("span"),
    )!;
    const range = document.createRange();
    range.selectNodeContents(token);
    return { box: token.getBoundingClientRect().width, text: range.getBoundingClientRect().width };
  });
  expect(Math.abs(fit.box - fit.text)).toBeLessThanOrEqual(1);
});

test("the chapter map keeps readable labels or returns to document flow", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.locator("#mix").scrollIntoViewIfNeeded();
  const layout = await page.locator(".nk-reader-outline").evaluate((el) => ({
    fixed: getComputedStyle(el).position === "fixed",
    labels: [...el.querySelectorAll(".nk-outline-route .nk-outline-title")].map(
      (e) => e.getBoundingClientRect().width,
    ),
  }));
  if (layout.fixed) for (const width of layout.labels) expect(width).toBeGreaterThanOrEqual(80);
});

test("grabbing the page playhead off center does not jump the reading position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.locator("#mix").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const dot = (await page.locator(".nk-outline-playhead").boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2 + 3);
  await page.mouse.down();
  await page.waitForTimeout(120);
  expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThanOrEqual(1);
  await page.mouse.up();
});
