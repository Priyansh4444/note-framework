// Drives the real pages in Firefox and WebKit. The Chromium suites are far deeper; this catches
// an engine that cannot run a route, play a figure, drag a handle or open a reminder.
import { firefox, webkit } from "playwright";

const origin = process.argv[2];
if (!origin) throw new Error("Usage: node scripts/cross-browser-check.mjs <origin>");
const ROUTES = [
  "/",
  "/docs",
  "/studies",
  "/notes/framework-demo",
  "/notes/shared-service",
  "/notes/inside-svg",
  "/notes/spring-workshop",
];
const failures = [];
const check = (where, passed) => {
  if (!passed) failures.push(where);
};
const settle = (page, ms = 700) => page.waitForTimeout(ms);

async function route(context, where, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(origin + path, { waitUntil: "load" });
  await settle(page);
  await page.evaluate(() => document.fonts.ready);
  const { overflow, fonts } = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    fonts: [...document.fonts].filter((font) => font.status === "loaded").length,
  }));
  check(`${where} ${path}: no sideways scrolling`, !overflow);
  check(`${where} ${path}: fonts load`, fonts > 0);
  check(`${where} ${path}: no errors (${errors[0] ?? ""})`, errors.length === 0);
  await page.close();
}

async function interactions(context, where) {
  const page = await context.newPage();
  await page.goto(`${origin}/notes/shared-service`, { waitUntil: "load" });
  await settle(page);
  const service = page.locator("#service-experiment");
  await service.scrollIntoViewIfNeeded();
  await service.locator("[data-nk-scene-action]").click();
  await settle(page, 1200);
  check(`${where} Service plays`, Number(await service.getAttribute("data-nk-scene-time")) > 300);
  check(
    `${where} Service fits`,
    await service.locator(".ss-diagram").evaluate((el) => el.scrollWidth <= el.clientWidth),
  );

  await page.goto(`${origin}/notes/framework-demo`, { waitUntil: "load" });
  await settle(page);
  const figure = page.locator("#construction");
  await figure.scrollIntoViewIfNeeded();
  const curve = () => figure.locator(".nk-curve").first().getAttribute("d");
  const changes = async (name, act) => {
    const before = await curve();
    await act();
    await settle(page, 300);
    check(`${where} ${name} changes the curve`, before !== (await curve()));
  };
  await changes("preset", () => figure.getByRole("radio", { name: "S bend" }).click());
  await settle(page);
  const handle = figure.getByRole("slider", { name: "Control point P₁", exact: true });
  await changes("arrow key", async () => {
    await handle.focus();
    await page.keyboard.press("Shift+ArrowRight");
  });
  await changes("drag", async () => {
    const box = await handle.boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 20, { steps: 5 });
    await page.mouse.up();
  });
  const term = page.locator(".term").first();
  await term.scrollIntoViewIfNeeded();
  await term.hover();
  await settle(page, 350);
  check(`${where} reminder opens`, await page.locator("#nk-reader-tooltip").isVisible());
  const more = page.locator(".nk-more").first();
  await more.locator("summary").click();
  check(`${where} disclosure opens`, await more.evaluate((el) => el.open));

  await page.goto(`${origin}/notes/spring-workshop`, { waitUntil: "load" });
  await settle(page);
  const spring = page.locator("#spring-instrument");
  await spring.scrollIntoViewIfNeeded();
  await spring.getByRole("button", { name: "Give it a nudge" }).click();
  await settle(page, 300);
  check(`${where} Spring moves`, Number(await spring.getAttribute("data-x")) !== 0);
  await page.close();
}

for (const [name, engine] of Object.entries({ firefox, webkit })) {
  const browser = await engine.launch();
  for (const width of [320, 1440]) {
    const where = `${name} ${width}px`;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "dark",
    });
    for (const path of ROUTES) await route(context, where, path);
    await interactions(context, where);
    await context.close();
  }
  console.log(`${name} ${browser.version()} checked`);
  await browser.close();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Cross-browser check passed.");
