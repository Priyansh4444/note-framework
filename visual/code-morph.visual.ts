import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "./browser-test";

async function reveal(page: Page) {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const patch = page.locator('.nk-code-block[data-kind="diff"]').first();
  await patch.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p instanceof HTMLDetailsElement) p.open = true;
  });
  await page.evaluate(() => document.fonts.ready);
  await patch.scrollIntoViewIfNeeded();
  return patch;
}
async function choose(patch: Locator, side: "before" | "after") {
  if ((await patch.getAttribute("data-current-version")) === side) return;
  const toggle = patch.getByRole("button", {
    name: `Show the ${side} version of the code`,
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  else {
    const tools = patch.locator("..").locator(".nk-code-source-tools");
    if (!(await tools.getAttribute("open"))) await tools.locator("summary").click();
    await tools
      .getByRole("button", { name: side === "before" ? "Before" : "After", exact: true })
      .click();
  }
}
const widths = (patch: Locator) =>
  patch.evaluate((el) =>
    [
      ...el
        .querySelector(".nk-code-block-render")!
        .shadowRoot!.querySelectorAll<HTMLElement>("[data-morph-part]"),
    ].map((part) => part.getBoundingClientRect().width),
  );

test("persistent token widths and row positions have intermediate frames and survive reversal", async ({
  page,
}) => {
  const patch = await reveal(page);
  const before = await widths(patch);
  await patch.evaluate((el) => {
    const root = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    (window as any).morphNodes = [...root.querySelectorAll("[data-morph-row], [data-morph-part]")];
  });
  await choose(patch, "after");
  await page.waitForTimeout(100);
  const middle = await widths(patch);
  expect(
    await patch.evaluate(
      (el) =>
        el
          .querySelector(".nk-code-block-render")!
          .shadowRoot!.getAnimations()
          .filter((a) => a.playState === "running").length,
    ),
  ).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  const after = await widths(patch);
  expect(middle.some((w, i) => Math.abs(w - before[i]) > 0.2 && Math.abs(w - after[i]) > 0.2)).toBe(
    true,
  );
  await patch.evaluate((el) => {
    const parts = [
      ...el
        .querySelector(".nk-code-block-render")!
        .shadowRoot!.querySelectorAll<HTMLElement>("[data-morph-part]"),
    ];
    (window as any).reversalDeltas = [];
    el.querySelector(".nk-code-block-switch")!.addEventListener(
      "click",
      () => {
        const before = parts.map((part) => part.getBoundingClientRect().width);
        queueMicrotask(() =>
          (window as any).reversalDeltas.push(
            Math.max(
              ...parts.map((part, i) => Math.abs(part.getBoundingClientRect().width - before[i])),
            ),
          ),
        );
      },
      { capture: true },
    );
  });
  for (let i = 0; i < 20; i++) {
    await choose(patch, i % 2 ? "after" : "before");
    await page.waitForTimeout(35);
  }
  await choose(patch, "before");
  await page.waitForTimeout(550);
  const final = await patch.evaluate((el) => {
    const root = el.querySelector(".nk-code-block-render")!.shadowRoot!;
    return {
      same: (window as any).morphNodes.every(
        (node: Element, i: number) =>
          node === root.querySelectorAll("[data-morph-row], [data-morph-part]")[i],
      ),
      deltas: (window as any).reversalDeltas as number[],
      text: [
        ...root.querySelectorAll<HTMLElement>(
          '[data-kind="source"][aria-hidden="false"] .morph-text',
        ),
      ].map((row) => row.innerText),
      running: root.getAnimations().length,
    };
  });
  expect(final.same).toBe(true);
  expect(final.running).toBe(0);
  expect(final.deltas).toHaveLength(21);
  expect(Math.max(...final.deltas)).toBeLessThan(0.5);
  expect(final.text.at(-1)).toContain("a + (b - a) * t");
});

test("keyboard, live reduced motion and closing an ancestor settle to the latest version", async ({
  page,
}) => {
  const patch = await reveal(page);
  const running = () =>
    patch.evaluate(
      (el) =>
        el
          .querySelector(".nk-code-block-render")!
          .shadowRoot!.getAnimations()
          .filter((a) => a.playState === "running").length,
    );
  await patch.getByRole("button").focus();
  await page.keyboard.press("Enter");
  expect(await running()).toBe(0);
  await choose(patch, "before");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(30);
  expect(await running()).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await choose(patch, "after");
  await patch.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p instanceof HTMLDetailsElement) p.open = false;
  });
  await page.waitForTimeout(30);
  expect(await running()).toBe(0);
});

for (const width of [320, 390, 768, 1440])
  test(`one unwrapped reference code column contains overflow at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const patch = await reveal(page);
    const geometry = await patch.evaluate((el) => {
      const root = el.querySelector(".nk-code-block-render")!.shadowRoot!;
      const pre = root.querySelector("pre")!;
      const frame = el.getBoundingClientRect(),
        css = getComputedStyle(el),
        type = getComputedStyle(pre);
      const source = root.querySelector<HTMLElement>(
        '[data-kind="source"][aria-hidden="false"] .morph-text',
      )!;
      return {
        columns: root.querySelectorAll("pre").length,
        page: document.documentElement.scrollWidth,
        right: pre.getBoundingClientRect().right,
        font: type.fontSize,
        lineHeight: type.lineHeight,
        overflow: type.overflowX,
        padding: type.padding,
        inset: source.getBoundingClientRect().left - frame.left,
        background: css.backgroundColor,
        radius: css.borderRadius,
        border: css.borderLeftColor,
        caption: getComputedStyle(el.querySelector("figcaption")!).fontSize,
        metadata: root.querySelectorAll('[data-kind="metadata"], .morph-number').length,
        buttons: el.querySelectorAll("button").length,
        toggle: getComputedStyle(el.querySelector("button")!).display,
      };
    });
    expect(geometry.columns).toBe(1);
    expect(geometry.page).toBeLessThanOrEqual(width);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.font).toBe(width <= 800 ? "15px" : "16px");
    expect(geometry.lineHeight).toBe(width <= 800 ? "25.5px" : "27.2px");
    expect(geometry.padding).toBe("20px 22px 24px");
    expect(geometry.inset).toBe(23);
    expect(geometry.overflow).toBe("auto");
    expect(geometry.background).toBe("rgba(0, 0, 0, 0)");
    expect(geometry.radius).toBe("0px");
    expect(geometry.border).toBe("rgba(255, 255, 255, 0.15)");
    expect(geometry.metadata).toBe(0);
    expect(geometry.buttons).toBe(1);
    expect(geometry.toggle).toBe(width <= 640 ? "none" : "flex");
    await info.attach("reference-frame-geometry", {
      body: JSON.stringify(geometry, null, 2),
      contentType: "application/json",
    });
    const bounds = (await patch.boundingBox())!;
    await page.screenshot({
      path: info.outputPath("reference-chrome-own-source.png"),
      clip: {
        x: bounds.x,
        y: Math.max(0, bounds.y - 12),
        width: bounds.width,
        height: bounds.height + 24,
      },
    });
    if (
      width !== 320 &&
      existsSync(new URL(`../artifacts/opencode-reference/${width}-promise.png`, import.meta.url))
    )
      await info.attach("immutable-reference-promise", {
        body: readFileSync(
          new URL(`../artifacts/opencode-reference/${width}-promise.png`, import.meta.url),
        ),
        contentType: "image/png",
      });
    await choose(patch, "after");
    await page.waitForTimeout(550);
    await expect(patch).toHaveAttribute("data-current-version", "after");
  });

test("native source row text stays continuous across parts and excludes inactive edits", async ({
  page,
}) => {
  const patch = await reveal(page);
  for (const version of ["before", "after"] as const) {
    await choose(patch, version);
    await page.waitForTimeout(500);
    const lines = await patch.evaluate((el) =>
      [
        ...el
          .querySelector(".nk-code-block-render")!
          .shadowRoot!.querySelectorAll<HTMLElement>(
            '[data-kind="source"][aria-hidden="false"] .morph-text',
          ),
      ].map((row) => row.innerText),
    );
    expect(lines[0]).toBe("export type Point = readonly [x: number, y: number];");
    expect(lines[3]).toBe(
      version === "before"
        ? "export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;"
        : "export const lerp = (a: number, b: number, t: number) => (1 - t) * a + t * b;",
    );
  }
});

test("zoom, transformed ancestors and font/viewport invalidation retain fitted token widths", async ({
  page,
}) => {
  const patch = await reveal(page);
  for (const transform of ["zoom", "scale"]) {
    await patch.evaluate((el, transform) => {
      if (transform === "zoom") document.documentElement.style.zoom = "2";
      else {
        document.documentElement.style.zoom = "";
        (el as HTMLElement).style.transform = "scale(1.5)";
      }
      document.fonts.dispatchEvent(new Event("loadingdone"));
    }, transform);
    await page.waitForTimeout(30);
    const fit = await patch.evaluate((el) => {
      const span = [
        ...el
          .querySelector(".nk-code-block-render")!
          .shadowRoot!.querySelectorAll<HTMLElement>(".morph-part"),
      ].find((part) => part.textContent?.trim() === "Point")!;
      const range = document.createRange();
      range.selectNodeContents(span);
      return Math.abs(range.getBoundingClientRect().width - span.getBoundingClientRect().width);
    });
    expect(fit).toBeLessThan(1);
  }
  await patch.evaluate((el) => {
    (el as HTMLElement).style.transform = "";
  });
  await choose(patch, "after");
  await page.setViewportSize({ width: 1150, height: 850 });
  await page.waitForTimeout(30);
  expect(
    await patch.evaluate(
      (el) =>
        el
          .querySelector(".nk-code-block-render")!
          .shadowRoot!.getAnimations()
          .filter((a) => a.playState === "running").length,
    ),
  ).toBe(0);
});

test("Source tools inspect the exact patch outside the persistent reference frame", async ({
  page,
}) => {
  const patch = await reveal(page),
    tools = patch.locator("..").locator(".nk-code-source-tools");
  await tools.locator("summary").click();
  await expect(tools).toContainText("Unchanged source outside its hunks is omitted");
  await tools.getByRole("button", { name: "Show split diff", exact: true }).click();
  await expect(tools.locator("pre")).toHaveCount(1);
  await expect(patch.locator("pre[data-side=before]")).toHaveCount(1);
  await tools.locator("summary").click();
  await expect(patch).toHaveAttribute("data-current-version", "before");
});
