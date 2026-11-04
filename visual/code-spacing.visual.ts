import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type TestInfo } from "./browser-test";

// Measure source text and gutter text, not their padded element rectangles.
async function pierreSpacing(block: Locator) {
  return block.evaluate((element) => {
    const root = element.querySelector(".nk-code-inspector-render")!.shadowRoot!;
    const range = document.createRange();
    const rows = [...root.querySelectorAll<HTMLElement>("[data-line]")].filter((row) =>
      row.textContent?.trim(),
    );
    return rows.map((row) => {
      const code = row.closest("[data-code]")!;
      const gutter = [...code.querySelectorAll("[data-column-number]")].find(
        (number) => number.getAttribute("data-line-index") === row.getAttribute("data-line-index"),
      )!;
      range.selectNodeContents(gutter.querySelector("[data-line-number-content]")!);
      const numberRight = range.getBoundingClientRect().right;
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode()!;
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const sourceLeft = range.getBoundingClientRect().left;
      const sign = getComputedStyle(row, "::before");
      const signed = sign.content === '"+"' || sign.content === '"-"';
      const signLeft = row.getBoundingClientRect().left + parseFloat(sign.left);
      return {
        kind: row.getAttribute("data-line-type"),
        numberToSign: signed ? signLeft - numberRight : null,
        signToSource: signed ? sourceLeft - signLeft - parseFloat(sign.width) : null,
        numberToSource: sourceLeft - numberRight,
        height: row.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(row).lineHeight),
        source: row.textContent,
      };
    });
  });
}

async function headerSpacing(block: Locator) {
  return block.evaluate((header) => {
    const buttons = [...header.querySelectorAll("button")].map((button) =>
      button.getBoundingClientRect(),
    );
    const gaps = buttons.slice(1).map((button, index) => {
      const previous = buttons[index];
      return Math.abs(button.top - previous.top) < 1
        ? button.left - previous.right
        : button.top - previous.bottom;
    });
    return {
      gaps,
      targets: buttons.map((button) => ({ width: button.width, height: button.height })),
    };
  });
}

async function evidence(block: Locator, name: string, info: TestInfo) {
  const path = info.outputPath(`${name}.png`);
  await block.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
}

const source = readFileSync(
  new URL("../src/notes/framework-demo/examples/de-casteljau.ts", import.meta.url),
  "utf8",
);
const patchSource = readFileSync(
  new URL("../src/notes/framework-demo/examples/lerp.diff", import.meta.url),
  "utf8",
);

for (const width of [320, 390, 768, 1440]) {
  test(`code gutter and control spacing at ${width}`, async ({ page }, info) => {
    await page.addInitScript(() => {
      const errors: string[] = [];
      Object.defineProperty(window, "codeLayoutErrors", { value: errors });
      window.addEventListener("error", (event) => errors.push(event.message));
    });
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.locator(".nk-code-block").evaluateAll((blocks) => {
      for (const block of blocks)
        for (let parent = block.parentElement; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
    });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copiedSource: string }).copiedSource = text;
          },
        },
      });
    });
    const code = page.locator('.nk-code-block[data-kind="code"]').first();
    const patch = page.locator('.nk-code-block[data-kind="diff"]').first();
    const report: Record<string, unknown> = {};

    async function checkHeader(block: Locator, name: string) {
      const header = await headerSpacing(block);
      report[`${name}-header`] = header;
      for (const gap of header.gaps)
        expect.soft(gap, `${name} control clearance`).toBeGreaterThanOrEqual(8);
      for (const target of header.targets)
        expect.soft(target.height, `${name} touch target`).toBeGreaterThanOrEqual(44);
    }

    async function checkPierre(block: Locator, name: string) {
      const rows = await pierreSpacing(block);
      expect(rows.length).toBeGreaterThan(0);
      report[name] = rows;
      for (const row of rows) {
        if (row.numberToSign !== null) {
          expect.soft(row.numberToSign, `${name} number → sign`).toBeGreaterThanOrEqual(12);
          expect.soft(row.signToSource!, `${name} sign → source`).toBeGreaterThanOrEqual(16);
        } else
          expect
            .soft(row.numberToSource, `${name} number → unsigned source`)
            .toBeGreaterThanOrEqual(16);
      }
      await checkHeader(block, name);
      await evidence(block, name, info);
      return rows;
    }

    const codeTools = code.locator("..").locator(".nk-code-source-tools");
    const patchTools = patch.locator("..").locator(".nk-code-source-tools");
    const sourceFrame = await code.evaluate((element) => {
      const root = element.querySelector(".nk-code-block-render")!.shadowRoot!;
      const row = root.querySelector("[data-line]")!;
      return {
        inset: row.getBoundingClientRect().left - element.getBoundingClientRect().left,
        gutter: getComputedStyle(root.querySelector("[data-gutter]")!).display,
        wrap: getComputedStyle(row).whiteSpace,
      };
    });
    expect(sourceFrame.inset).toBe(23);
    expect(sourceFrame.gutter).toBe("none");
    expect(sourceFrame.wrap).toBe("pre");
    report.source = sourceFrame;
    await evidence(code, "source", info);
    await codeTools.locator(".nk-code-source-toggle").click();
    await codeTools.getByRole("button", { name: "Copy source", exact: true }).click();
    await codeTools.locator(".nk-code-source-toggle").click();
    expect(
      await page.evaluate(() => (window as unknown as { copiedSource: string }).copiedSource),
    ).toBe(source);

    await patchTools.locator(".nk-code-source-toggle").click();
    // Both endpoints must retain the same structural source origin after a morph.
    for (const side of ["Before", "After"]) {
      await patchTools.getByRole("button", { name: side, exact: true }).focus();
      await page.keyboard.press("Enter");
      const excerpt = await patch.evaluate((element) => {
        const root = element.querySelector(".nk-code-block-render")!.shadowRoot!;
        return [...root.querySelectorAll<HTMLElement>('[data-kind="source"][aria-hidden="false"]')]
          .filter((row) => row.querySelector<HTMLElement>(".morph-text")!.innerText.trim())
          .map((row) => {
            const text = row.querySelector<HTMLElement>(".morph-text")!;
            return {
              gap: text.getBoundingClientRect().left - element.getBoundingClientRect().left,
              left: text.getBoundingClientRect().left,
              source: text.innerText,
            };
          });
      });
      report[side] = excerpt;
      expect(excerpt.length).toBeGreaterThan(0);
      for (const row of excerpt) expect.soft(row.gap, `${side} outline → excerpt source`).toBe(23);
      expect(new Set(excerpt.map((row) => row.left)).size).toBe(1);
      await checkHeader(patchTools, side);
      await evidence(patch, side.toLowerCase(), info);
    }

    for (const view of ["unified", "split"]) {
      await patchTools.getByRole("button", { name: `Show ${view} diff`, exact: true }).click();
      const rows = await checkPierre(patchTools, view);
      expect(rows.some((row) => row.numberToSign !== null)).toBe(true);
      if (view === "split") {
        const tracks = await patchTools.locator("[data-content]").evaluateAll((contents) =>
          contents.map((content) =>
            [...content.children].map((row) => ({
              top: row.getBoundingClientRect().top,
              height: row.getBoundingClientRect().height,
            })),
          ),
        );
        expect(tracks[0]).toEqual(tracks[1]);
      }
      // Force a local wrapped listing even when the surrounding page is wide.
      await patchTools.evaluate((element) => {
        (element as HTMLElement).style.maxWidth = "280px";
      });
      const wrapped = await checkPierre(patchTools, `${view}-wrapped`);
      expect(wrapped.some((row) => row.height > row.lineHeight + 1)).toBe(true);
      await patchTools.evaluate((element) => {
        (element as HTMLElement).style.maxWidth = "";
      });
      await patchTools.getByRole("button", { name: "Copy patch", exact: true }).click();
      expect(
        await page.evaluate(() => (window as unknown as { copiedSource: string }).copiedSource),
      ).toBe(patchSource);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await page.evaluate(() => Reflect.get(window, "codeLayoutErrors"))).toEqual([]);
    const measurements = info.outputPath("spacing-measurements.json");
    writeFileSync(measurements, JSON.stringify(report, null, 2));
    await info.attach("spacing-measurements", {
      path: measurements,
      contentType: "application/json",
    });
  });
}
