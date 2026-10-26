# Test components in Chromium

Run `bun install`, then `bun run visual:install` once to install the pinned Playwright Chromium. Vitest 5 requires Node 22.12+, 24+, or 26+; these commands were verified with Node 24.22.1 and Bun 1.4.4.

```sh
bun run test:components:vitest
bun run test:visual
```

The first command runs four component behavior tests and eight screenshot tests. The second runs only the screenshots. The existing `bun run test` unit suite and `bun run test:components` Playwright page suite keep their own runners.

`vitest.components.config.ts` starts its own Vite browser server. Tests render the real Solid components in headless Chromium through the Playwright provider. They load the app's local fonts, theme, kit styles, and spring variables. No application router, article lifecycle, remote font request, or DOM simulator is involved.

## Add a test

Create a file named `component-tests/<name>.browser.tsx`. The `.browser.tsx` suffix keeps Bun's unit discovery from collecting Vitest tests. Import `test` and `expect` from `vitest`, browser actions from `vitest/browser`, and `mount` from `./mount`.

Pass a function to `mount` so signals and cleanup belong to the component's Solid owner. Each test can unmount explicitly; the shared teardown disposes all remaining roots before removing their DOM. Teardown also rejects browser error events and unhandled promise rejections. Use actual keyboard/click actions and assert the resulting value, selected form, or geometry before taking a screenshot.

The included behavior tests cover native range sanitization, curved timeline seeking, persistent drawing nodes, and cleanup of the retained canvas runtime. The screenshots cover the three portable curve recipes and both control types at 1280px and 390px. `painted()` waits for local fonts and two animation frames before capture.

## Review a visual change

Baselines are committed under `component-tests/__screenshots__/visual.browser.tsx/`. They are Linux Chromium images at DPR 1, dark mode, and reduced motion. Reduced motion makes endpoint screenshots deterministic; interrupted and continuous motion remain covered by the existing Playwright tests.

When a visual change is intentional, run this separate update command:

```sh
bun run test:visual:update
```

Inspect every changed PNG, then rerun `bun run test:visual` without `--update`. Commit the images with the relevant component change. Missing references fail the normal run even when Vitest writes a candidate reference. Never use the update command as a CI check.

Failures produce actual and diff attachments under `.vitest/`. The comparator allows zero mismatched pixels outside its antialias/color threshold. Different operating systems, browser revisions, or font renderers need their own reviewed references; do not raise the mismatch allowance to hide a layout change.

The initial harness was checked by temporarily changing the test surface padding from 16px to 32px. The existing morph screenshot failed, then passed again after restoring the original padding. This proves the comparison detects an actual spacing regression.

The independent starter includes the config, mount helper, tests, and eight binary reference images through an explicit export allowlist. A fresh export was installed outside this checkout, passed all 12 browser tests, and built both its ordinary note and self-contained HTML. It does not require an application router, the repository's page-test fixtures, or a sibling course archive.

See the official [Vitest browser component guide](https://vitest.dev/guide/browser/component-testing) and [visual regression guide](https://vitest.dev/guide/browser/visual-regression-testing) for the browser and screenshot APIs.

Ubuntu 24 CI sets `VITE_VISUAL_BASELINE=ubuntu-24` and uses separately reviewed references with that suffix. These eight images were captured by the pinned CI browser and reviewed for geometry and readability. The default references retain the local Linux renderer. Pixel allowances remain zero; renderer differences never relax spacing or interaction assertions.

The page suite similarly selects `visual/baselines/ubuntu-24/` with `VISUAL_BASELINE=ubuntu-24`. Three native range renders have reviewed Ubuntu references; the other existing images already passed CI and are shared byte-for-byte. Neither suite raises its pixel allowance for a different platform.
