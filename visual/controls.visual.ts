import { expect, test } from "./browser-test";

for (const width of [1280, 390, 320]) {
  test(`disclosure focus belongs to its text or marker at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo");
    const summary = page.locator("#mix .bz-deeper > summary");
    await summary.focus();
    await expect(summary).toBeFocused();
    // A full-width summary is still a full-width target; its focus cue must stay local.
    await expect(summary).toHaveCSS("outline-style", "none");
    const padding = await summary.evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) };
    });
    expect(padding.top).toBeGreaterThanOrEqual(8);
    expect(padding.bottom).toBeGreaterThanOrEqual(8);
  });

  test(`external arrow has its own space and size at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo");
    const link = page.locator(".bz-example-nav a").last();
    await expect(link).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await link.evaluate((el) => {
      const icon = el.querySelector("svg, span[aria-hidden]")!;
      const text = document.createRange();
      const label = el.querySelector(".nk-arrow-text");
      if (label) text.selectNodeContents(label);
      else text.selectNode(el.firstChild!);
      const t = text.getBoundingClientRect(),
        i = icon.getBoundingClientRect();
      return {
        gap: i.left - t.right,
        width: i.width,
        height: i.height,
        font: parseFloat(getComputedStyle(el).fontSize),
      };
    });
    expect(geometry.gap).toBeGreaterThanOrEqual(6);
    expect(geometry.gap).toBeLessThanOrEqual(12);
    expect(geometry.width).toBeGreaterThanOrEqual(geometry.font * 0.8);
    expect(geometry.height).toBeLessThanOrEqual(geometry.font * 1.1);
  });
}

// The same browser measurement runs in exported-note audits. No test-only layout math.
import { measureDocument } from "../scripts/audit-measure";
const ownedRule = (rule: string) => /^(disclosure-|link-icon-|parameter-)/.test(rule);
async function ready(page: import("@playwright/test").Page, path = "/components") {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}
async function controlFailures(page: import("@playwright/test").Page) {
  return (await page.evaluate(measureDocument)).findings.filter(
    (f) => f.kind === "failure" && ownedRule(f.rule),
  );
}
for (const width of [1280, 390, 320]) {
  test(`real controls: wrap, padding, keyboard focus and snapshots at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    expect(await controlFailures(page)).toEqual([]);
    for (const name of ["range", "long-range", "disabled-range", "long-disclosure", "check"]) {
      await expect(page.locator(`[data-case=${name}]`)).toHaveScreenshot(`${name}-${width}.png`, {
        animations: "allow",
      });
    }
    const summary = page.locator('[data-case="disclosure"] summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await expect(summary.locator(".nk-disclosure-mark")).toHaveCSS("outline-style", "solid");
    expect(await controlFailures(page)).toEqual([]);
    // Capture its padded parent: a summary-only crop would hide an outside focus outline.
    await expect(page.locator('[data-case="disclosure"]')).toHaveScreenshot(
      `disclosure-focus-${width}.png`,
      { animations: "allow" },
    );
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-case="disclosure"] details')).toHaveAttribute("open", "");
    await expect(page.locator('[data-case="disclosure"]')).toHaveScreenshot(
      `disclosure-open-${width}.png`,
    );
    await ready(page, "/notes/framework-demo");
    expect(await controlFailures(page)).toEqual([]);
    await expect(page.locator(".bz-example-nav")).toHaveScreenshot(`example-nav-${width}.png`);
  });
}

test("the geometry audit rejects the reported layout failures", async ({ page }) => {
  await ready(page);
  const summary = page.locator('[data-case="long-disclosure"] summary');
  await summary.focus();
  const mutations = [
    {
      css: ".nk-disclosure-summary:focus-visible { outline: 2px solid cyan !important }",
      rule: "disclosure-focus",
    },
    { css: ".nk-disclosure-summary { padding: 0 !important }", rule: "disclosure-padding" },
    {
      css: '[data-case="long-disclosure"] .nk-disclosure-mark { transform: translateY(12px) }',
      rule: "disclosure-first-line",
    },
    { css: ".nk-parameter-label output { transform: translateX(-8px) }", rule: "parameter-header" },
  ];
  for (const { css, rule } of mutations) {
    const style = await page.addStyleTag({ content: css });
    expect((await controlFailures(page)).map((f) => f.rule)).toContain(rule);
    await style.evaluate((el) => el.parentNode?.removeChild(el));
    expect(await controlFailures(page)).toEqual([]);
  }
  await ready(page, "/notes/framework-demo");
  for (const css of [
    ".nk-arrow-label { gap: 0 !important }",
    ".bz-example-nav svg { transform: translateY(-5px) }",
    ".bz-example-nav svg { width: 6px !important }",
  ]) {
    const style = await page.addStyleTag({ content: css });
    expect((await controlFailures(page)).map((f) => f.rule)).toContain("link-icon-spacing");
    await style.evaluate((el) => el.parentNode?.removeChild(el));
    expect(await controlFailures(page)).toEqual([]);
  }
});

test("enlarged text keeps first-line markers and readouts inside a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await ready(page);
  await page.addStyleTag({
    content:
      ".ui-review { font-size: 36px } .nk-parameter { font-size: 34px } .nk-parameter-bounds { font-size: 28px }",
  });
  expect(await controlFailures(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  await expect(page.locator('[data-case="long-disclosure"]')).toHaveScreenshot(
    "wrapped-summary-enlarged.png",
  );
});

test("painted native thumb agrees with the fill at endpoints and fractional/signed values", async ({
  page,
}) => {
  await ready(page);
  for (const [name, values] of [
    ["range", [0, 0.13, 0.4, 0.73, 1]],
    ["long-range", [-100, -12.5, 31.25, 100]],
  ] as const) {
    const input = page.locator(`[data-case="${name}"] input`);
    for (const value of values) {
      await input.evaluate((el: HTMLInputElement, value) => {
        el.value = String(value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
      await input.scrollIntoViewIfNeeded();
      const box = (await input.boundingBox())!;
      const png = await input.screenshot({ animations: "allow" });
      // Independent painted-pixel oracle. Native pseudo-element computed widths are unreliable.
      const ink = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, image.width, image.height);
        const xs: number[] = [],
          ys: number[] = [];
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            const i = (y * image.width + x) * 4,
              rgb = [data[i], data[i + 1], data[i + 2]];
            if (Math.min(...rgb) > 180 && Math.max(...rgb) - Math.min(...rgb) < 20) {
              xs.push(x);
              ys.push(y);
            }
          }
        return {
          x: (Math.min(...xs) + Math.max(...xs) + 1) / 2,
          y: (Math.min(...ys) + Math.max(...ys) + 1) / 2,
          pixels: xs.length,
          width: image.width,
        };
      }, png.toString("base64"));
      const native = await input.evaluate((el: HTMLInputElement) => ({
        value: el.valueAsNumber,
        min: Number(el.min),
        max: Number(el.max),
      }));
      // Element crops start at the floored CSS coordinate on this pinned 1x browser.
      const expected =
        box.x -
        Math.floor(box.x) +
        8 +
        ((native.value - native.min) / (native.max - native.min)) * (box.width - 16);
      expect(ink.pixels).toBeGreaterThan(40);
      expect(Math.abs(ink.x - expected)).toBeLessThanOrEqual(0.75);
      expect(
        Math.abs(ink.y - (22 + box.y - Math.floor(box.y))),
        JSON.stringify({ ink, box, value }),
      ).toBeLessThanOrEqual(0.75);
      expect(await controlFailures(page)).toEqual([]);
    }
  }
});

test("the audit rejects a detached collar, bowed rail, stale fill and missing parts", async ({
  page,
}) => {
  await ready(page);
  const root = page.locator('[data-case="range"]');
  const mutations = [
    {
      selector: ".nk-parameter-collar",
      attribute: "transform",
      value: "translate(-6.3 -0.866)",
      rule: "parameter-collar-attachment",
    },
    {
      selector: ".nk-parameter-track",
      attribute: "d",
      value: "M8 22 L230 22 Q250 18.5 270 22 L622 22",
      rule: "parameter-straight-track",
    },
    {
      selector: ".nk-parameter-fill",
      attribute: "d",
      value: "M8 22 H200",
      rule: "parameter-fill-value",
    },
    {
      selector: ".nk-parameter-collar",
      attribute: "class",
      value: "missing-collar",
      rule: "parameter-collar-part",
    },
    {
      selector: ".nk-parameter-label output",
      attribute: "class",
      value: "irrelevant",
      rule: "parameter-parts",
      remove: true,
    },
  ];
  for (const m of mutations) {
    const target = (await root.locator(m.selector).elementHandle())!;
    if (m.remove) {
      const html = await target.evaluate((el) => {
        const html = el.outerHTML;
        el.remove();
        return html;
      });
      expect((await controlFailures(page)).map((f) => f.rule)).toContain(m.rule);
      await root
        .locator(".nk-parameter-label")
        .evaluate((el, html) => el.insertAdjacentHTML("beforeend", html), html);
    } else {
      const old = await target.getAttribute(m.attribute);
      await target.evaluate((el, m) => el.setAttribute(m.attribute, m.value), m);
      expect((await controlFailures(page)).map((f) => f.rule)).toContain(m.rule);
      await target.evaluate(
        (el, args) =>
          args.old === null ? el.removeAttribute(args.name) : el.setAttribute(args.name, args.old),
        { name: m.attribute, old },
      );
    }
    expect(await controlFailures(page)).toEqual([]);
  }
});

test("system colors retain a painted native control and visible keyboard focus", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active" });
  await ready(page);
  const root = page.locator('[data-case="range"]');
  const input = root.locator("input");
  await input.focus();
  await expect(input).toHaveCSS("outline-style", "solid");
  await input.press("ArrowRight");
  await expect(input).toHaveValue("0.41");
  expect(await controlFailures(page)).toEqual([]);
  await expect(root).toHaveScreenshot("slider-forced-colors.png", { animations: "allow" });
});

test("mouse activation uses the full disclosure row without a keyboard box", async ({ page }) => {
  await ready(page);
  const summary = page.locator('[data-case="disclosure"] summary');
  const box = (await summary.boundingBox())!;
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(page.locator('[data-case="disclosure"] details')).toHaveAttribute("open", "");
  expect(await summary.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
  await expect(summary.locator(".nk-disclosure-mark")).toHaveCSS("outline-style", "none");
});

test("owned ordinary summaries cannot escape the audit by losing their class", async ({ page }) => {
  await ready(page);
  const summary = page.locator('[data-case="disclosure"] summary');
  await summary.focus();
  await summary.evaluate((el) => el.removeAttribute("class"));
  const rules = (await controlFailures(page)).map((f) => f.rule);
  expect(rules).toContain("disclosure-parts");
  expect(rules).toContain("disclosure-padding");
  expect(rules).toContain("disclosure-focus");
});

test("the actual guide range keeps keyboard focus on its native thumb", async ({ page }) => {
  await ready(page, "/docs#interact");
  const input = page.locator('#interact input[type="range"]');
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toHaveCSS("outline-style", "none");
  expect(await controlFailures(page)).toEqual([]);
  await expect(page.locator("#interact .nk-parameter")).toHaveScreenshot("guide-range-focus.png", {
    animations: "allow",
  });
});
