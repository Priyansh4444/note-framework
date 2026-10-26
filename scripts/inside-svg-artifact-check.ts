import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright";
import { expect } from "@playwright/test";

async function exercise(root: Locator) {
  const peel = root.locator("#svg-peel");
  const slider = peel.getByRole("slider", { name: "Separation", exact: true });
  await slider.press("End");
  await expect(peel).toHaveAttribute("data-nk-scene-time", "2600");
  await expect(peel.locator(".svg-plane-label").first()).toHaveCSS("opacity", "1");
  await slider.press("Home");
  await expect(peel).toHaveAttribute("data-nk-scene-time", "0");
  const order = root.locator("#svg-order");
  await order.scrollIntoViewIfNeeded();
  const paintAt = () =>
    order.locator(".svg-artwork").evaluate((node) => {
      const svg = node as SVGSVGElement;
      const point = new DOMPoint(160, 140).matrixTransform(svg.getScreenCTM()!);
      return document
        .elementFromPoint(point.x, point.y)
        ?.closest("[data-layer]")
        ?.getAttribute("data-layer");
    });
  expect(await paintAt()).toBe("rear");
  await order.getByRole("button", { name: "Bring the sun forward" }).click();
  expect(await paintAt()).toBe("sun");
  const clip = root.locator("#svg-clip");
  const circle = clip.locator('[data-layer="sun"]');
  const original = await circle.evaluate((node) => node.outerHTML);
  await clip.getByRole("button", { name: "Right", exact: true }).click();
  await expect(clip.locator("clipPath path")).toHaveAttribute("transform", "translate(42 0)");
  await clip.getByRole("button", { name: "Show beyond the window" }).click();
  await expect(clip.locator("[data-scenery]")).not.toHaveAttribute("clip-path");
  expect(await circle.evaluate((node) => node.outerHTML)).toBe(original);
}

async function checkBuilt(page: Page, base: string) {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`${base}/`);
  await page.getByRole("link", { name: "a picture you can take apart", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A picture, made of shapes");
  await exercise(page.locator("body"));
  await page.goto(`${base}/docs`);
  await page.getByRole("link", { name: "take a picture apart", exact: true }).click();
  await expect(page.locator("#svg-peel")).toBeVisible();
}

async function checkOpaque(page: Page) {
  const html = readFileSync("dist-inside-svg-single/index.html");
  const requests: string[] = [];
  let server!: Server;
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      req.url === "/content"
        ? html
        : '<!doctype html><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe title="Standalone SVG note" sandbox="allow-scripts" src="/content"></iframe>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local server address");
    const origin = `http://127.0.0.1:${address.port}`;
    page.on("request", (request) => {
      if (!request.url().startsWith(origin) && !request.url().startsWith("data:"))
        requests.push(request.url());
    });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(origin, { waitUntil: "networkidle" });
    const root = page.frameLocator("iframe").locator("body");
    await expect(root.locator("#svg-peel")).toBeVisible();
    expect(await root.evaluate(() => globalThis.origin)).toBe("null");
    await exercise(root);
    expect(requests).toEqual([]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const browser = await chromium.launch();
const errors: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await checkBuilt(page, process.env.FRAMEWORK_REVIEW_URL ?? "http://localhost:3152");
  await checkOpaque(page);
  expect(errors).toEqual([]);
  console.log(
    "PASS: built discovery/three interactions; opaque standalone interactions without external resources; no runtime errors.",
  );
} finally {
  await browser.close();
}
