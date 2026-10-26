import { defineConfig } from "@playwright/test";

const external = process.env.UI_TEST_URL;
export default defineConfig({
  testDir: "./visual",
  testMatch: "**/*.visual.ts",
  outputDir: "artifacts/component-tests",
  snapshotPathTemplate:
    process.env.VISUAL_BASELINE === "ubuntu-24"
      ? "{testDir}/baselines/ubuntu-24/{projectName}/{arg}{ext}"
      : "{testDir}/baselines/{projectName}/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: external ?? "http://127.0.0.1:3153",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    colorScheme: "dark",
    reducedMotion: "no-preference",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: external
    ? undefined
    : {
        command: "bun run dev:framework --host 127.0.0.1 --port 3153 --strictPort",
        url: "http://127.0.0.1:3153",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
