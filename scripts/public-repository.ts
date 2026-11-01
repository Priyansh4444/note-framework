#!/usr/bin/env bun
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = realpathSync(resolve(import.meta.dirname, ".."));
const SOURCE_ROOT = existsSync(join(ROOT, "..", ".git")) ? dirname(ROOT) : ROOT;
const DATABASE_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

// Reviewed source paths only: never crawl the workspace, secrets or Git history.
export const PUBLIC_REPOSITORY_FILES = [
  ".agents/skills/explorable-explanations/SKILL.md",
  ".agents/skills/explorable-explanations/references/case-studies.md",
  ".agents/skills/hairline-create/LICENSE",
  ".agents/skills/hairline-create/SKILL.md",
  ".agents/skills/hairline-create/UPSTREAM.md",
  ".agents/skills/hairline-create/bench.html",
  ".agents/skills/hairline-create/build.mjs",
  ".agents/skills/hairline-create/concepts.md",
  ".agents/skills/hairline-create/examples/riffle.js",
  ".agents/skills/hairline-create/examples/terrain.js",
  ".agents/skills/hairline-create/kernel.js",
  ".agents/skills/hairline-create/look.md",
  ".agents/skills/hairline-create/look.mjs",
  ".agents/skills/hairline-create/read.mjs",
  ".agents/skills/hairline-create/rules.md",
  ".agents/skills/hairline-create/source.md",
  ".agents/skills/hairline-create/validate.mjs",
  ".agents/skills/ink-figures/SKILL.md",
  ".agents/skills/layer-figures/SKILL.md",
  ".agents/skills/morph-figures/SKILL.md",
  ".agents/skills/note-explainers/SKILL.md",
  ".agents/skills/note-explainers/references/authoring-decisions.md",
  ".agents/skills/note-explainers/references/authoring-tools.md",
  ".agents/skills/note-explainers/references/reader-contract.md",
  ".agents/skills/note-explainers/references/taste.md",
  ".gitignore",
  ".oxfmtrc.json",
  ".oxlintrc.json",
  "AGENTS.md",
  "MECHANICAL-REFERENCE.md",
  "MOTION-REFERENCE.md",
  "MOTION-STUDIES.md",
  "PATTERNS.md",
  "README.md",
  "SVG-EXPLORATION.md",
  "bun.lock",
  "component-tests/__screenshots__/visual.browser.tsx/controls-1280-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/controls-390-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/ink-1280-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/ink-390-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/layers-1280-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/layers-390-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/morph-1280-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/morph-390-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/controls-1280-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/controls-390-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/ink-1280-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/ink-390-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/layers-1280-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/layers-390-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/morph-1280-ubuntu-24-chromium-linux.png",
  "component-tests/__screenshots__/visual.browser.tsx/morph-390-ubuntu-24-chromium-linux.png",
  "component-tests/behavior.browser.tsx",
  "component-tests/mount.tsx",
  "component-tests/setup.ts",
  "component-tests/surface.css",
  "component-tests/visual.browser.tsx",
  "docs/component-testing.md",
  "docs/pattern-ink.png",
  "docs/pattern-layers.png",
  "docs/pattern-morph.png",
  "docs/public-beta.md",
  "docs/council-review.md",
  "docs/public-repository.md",
  "index.html",
  "knip.jsonc",
  "package.json",
  "playwright.config.ts",
  "public/favicon.svg",
  "public/studies/hairline/LICENSE",
  "public/studies/hairline/index.html",
  "public/studies/ink/index.html",
  "public/studies/mechanical-arm/index.html",
  "public/studies/morph/index.html",
  "public/studies/previews/anatomy.webp",
  "public/studies/previews/hairline.webp",
  "public/studies/previews/ink.webp",
  "public/studies/previews/mechanical-arm.webp",
  "public/studies/previews/morph.webp",
  "scripts/audit-measure.ts",
  "scripts/audit.test.ts",
  "scripts/audit.ts",
  "scripts/code-blocks.test.ts",
  "scripts/code-blocks.ts",
  "scripts/diff-morph.test.ts",
  "scripts/diff-morph.ts",
  "scripts/framework-preview-check.ts",
  "scripts/framework-preview.ts",
  "scripts/framework-release.ts",
  "scripts/framework-resources.ts",
  "scripts/inside-svg-artifact-check.ts",
  "scripts/note.ts",
  "scripts/notes.test.ts",
  "scripts/notes.ts",
  "scripts/pattern-export-check.mjs",
  "scripts/public-deploy.ts",
  "scripts/public-release.ts",
  "scripts/public-repository.test.ts",
  "scripts/public-repository.ts",
  "scripts/publication-policy.ts",
  "scripts/share-login.test.ts",
  "scripts/share.test.ts",
  "scripts/share.ts",
  "scripts/sharing-bootstrap.ts",
  "scripts/sharing-deploy.ts",
  "scripts/spring-workshop-artifact-check.ts",
  "scripts/spring-workshop-check.ts",
  "scripts/starter.test.ts",
  "scripts/starter.ts",
  "scripts/taste.ts",
  "scripts/taste-measure.ts",
  "scripts/taste.test.ts",
  "scripts/studies-check.mjs",
  "scripts/study-posters.ts",
  "sharing/DESIGN.md",
  "sharing/backend.test.ts",
  "sharing/migrations/0001_initial.sql",
  "sharing/migrations/0002_version_limit_and_key_revocations.sql",
  "sharing/migrations/0003_public_auth.sql",
  "sharing/protocol.ts",
  "sharing/public-auth.test.ts",
  "sharing/public-auth.ts",
  "sharing/public-testing.ts",
  "sharing/public-routes.test.ts",
  "sharing/public-worker.ts",
  "sharing/store.ts",
  "sharing/worker.ts",
  "src/App.tsx",
  "src/code-imports.d.ts",
  "src/components/ui/MathMorph.tsx",
  "src/components/ui/Tex.tsx",
  "src/components/ui/math.css",
  "src/components/ui/morph.ts",
  "src/framework-preview.tsx",
  "src/index.tsx",
  "src/kit/CodeBlock.tsx",
  "src/kit/CurveTimeline.tsx",
  "src/kit/DiagramViewer.tsx",
  "src/kit/Axes.tsx",
  "src/kit/Handle.tsx",
  "src/kit/Experiment.tsx",
  "src/kit/Parameter.SOURCES.md",
  "src/kit/Parameter.tsx",
  "src/kit/PathPlayhead.tsx",
  "src/kit/Wayfinder.tsx",
  "src/kit/anim.ts",
  "src/kit/code-block.css",
  "src/kit/code-morph-plan.ts",
  "src/kit/code-morph.ts",
  "src/kit/controls.test.ts",
  "src/kit/controls.ts",
  "src/kit/curve-timeline.css",
  "src/kit/experiment.css",
  "src/kit/index.ts",
  "src/kit/kit.css",
  "src/kit/layout.ts",
  "src/kit/marks.css",
  "src/kit/motion.css",
  "src/kit/motion.ts",
  "src/kit/note.tsx",
  "src/kit/parameter.css",
  "src/kit/parts.tsx",
  "src/kit/disclosure.tsx",
  "src/kit/patterns/InkFigure.tsx",
  "src/kit/patterns/LayerFigure.tsx",
  "src/kit/patterns/MorphFigure.tsx",
  "src/kit/patterns/SOURCES.md",
  "src/kit/patterns/ink-model.test.ts",
  "src/kit/patterns/ink-model.ts",
  "src/kit/patterns/ink.css",
  "src/kit/patterns/layer-model.test.ts",
  "src/kit/patterns/layer-model.ts",
  "src/kit/patterns/layer.css",
  "src/kit/patterns/morph-model.test.ts",
  "src/kit/patterns/morph-model.ts",
  "src/kit/patterns/morph.css",
  "src/kit/patterns/recipe-model.test.ts",
  "src/kit/patterns/recipe-model.ts",
  "src/kit/patterns/recipes.tsx",
  "src/kit/playback.test.ts",
  "src/kit/playback.ts",
  "src/kit/reader.css",
  "src/kit/scene-audio.test.ts",
  "src/kit/scene-audio.ts",
  "src/kit/timeline-model.test.ts",
  "src/kit/timeline-model.ts",
  "src/kit/ui.css",
  "src/kit/ui.tsx",
  "src/kit/wayfinder-model.test.ts",
  "src/kit/wayfinder-model.ts",
  "src/notes/framework-demo/bezier/CurveScene.tsx",
  "src/notes/framework-demo/bezier/Handles.tsx",
  "src/notes/framework-demo/bezier/model.test.ts",
  "src/notes/framework-demo/bezier/model.ts",
  "src/notes/framework-demo/bezier/store.ts",
  "src/notes/framework-demo/chapters.ts",
  "src/notes/framework-demo/demo.css",
  "src/notes/framework-demo/examples/de-casteljau.ts",
  "src/notes/framework-demo/examples/lerp.diff",
  "src/notes/framework-demo/figures/Construction.tsx",
  "src/notes/framework-demo/figures/Flatten.tsx",
  "src/notes/framework-demo/figures/Mix.tsx",
  "src/notes/framework-demo/figures/Weights.tsx",
  "src/notes/framework-demo/glossary.tsx",
  "src/notes/framework-demo/index.tsx",
  "src/notes/framework-demo/note.json",
  "src/notes/framework/Account.tsx",
  "src/notes/framework/ComponentLab.tsx",
  "src/notes/framework/Docs.tsx",
  "src/notes/framework/Pattern.tsx",
  "src/notes/framework/Slider.tsx",
  "src/notes/framework/Studies.tsx",
  "src/notes/framework/Sweep.tsx",
  "src/notes/framework/UploadForm.tsx",
  "src/notes/framework/account-api.ts",
  "src/notes/framework/account.css",
  "src/notes/framework/component-lab.css",
  "src/notes/framework/framework.css",
  "src/notes/framework/guide.css",
  "src/notes/framework/guide/Prose.tsx",
  "src/notes/framework/guide/check.sh",
  "src/notes/framework/guide/publish.sh",
  "src/notes/framework/guide/share.sh",
  "src/notes/framework/guide/start.sh",
  "src/notes/framework/guide/upload.sh",
  "src/notes/framework/home/HeroCurve.tsx",
  "src/notes/framework/home/Specimens.tsx",
  "src/notes/framework/home/links.ts",
  "src/notes/framework/index.tsx",
  "src/notes/framework/note.json",
  "src/notes/framework/studies.css",
  "src/notes/framework/study-registry.ts",
  "src/notes/inside-svg/Artwork.tsx",
  "src/notes/inside-svg/Experiments.tsx",
  "src/notes/inside-svg/chapters.ts",
  "src/notes/inside-svg/index.tsx",
  "src/notes/inside-svg/model.test.ts",
  "src/notes/inside-svg/model.ts",
  "src/notes/inside-svg/note.json",
  "src/notes/inside-svg/svg.css",
  "src/notes/navigation.css",
  "src/notes/shared-service/ServiceFigure.tsx",
  "src/notes/shared-service/chapters.ts",
  "src/notes/shared-service/index.tsx",
  "src/notes/shared-service/model.test.ts",
  "src/notes/shared-service/model.ts",
  "src/notes/shared-service/note.json",
  "src/notes/shared-service/service.css",
  "src/notes/spring-workshop/DESIGN.md",
  "src/notes/spring-workshop/Instrument.tsx",
  "src/notes/spring-workshop/geometry.ts",
  "src/notes/spring-workshop/index.tsx",
  "src/notes/spring-workshop/model.test.ts",
  "src/notes/spring-workshop/model.ts",
  "src/notes/spring-workshop/note.json",
  "src/notes/spring-workshop/paint-order.json",
  "src/notes/spring-workshop/spring.css",
  "src/notes/spring-workshop/vendor/LICENSE",
  "src/notes/spring-workshop/vendor/README.md",
  "src/notes/spring-workshop/vendor/iso-kit.ts",
  "src/notes/spring-workshop/vendor/iso.css",
  "src/notes/spring-workshop/verification/audit.mjs",
  "src/notes/spring-workshop/verification/dynamic.mjs",
  "src/notes/spring-workshop/verification/vendor/LICENSE",
  "src/notes/spring-workshop/verification/vendor/audit.mjs",
  "src/notes/spring-workshop/verification/vendor/iso-kit.mjs",
  "src/notes/spring-workshop/verification/vendor/lathe.mjs",
  "src/notes/spring-workshop/verification/vendor/line-ends.d.mts",
  "src/notes/spring-workshop/verification/vendor/line-ends.mjs",
  "src/notes/spring-workshop/verification/vendor/tube.mjs",
  "src/post/post.css",
  "src/post/scene/Scene.tsx",
  "src/post/scene/clock.test.ts",
  "src/post/scene/clock.ts",
  "src/post/scene/springs.ts",
  "src/post/scene/tooltip.tsx",
  "src/post/theme.css",
  "src/single.tsx",
  "src/virtual-notes.d.ts",
  "studies/hairline/README.md",
  "studies/hairline/build.mjs",
  "studies/hairline/folios.js",
  "studies/hairline/verify.mjs",
  "studies/ink/DESIGN.md",
  "studies/ink/FONT-LICENSE.txt",
  "studies/ink/README.md",
  "studies/ink/build.py",
  "studies/ink/index.html",
  "studies/ink/scene.js",
  "studies/ink/style.css",
  "studies/ink/verify.mjs",
  "studies/manifest.json",
  "studies/mechanical-arm/PLAN.md",
  "studies/mechanical-arm/README.md",
  "studies/mechanical-arm/app.js",
  "studies/mechanical-arm/browser-check.mjs",
  "studies/mechanical-arm/build.mjs",
  "studies/mechanical-arm/model.js",
  "studies/mechanical-arm/model.test.js",
  "studies/mechanical-arm/page.html",
  "studies/morph/README.md",
  "studies/morph/build.mjs",
  "studies/morph/index.html",
  "studies/morph/verify.mjs",
  "templates/note/chapters.ts",
  "templates/note/examples/selection.ts",
  "templates/note/figures/FillFigure.tsx",
  "templates/note/glossary.tsx",
  "templates/note/index.tsx",
  "templates/note/note.css",
  "templates/note/note.json",
  "templates/starter/AGENTS.md",
  "templates/starter/README.md",
  "templates/starter/SKILL.md",
  "templates/starter/authoring-tools.md",
  "templates/starter/favicon.svg",
  "templates/starter/index.html",
  "templates/starter/reader-contract.md",
  "templates/starter/recipes.tsx",
  "templates/starter/taste.md",
  "templates/starter/vite.config.ts",
  "tools/oxlint/LICENSE",
  "tools/oxlint/SOURCES.md",
  "tools/oxlint/index.ts",
  "tools/oxlint/rules.test.ts",
  "tools/oxlint/rules/no-low-value-comments.ts",
  "tools/oxlint/rules/no-native-title-tooltip.ts",
  "tools/oxlint/rules/require-suppression-reason.ts",
  "tsconfig.json",
  "visual/baselines/chromium/check-1280.png",
  "visual/baselines/chromium/check-320.png",
  "visual/baselines/chromium/check-390.png",
  "visual/baselines/chromium/curved-timeline-1440.png",
  "visual/baselines/chromium/curved-timeline-320.png",
  "visual/baselines/chromium/curved-timeline-390.png",
  "visual/baselines/chromium/curved-timeline-768.png",
  "visual/baselines/chromium/disabled-range-1280.png",
  "visual/baselines/chromium/disabled-range-320.png",
  "visual/baselines/chromium/disabled-range-390.png",
  "visual/baselines/chromium/disclosure-focus-1280.png",
  "visual/baselines/chromium/disclosure-focus-320.png",
  "visual/baselines/chromium/disclosure-focus-390.png",
  "visual/baselines/chromium/disclosure-open-1280.png",
  "visual/baselines/chromium/disclosure-open-320.png",
  "visual/baselines/chromium/disclosure-open-390.png",
  "visual/baselines/chromium/example-nav-1280.png",
  "visual/baselines/chromium/example-nav-320.png",
  "visual/baselines/chromium/example-nav-390.png",
  "visual/baselines/chromium/guide-range-focus.png",
  "visual/baselines/chromium/long-disclosure-1280.png",
  "visual/baselines/chromium/long-disclosure-320.png",
  "visual/baselines/chromium/long-disclosure-390.png",
  "visual/baselines/chromium/long-range-1280.png",
  "visual/baselines/chromium/long-range-320.png",
  "visual/baselines/chromium/long-range-390.png",
  "visual/baselines/chromium/range-1280.png",
  "visual/baselines/chromium/range-320.png",
  "visual/baselines/chromium/range-390.png",
  "visual/baselines/chromium/slider-drag.png",
  "visual/baselines/chromium/slider-forced-colors.png",
  "visual/baselines/chromium/slider-release-0.png",
  "visual/baselines/chromium/slider-release-120.png",
  "visual/baselines/chromium/slider-release-60.png",
  "visual/baselines/chromium/slider-release-rest.png",
  "visual/baselines/chromium/wrapped-summary-enlarged.png",
  "visual/baselines/ubuntu-24/chromium/wrapped-summary-enlarged.png",
  "visual/baselines/ubuntu-24/chromium/range-1280.png",
  "visual/baselines/ubuntu-24/chromium/long-range-1280.png",
  "visual/baselines/ubuntu-24/chromium/disabled-range-1280.png",
  "visual/baselines/ubuntu-24/chromium/long-disclosure-1280.png",
  "visual/baselines/ubuntu-24/chromium/check-1280.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-focus-1280.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-open-1280.png",
  "visual/baselines/ubuntu-24/chromium/example-nav-1280.png",
  "visual/baselines/ubuntu-24/chromium/range-390.png",
  "visual/baselines/ubuntu-24/chromium/long-range-390.png",
  "visual/baselines/ubuntu-24/chromium/disabled-range-390.png",
  "visual/baselines/ubuntu-24/chromium/long-disclosure-390.png",
  "visual/baselines/ubuntu-24/chromium/check-390.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-focus-390.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-open-390.png",
  "visual/baselines/ubuntu-24/chromium/example-nav-390.png",
  "visual/baselines/ubuntu-24/chromium/range-320.png",
  "visual/baselines/ubuntu-24/chromium/long-range-320.png",
  "visual/baselines/ubuntu-24/chromium/disabled-range-320.png",
  "visual/baselines/ubuntu-24/chromium/long-disclosure-320.png",
  "visual/baselines/ubuntu-24/chromium/check-320.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-focus-320.png",
  "visual/baselines/ubuntu-24/chromium/disclosure-open-320.png",
  "visual/baselines/ubuntu-24/chromium/example-nav-320.png",
  "visual/baselines/ubuntu-24/chromium/slider-drag.png",
  "visual/baselines/ubuntu-24/chromium/slider-release-0.png",
  "visual/baselines/ubuntu-24/chromium/slider-release-60.png",
  "visual/baselines/ubuntu-24/chromium/slider-release-120.png",
  "visual/baselines/ubuntu-24/chromium/slider-release-rest.png",
  "visual/baselines/ubuntu-24/chromium/slider-forced-colors.png",
  "visual/baselines/ubuntu-24/chromium/guide-range-focus.png",
  "visual/baselines/ubuntu-24/chromium/curved-timeline-1440.png",
  "visual/baselines/ubuntu-24/chromium/curved-timeline-768.png",
  "visual/baselines/ubuntu-24/chromium/curved-timeline-390.png",
  "visual/baselines/ubuntu-24/chromium/curved-timeline-320.png",
  "visual/browser-test.ts",
  "visual/code-morph.visual.ts",
  "visual/code-page-motion.visual.ts",
  "visual/code-spacing.visual.ts",
  "visual/controls.visual.ts",
  "visual/curve-timeline.fixture.tsx",
  "visual/curve-timeline.visual.ts",
  "visual/fixture.html",
  "visual/inside-svg-integration.visual.ts",
  "visual/inside-svg.visual.ts",
  "visual/motion.visual.ts",
  "visual/mix-interaction.visual.ts",
  "visual/r8-integration.visual.ts",
  "visual/weights-r8.visual.ts",
  "visual/flatten-r8.visual.ts",
  "visual/figure-anatomy.visual.ts",
  "visual/editorial-pages.visual.ts",
  "visual/parameter.fixture.tsx",
  "visual/parameter.visual.ts",
  "visual/patterns.fixture.tsx",
  "visual/patterns.visual.ts",
  "visual/playback.visual.ts",
  "visual/public-navigation.visual.ts",
  "visual/public-account.visual.ts",
  "visual/rapid-input.visual.ts",
  "visual/rounded-playhead.visual.ts",
  "visual/scene-audio.fixture.tsx",
  "visual/scene-audio.visual.ts",
  "visual/scene-control.ts",
  "visual/scene-controls.visual.ts",
  "visual/shared-service.fixture.tsx",
  "visual/shared-service.visual.ts",
  "visual/spring-workshop.visual.ts",
  "visual/wayfinder.visual.ts",
  "visual/taste.visual.ts",
  "vite.config.ts",
  "vitest.components.config.ts",
  "wrangler.public.jsonc",
  "wrangler.sharing.jsonc",
] as const;

const PUBLIC_LICENSE =
  'MIT License\n\nCopyright (c) 2026 Note Framework contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n\nThird-party material retains its respective license and attribution notices.\n';

const PUBLIC_CI =
  "name: Framework checks\non:\n  pull_request:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  framework:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\n        with:\n          bun-version: 1.4.4\n      - run: bun install --frozen-lockfile\n      - run: bunx playwright install --with-deps chromium\n      - run: bun run check:all\n      - run: bun run test:components:vitest\n        env:\n          VITE_VISUAL_BASELINE: ubuntu-24\n      - run: bun run public:build\n      - run: bun run test:components\n        env:\n          VISUAL_BASELINE: ubuntu-24\n      - name: Test the public Worker and account UI\n        shell: bash\n        run: |\n          set -euo pipefail\n          bunx wrangler d1 migrations apply note-framework-public-beta --local --config wrangler.public.jsonc\n          bunx wrangler d1 execute note-framework-public-beta --local --config wrangler.public.jsonc --command 'UPDATE public_settings SET enabled=1 WHERE id=1'\n          bun run public:dev > /tmp/public-worker.log 2>&1 &\n          worker_pid=$!\n          trap 'kill \"$worker_pid\" || true' EXIT\n          for attempt in {1..30}; do\n            if curl --fail --silent http://localhost:3160/healthz > /dev/null; then break; fi\n            sleep 1\n          done\n          curl --fail --silent http://localhost:3160/healthz\n          PUBLIC_TEST_URL=http://localhost:3160 UI_TEST_URL=http://localhost:3160 bunx playwright test visual/public-account.visual.ts visual/public-navigation.visual.ts\n      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n        if: failure()\n        with:\n          name: framework-failures\n          include-hidden-files: true\n          path: |\n            .vitest/\n            artifacts/\n          retention-days: 7\n";

function inside(parent: string, path: string): boolean {
  const part = relative(parent, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

function rejectSymlinks(path: string): void {
  for (let current = path; ; current = dirname(current)) {
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Path must not use a symlink: ${current}`);
    if (dirname(current) === current) return;
  }
}

function destination(directory: string): string {
  if (!directory.trim()) throw new Error("Choose an external empty directory.");
  const target = resolve(directory);
  rejectSymlinks(target);
  if (inside(SOURCE_ROOT, target) || inside(target, SOURCE_ROOT))
    throw new Error("Destination must be outside the source repository and must not contain it.");
  const info = lstatSync(target, { throwIfNoEntry: false });
  if (info && (!info.isDirectory() || readdirSync(target).length))
    throw new Error(`Destination is not an empty directory: ${target}`);
  return target;
}

function source(file: string): Buffer {
  const path = resolve(ROOT, file);
  if (!inside(ROOT, path)) throw new Error(`Invalid export path: ${file}`);
  rejectSymlinks(path);
  if (!lstatSync(path).isFile()) throw new Error(`Not a regular source file: ${file}`);
  return readFileSync(path);
}

function adapt(file: string, bytes: Buffer): Buffer {
  const text = () =>
    bytes
      .toString("utf8")
      .replace(
        /\/home\/[^/\s`]+\/\.claude\/skills\/emil-design-eng\/SKILL\.md/g,
        "<local-skill-root>/emil-design-eng/SKILL.md",
      );
  let output: string;
  switch (file) {
    case "MOTION-STUDIES.md":
      output = text().replace(
        /^Original-source protection.*$/gm,
        "The public repository includes only framework and example sources; course archives and local operator data are excluded.",
      );
      break;
    case "package.json": {
      const pkg = JSON.parse(text());
      for (const name of ["build:filesystems", "deploy:filesystems", "build:cs169", "deploy:cs169"])
        delete pkg.scripts[name];
      pkg.scripts.build = "bun run framework:release && vite build";
      pkg.scripts["framework:export"] = "bun scripts/public-repository.ts";
      output = JSON.stringify(pkg, null, 2) + "\n";
      break;
    }
    case "vite.config.ts":
      output = text()
        .replace('import { cs169Resources } from "./scripts/cs169-resources.ts";\n', "")
        .replace(
          'const frameworkPreview = process.env.VITE_FRAMEWORK_PREVIEW === "1";',
          'const frameworkPreview = !single || process.env.VITE_FRAMEWORK_PREVIEW === "1";',
        )
        .replace(/\/\*\* Course resources:[\s\S]*?const resources =[\s\S]*?;\n\n/, "")
        .replace("    ...resources,\n", "")
        .replace(
          "  plugins: [",
          text().includes('    "import.meta.env.VITE_FRAMEWORK_PREVIEW":')
            ? "  plugins: ["
            : '  define: {\n    "import.meta.env.VITE_FRAMEWORK_PREVIEW": JSON.stringify(frameworkPreview ? "1" : "0"),\n  },\n  plugins: [',
        );
      break;
    case "knip.jsonc":
      output = text().replace(/^    "src\/notes\/(?:cs169|filesystems)\/.*\n/gm, "");
      break;
    case "wrangler.public.jsonc":
    case "wrangler.sharing.jsonc": {
      const config = JSON.parse(text());
      for (const db of config.d1_databases) db.database_id = DATABASE_PLACEHOLDER;
      output = JSON.stringify(config, null, 2) + "\n";
      break;
    }
    case "sharing/DESIGN.md":
      output = text().replace(
        /Database `note-framework-share`, ID `[a-f0-9-]+` already exists for this service\./,
        "Create your own database; the checked-in database ID is a placeholder.",
      );
      break;
    case ".agents/skills/note-explainers/SKILL.md":
      output = text().replace(
        " For course conventions, consult [legacy authoring](references/legacy-authoring.md).",
        "",
      );
      break;
    case "PATTERNS.md":
      output = text().replace(
        "The subsequent independent reviews, fixes, dead-code removals and lint adoption are recorded in [docs/review.md](docs/review.md). ",
        "",
      );
      break;
    case "src/kit/Parameter.SOURCES.md":
      output = text().replace(
        "Browser evidence and remaining platform limits are recorded in [PREVIEW.md](../../PREVIEW.md).",
        "Browser verification guidance is in [component testing](../../docs/component-testing.md).",
      );
      break;
    case "SVG-EXPLORATION.md":
      output = text().replace(
        "The complete component suite was not rerun; prior results remain documented in PREVIEW.md.",
        "See docs/component-testing.md for the current component checks.",
      );
      break;
    case "MECHANICAL-REFERENCE.md":
      output = text().replace(
        "The complete component suite was not rerun; earlier full-suite limitations in PREVIEW.md remain.",
        "See docs/component-testing.md for the current component checks.",
      );
      break;
    case "AGENTS.md":
      output = text()
        .replace(/- Course downloads,[^\n]*\n/, "")
        .replace(/- Serve course material[^\n]*\n/, "")
        .replace(
          /bun run dev                       # [^\n]*/,
          "bun run dev                       # framework home at http://localhost:3000",
        );
      break;
    case "README.md":
      output = text()
        .replace(" The independent review and cleanup are in `docs/review.md`.", "")
        .replace(
          "This workspace also contains existing authored notes; exports do not depend on them.",
          "This repository contains the framework, public examples and studies. Existing course notes and archives are excluded.",
        )
        .replace(
          "The checked-in database ID belongs to this deployment: create your own database and update",
          "The checked-in database ID is a placeholder: create your own database and update",
        );
      if (!output.includes("## Standalone source repository"))
        output +=
          "\n## Standalone source repository\n\n`bun run dev` opens the framework home. `bun run build` packages its portable starter and builds the isolated framework site. No course checkout is required. See [the export boundary and self-hosting notes](docs/public-repository.md).\n";
      break;
    case "docs/public-beta.md":
      output = text().replace(
        "The checked-in public Worker and D1 are separate from the original invitation service.",
        "The checked-in D1 ID is a placeholder; this repository does not configure access to the hosted beta.",
      );
      break;
    default:
      return file.endsWith(".md") ? Buffer.from(text()) : bytes;
  }
  return Buffer.from(output);
}

/** Export reviewed working-tree bytes, preserving binary assets exactly; never install or deploy. */
export function exportPublicRepository(directory: string): string {
  const target = destination(directory);
  // Read and validate every allowlisted file before creating the target or staging directory.
  const files = PUBLIC_REPOSITORY_FILES.map((file) => [file, adapt(file, source(file))] as const);
  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), ".framework-public-"));
  try {
    for (const [file, bytes] of [
      ...files,
      [".github/workflows/framework.yml", Buffer.from(PUBLIC_CI)] as const,
      ["LICENSE", Buffer.from(PUBLIC_LICENSE)] as const,
    ]) {
      const path = join(staging, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: "wx" });
    }
    destination(directory);
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return target;
}

if (import.meta.main) {
  const [directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length || directory.startsWith("-")) {
    console.error("Usage: bun scripts/public-repository.ts <new-empty-external-directory>");
    process.exitCode = 1;
  } else {
    try {
      console.log(`Exported public framework source to ${exportPublicRepository(directory)}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
