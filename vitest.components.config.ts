import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";

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
