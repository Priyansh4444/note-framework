import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";

// Renderer-specific references must be captured on that renderer, never relabelled locally.
if (
  process.env.VITE_VISUAL_BASELINE === "ubuntu-24" &&
  process.argv.some((arg) => /^(?:-u|--update)(?:=|$)/.test(arg))
) {
  const release = process.platform === "linux" ? readFileSync("/etc/os-release", "utf8") : "";
  if (!/^ID=ubuntu$/m.test(release) || !/^VERSION_ID="24\.04"$/m.test(release))
    throw new Error("Update ubuntu-24 screenshots on Ubuntu 24.04, or inspect its CI captures.");
}

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "node",
    include: ["component-tests/**/*.browser.tsx"],
    setupFiles: ["./component-tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 10_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        contextOptions: {
          colorScheme: "dark",
          reducedMotion: "reduce",
          deviceScaleFactor: 1,
          locale: "en-US",
        },
      }),
      instances: [{ browser: "chromium", viewport: { width: 1280, height: 900 } }],
      expect: {
        toMatchScreenshot: {
          comparatorOptions: { allowedMismatchedPixels: 0, threshold: 0.1 },
        },
      },
    },
  },
});
