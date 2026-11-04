import { expect, test } from "./browser-test";

test("prompt copy confirms in its own stable button with real intermediate motion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          Reflect.set(window, "copiedText", text);
        },
      },
    }),
  );
  await page.goto("/docs#write", { waitUntil: "networkidle" });
  const button = page.getByRole("button", { name: "Copy prompt", exact: true });
  const before = await button.boundingBox();
  await button.click();
  await expect(button).toHaveAttribute("data-copy-state", "copied");
  const motion = await button.locator(".nk-copy-feedback-result").evaluate((el) => {
    const animation = el.getAnimations()[0];
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 60;
    return {
      opacity: Number(getComputedStyle(el).opacity),
      transform: getComputedStyle(el).transform,
    };
  });
  expect(motion).not.toBeNull();
  expect(motion!.opacity).toBeGreaterThan(0);
  expect(motion!.opacity).toBeLessThan(1);
  await button.screenshot({ path: "artifacts/reading-motion/copy-midpoint.png" });
  const after = await button.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 1);
  expect(await page.evaluate(() => Reflect.get(window, "copiedText"))).toBe(
    await page.locator("#first-note-prompt").inputValue(),
  );
  await expect(page.locator(".fw-guide-prompt-actions")).not.toContainText(
    "Paste it into your agent",
  );
});

test("only the newest resolved copy confirms, and editing invalidates a pending result", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pending: { resolve: () => void; reject: () => void }[] = [];
    Reflect.set(window, "copyPending", pending);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve, reject) =>
            pending.push({ resolve, reject: () => reject(Error("denied")) }),
          ),
      },
    });
  });
  await page.goto("/docs#write", { waitUntil: "networkidle" });
  const b = page.getByRole("button", { name: "Copy prompt", exact: true });
  await b.click();
  await b.click();
  await expect(b).toHaveAttribute("data-copy-state", "pending");
  await page.evaluate(() => Reflect.get(window, "copyPending")[0].resolve());
  await expect(b).toHaveAttribute("data-copy-state", "pending");
  await page.evaluate(() => Reflect.get(window, "copyPending")[1].reject());
  await expect(b).toHaveAttribute("data-copy-state", "error");
  await expect(page.locator(".fw-guide-prompt-actions [role=status]")).toContainText(
    "Could not copy",
  );
  await b.click();
  await page.locator("#first-note-prompt").fill("A different question");
  await page.evaluate(() => Reflect.get(window, "copyPending")[2].resolve());
  await expect(b).toHaveAttribute("data-copy-state", "idle");
  await expect(page.locator(".fw-guide-prompt-actions [role=status]")).toBeEmpty();
  await b.click();
  await page.evaluate(() => Reflect.get(window, "copyPending")[3].resolve());
  await expect(b).toHaveAttribute("data-copy-state", "copied");
  await expect(b).toHaveAttribute("data-copy-state", "idle", { timeout: 3000 });
});

for (const width of [320, 390, 1280])
  test(`keyboard and reduced-motion copy are immediate and compact at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {} },
      }),
    );
    await page.goto("/docs#write", { waitUntil: "networkidle" });
    const b = page.getByRole("button", { name: "Copy prompt", exact: true });
    const box = await b.boundingBox();
    await b.press("Enter");
    await expect(b).toHaveAttribute("data-copy-state", "copied");
    expect(
      await b
        .locator(".nk-copy-feedback-result")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await page.locator("#first-note-prompt").fill("Something else");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await b.click();
    await expect(b).toHaveAttribute("data-copy-state", "copied");
    expect(
      await b
        .locator(".nk-copy-feedback-result")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    const after = await b.boundingBox();
    expect(after!.width).toBeCloseTo(box!.width, 1);
    expect(after!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

test("CodeBlock keeps an exact imported patch through success, opaque fallback, and selected-only feedback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, "copyWrites", []);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => Reflect.get(window, "copyWrites").push(text) },
    });
  });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const example = page
    .locator(".nk-code-example")
    .filter({ has: page.locator('[data-kind="diff"]') })
    .first();
  await example.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p instanceof HTMLDetailsElement) p.open = true;
  });
  await example.locator(".nk-code-source-toggle").click();
  const copy = example.getByRole("button", { name: "Copy patch", exact: true });
  await copy.click();
  await expect(copy).toHaveAttribute("data-copy-state", "copied");
  const source = await page.evaluate(() => Reflect.get(window, "copyWrites")[0] as string);
  expect(source).toContain("@@");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("opaque");
        },
      },
    });
    document.execCommand = () => false;
  });
  await copy.click();
  await expect(copy).toHaveAttribute("data-copy-state", "selected");
  await expect(example.locator("[role=status]")).toContainText("Text selected");
  await page.evaluate(() => {
    document.execCommand = () => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data }));
      Reflect.set(window, "fallbackBytes", data.getData("text/plain"));
      return true;
    };
  });
  await copy.click();
  await expect(copy).toHaveAttribute("data-copy-state", "copied");
  expect(await page.evaluate(() => Reflect.get(window, "fallbackBytes"))).toBe(source);
});

test("a delayed denied copy cannot alter selection after its code block unmounts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, "fallbackCalls", 0);
    document.execCommand = () => {
      Reflect.set(window, "fallbackCalls", Reflect.get(window, "fallbackCalls") + 1);
      return false;
    };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          new Promise((_resolve, reject) =>
            Reflect.set(window, "denyOldCopy", () => reject(Error("denied"))),
          ),
      },
    });
  });
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const source = "/visual/copy-feedback.fixture.tsx";
    const fixture = await import(source);
    fixture.mountCopyFixture();
  });
  await page.locator(".nk-code-source-toggle").click();
  await page.getByRole("button", { name: "Copy patch", exact: true }).click();
  await page.getByRole("button", { name: "Remove source", exact: true }).click();
  await expect(page.locator(".nk-code-block")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Other selection" })
    .evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(0, 7);
    });
  await page.evaluate(() => Reflect.get(window, "denyOldCopy")());
  expect(await page.evaluate(() => Reflect.get(window, "fallbackCalls"))).toBe(0);
  expect(
    await page
      .getByRole("textbox", { name: "Other selection" })
      .evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([0, 7]);
});

test("a superseded denied copy cannot run a fallback after a newer success", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Reflect.set(window, "fallbackCalls", 0);
    document.execCommand = () => {
      Reflect.set(window, "fallbackCalls", Reflect.get(window, "fallbackCalls") + 1);
      return false;
    };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () =>
          ++calls === 1
            ? new Promise((_resolve, reject) =>
                Reflect.set(window, "denyOldCopy", () => reject(Error("old denied"))),
              )
            : Promise.resolve(),
      },
    });
  });
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const source = "/visual/copy-feedback.fixture.tsx";
    (await import(source)).mountCopyFixture();
  });
  await page.locator(".nk-code-source-toggle").click();
  const button = page.getByRole("button", { name: "Copy patch", exact: true });
  await button.click();
  await button.click();
  await expect(button).toHaveAttribute("data-copy-state", "copied");
  await page.evaluate(() => Reflect.get(window, "denyOldCopy")());
  expect(await page.evaluate(() => Reflect.get(window, "fallbackCalls"))).toBe(0);
  await expect(button).toHaveAttribute("data-copy-state", "copied");
});
