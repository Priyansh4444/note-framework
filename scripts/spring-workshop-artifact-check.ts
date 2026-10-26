import { chromium, type Locator } from "playwright";
import { expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
async function exercise(root: Locator) {
  const rig = root.locator("#spring-instrument"),
    grip = root.getByRole("slider", { name: "Carriage displacement" });
  await grip.press("End");
  await expect(rig).toHaveAttribute("data-x", "30");
  await grip.press(" ");
  await expect(rig).toHaveAttribute("data-active", "true");
  await root.getByRole("button", { name: "Too much", exact: true }).click();
  await expect
    .poll(async () => Math.abs(Number(await rig.getAttribute("data-x"))))
    .toBeLessThan(0.05);
  await root.getByRole("button", { name: "Give it a nudge" }).click();
  await expect(rig).toHaveAttribute("data-active", "true");
  await root.getByRole("button", { name: "Hold still", exact: true }).click();
  await expect(rig).toHaveAttribute("data-held", "true");
  await root.getByRole("button", { name: "Paper off", exact: true }).click();
  await expect(rig.locator(".spring-card")).toHaveAttribute("data-theme", "light");
}
const browser = await chromium.launch();
const html = readFileSync("dist-spring-workshop-single/index.html");
const server = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    req.url === "/content"
      ? html
      : '<!doctype html><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts" title="Spring note" src="/content"></iframe>',
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = process.env.FRAMEWORK_REVIEW_URL ?? "http://localhost:3152";
  await page.goto(base + "/");
  await page.getByRole("link", { name: "a spring you can feel", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A little room to settle");
  await exercise(page.locator("body"));
  await page.goto(base + "/docs");
  await page.getByRole("link", { name: "a spring you can feel", exact: true }).click();
  await expect(page.locator("#spring-instrument")).toBeVisible();
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No local server address");
  const origin = `http://127.0.0.1:${address.port}`,
    external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("data:")) external.push(r.url());
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  const root = page.frameLocator("iframe").locator("body");
  expect(await root.evaluate(() => globalThis.origin)).toBe("null");
  await exercise(root);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    "PASS: production discovery, drag keyboard/release/damping/hold/paper actions, opaque standalone without external resources.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}
