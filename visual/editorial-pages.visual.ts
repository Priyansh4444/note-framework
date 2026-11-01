import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { studies } from "../src/notes/framework/study-registry";

for (const width of [320, 390, 1440]) {
  test(`the home offers a usable figure in the first view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const figure = page.locator(".fw-hero-figure");
    const slider = figure.getByRole("slider").last();
    const box = await slider.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844);
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveValue("1");
    await slider.press("Home");
    await expect(slider).toHaveValue("0");
    await expect(page.locator(".fw-hero .fw-button")).toHaveCount(1);
    await expect(page.locator(".fw-hero .fw-button")).toHaveAttribute("href", "/docs");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

  test(`guide introduction precedes its index and all navigation stays reachable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/docs", { waitUntil: "networkidle" });
    const intro = page.locator(".fw-guide-header");
    const index = page.getByRole("navigation", { name: "On this page", exact: true });
    expect(
      await intro.evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(document.querySelector(".fw-guide-toc")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    expect((await intro.boundingBox())!.y).toBeLessThan((await index.boundingBox())!.y);
    await expect(page.locator("#write h2")).toHaveText("Write it.");
    const nav = page.getByRole("navigation", { name: "Framework", exact: true });
    await expect(nav.getByRole("link", { name: "Example", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Guide", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Studies", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "For agents", exact: true })).toBeVisible();
    const starter = nav.getByRole("link", { name: "Starter", exact: true });
    await expect(starter).toBeVisible();
    await expect(starter).toHaveAttribute("download", "note-framework-starter.zip");
    for (const link of await nav.getByRole("link").all()) {
      const bounds = await link.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await index.getByRole("link", { name: /Write it/ }).click();
    await expect(page).toHaveURL(/#write$/);
    await expect(page.locator("#first-note-prompt")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

  test(`the study index names all five experiences and exposes the first action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/studies", { waitUntil: "networkidle" });
    await expect(page.locator(".study-intro .fw-dek")).toContainText("and a spring");
    await expect(page.locator(".study-card")).toHaveCount(studies.length);
    for (const study of studies) {
      const card = page.locator(`[data-study="${study.id}"]`);
      await expect(card.getByRole("heading", { level: 2 })).toHaveText(study.title);
      await expect(card.locator(".study-card-body > p").last()).toHaveText(study.text);
      await expect(card.getByRole("link", { name: study.action, exact: true })).toHaveAttribute(
        "href",
        study.href,
      );
      await expect(card.locator(".study-credit")).toHaveAttribute("href", study.source);
    }
    const first = page.locator(".study-card").first();
    for (const target of [first.getByRole("heading", { level: 2 }), first.locator(".study-open")]) {
      const box = await target.boundingBox();
      expect(box!.y + box!.height).toBeLessThan(844);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test("editing the hero leaves the example's shared points untouched", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const points = () =>
    page.evaluate(async () => {
      // Exercise the actual module that every chapter in the example consumes.
      const path = "/src/notes/framework-demo/bezier/store.ts";
      const store = await import(/* @vite-ignore */ path);
      return store.points();
    });
  const original = await points();
  const handle = page.locator(".fw-hero-figure .nk-handle").first();
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute(
    "aria-valuetext",
    `(${original[0][0] + 4}, ${original[0][1]})`,
  );
  expect(await points()).toEqual(original);
});

test("the guide retains the exact copyable source of all nine file-backed examples", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs#developer-guide", { waitUntil: "networkidle" });
  const snippets = [
    "guide/start.sh",
    "guide/Prose.tsx",
    "Slider.tsx",
    "Sweep.tsx",
    "Pattern.tsx",
    "guide/check.sh",
    "guide/publish.sh",
    "guide/share.sh",
    "guide/upload.sh",
  ];
  await expect(page.locator(".fw-guide .nk-code-example")).toHaveCount(snippets.length);
  for (const filename of snippets) {
    const block = page.locator(".nk-code-example").filter({
      has: page.locator(`figure[aria-label="${filename.split("/").at(-1)!}"]`),
    });
    // Open the surrounding disclosure first, then the tools, as a reader would: in one task
    // the disclosure's content-visibility transition does not start.
    await block.evaluate((el) => {
      for (let at: Element | null = el; at; at = at.parentElement)
        if (at instanceof HTMLDetailsElement) at.open = true;
    });
    const tools = block.locator(".nk-code-source-tools");
    if ((await tools.getAttribute("data-open")) === null)
      await tools.locator(".nk-code-source-toggle").click();
    await block.getByRole("button", { name: "Copy source", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(readFileSync(`src/notes/framework/${filename}`, "utf8"));
  }
});
