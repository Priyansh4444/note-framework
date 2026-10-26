import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { studies } from "../src/notes/framework/study-registry";
const origin = process.env.STUDY_ORIGIN ?? "http://localhost:3151";
mkdirSync("public/studies/previews", { recursive: true });
mkdirSync("artifacts/all-studies/posters", { recursive: true });
const browser = await chromium.launch();
try {
  for (const study of studies) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(origin + study.href + (study.id === "hairline" ? "?at=204,116" : ""), {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    const selectors: Record<string, string> = {
      hairline: "#stage svg",
      "mechanical-arm": "#mechanism",
      morph: "#field",
      ink: "#ink",
      anatomy: ".spring-card",
    };
    const node = page.locator(selectors[study.id]);
    await node.waitFor({ state: "visible" });
    if (study.id === "hairline") await page.waitForTimeout(1100);
    const source = `artifacts/all-studies/posters/${study.id}.png`;
    if (study.id === "ink") {
      const data = await node.evaluate((n) => {
        const canvas = n as HTMLCanvasElement,
          poster = document.createElement("canvas");
        poster.width = canvas.width;
        poster.height = canvas.height;
        const ctx = poster.getContext("2d")!;
        ctx.fillStyle = getComputedStyle(document.documentElement).backgroundColor;
        ctx.fillRect(0, 0, poster.width, poster.height);
        ctx.drawImage(canvas, 0, 0);
        return poster.toDataURL("image/png");
      });
      writeFileSync(source, Buffer.from(data.split(",")[1], "base64"));
    } else await node.screenshot({ path: source });
    const crop = study.id === "ink" ? "crop=iw*.65:ih:iw*.35:0," : "";
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        source,
        "-vf",
        crop + "scale=720:450:force_original_aspect_ratio=increase,crop=720:450",
        "-quality",
        "84",
        `public/studies/previews/${study.id}.webp`,
      ],
      { stdio: "ignore" },
    );
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("Five posters captured from the actual studies.");
