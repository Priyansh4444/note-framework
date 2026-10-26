import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, createServer, type ViteDevServer } from "vite";
import solid from "vite-plugin-solid";
import { viteSingleFile } from "vite-plugin-singlefile";
import { chromium } from "playwright";
import { codeBlocks, compileCodeArtifact } from "./code-blocks";
import { CONTENT_CSP } from "./publication-policy";
import type { CodeArtifact, CodeBlockProps } from "../src/kit/CodeBlock";

const ROOT = resolve(import.meta.dirname, "..");
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
const patch = (name = "example.ts") =>
  `--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n`;
const unequalPatch = () =>
  `--- a/unequal.ts\n+++ b/unequal.ts\n@@ -1,4 +1,5 @@\n const context = 0;\n-const old = "${"A".repeat(200)}";\n-const short = 1;\n+const short = 2;\n+const next = "${"B".repeat(200)}";\n+const extra = 3;\n const tail = 4;\n`;

function sandbox() {
  const path = mkdtempSync(join(tmpdir(), "note-code-blocks-"));
  temporary.push(path);
  return path;
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function localServer(root: string) {
  const server = await createServer({
    root,
    configFile: false,
    plugins: [codeBlocks()],
    server: { middlewareMode: true },
    logLevel: "silent",
  });
  servers.push(server);
  return server;
}

async function imported(server: ViteDevServer, request: string, root: string) {
  const resolved = await server.pluginContainer.resolveId(request, join(root, "main.tsx"));
  expect(resolved?.id).toStartWith("\0note-code-block:");
  const loaded = await server.pluginContainer.load(resolved!.id);
  const module = typeof loaded === "string" ? loaded : loaded!.code;
  // The generated module is exactly JSON plus an export, not imported source code.
  return {
    module,
    artifact: JSON.parse(module.slice("export default ".length, -1)) as CodeArtifact,
  };
}

async function markupContents(html: string) {
  const tags: string[] = [];
  const attributes: string[] = [];
  const lines: string[] = [];
  const response = new HTMLRewriter()
    .on("*", {
      element(element) {
        tags.push(element.tagName);
        for (const [name] of element.attributes) attributes.push(name);
      },
    })
    .on("[data-line]", {
      text(chunk) {
        lines.push(chunk.text);
      },
    })
    .transform(new Response(html));
  await response.text();
  return { tags, attributes, text: lines.join("") };
}

test("Pierre produces deterministic unwrapped source with the measured GitHub Dark palette", async () => {
  const source = "// explain why\nexport const answer = (name: string) => `hello ${name} ${42}`;\n";
  const artifact = await compileCodeArtifact("code", "examples/answer.ts", source);
  expect(artifact).toEqual(await compileCodeArtifact("code", "examples/answer.ts", source));
  expect(artifact.source).toBe(source);
  expect(artifact.language).toBe("typescript");
  expect(artifact.prerenderedHTML).toContain(":host");
  expect(artifact.prerenderedHTML).toContain('data-overflow="scroll"');
  for (const color of ["#e1e4e8", "#f97583", "#79b8ff", "#9ecbff", "#6a737d"]) {
    expect(artifact.prerenderedHTML.toLowerCase()).toContain(color);
  }
  expect(artifact.prerenderedHTML).toContain("font-family:inherit");
  expect(artifact.prerenderedHTML).toContain("font-size:15px");
  expect(artifact.prerenderedHTML).toContain("::selection");
  expect(artifact.prerenderedHTML).toContain("color:#101010; background:#ffffff");
  expect((await markupContents(artifact.prerenderedHTML)).tags).toContain("pre");
});

test("both diff views preload one file, preserve patch text, and never read its paths", async () => {
  const source = patch("../../never-read/計算.ts");
  const artifact = await compileCodeArtifact("diff", "changes.diff", source);
  expect(artifact.kind).toBe("diff");
  if (artifact.kind !== "diff") throw new Error("expected diff artifact");
  expect(artifact.splitPrerenderedHTML).toContain('data-diff-type="split"');
  expect(artifact.splitPrerenderedHTML).not.toContain('data-unified=""');
  expect(artifact.splitPrerenderedHTML).toContain('data-overflow="wrap"');
  expect((await markupContents(artifact.splitPrerenderedHTML)).text).toContain("const value = 1;");
  expect((await markupContents(artifact.splitPrerenderedHTML)).text).toContain("const value = 2;");
  expect(artifact.splitPrerenderedHTML).toContain("#FFC799");
  expect(artifact.filename).toContain("never-read/計算.ts");
  expect(artifact.source).toBe(source);
  expect(artifact.prerenderedHTML).toContain('data-unified=""');
  expect(artifact.prerenderedHTML).toContain('<pre data-diff="" data-diff-type="single"');
  expect(artifact.prerenderedHTML).toContain('data-overflow="wrap"');
  expect(artifact.prerenderedHTML).toContain("#101010");
  expect(artifact.prerenderedHTML).toContain("#FFC799");
  expect(await compileCodeArtifact("diff", "changes.diff", source)).toEqual(artifact);
});

test("long tokens and unequal diff sides use Pierre's wrapped shared-row layout", async () => {
  const old = `const old = "${"A".repeat(200)}";`;
  const next = `const next = "${"B".repeat(200)}";`;
  const source = unequalPatch();
  const artifact = await compileCodeArtifact("diff", "unequal.diff", source);
  if (artifact.kind !== "diff") throw new Error("expected diff artifact");
  expect(artifact.source).toBe(source);
  const html = artifact.splitPrerenderedHTML;
  expect(html).toContain('data-overflow="wrap"');
  expect(html).toContain("minmax(260px,1fr)");
  expect(html).not.toContain("min-width:280px");
  expect(html).not.toContain("var(--diffs-grid-number-column-width) max-content");
  const parsed = await markupContents(html);
  for (const line of [old, next, "const extra = 3;", "const tail = 4;"]) {
    expect(parsed.text).toContain(line);
  }
  expect(html).toContain("grid-template-rows:subgrid");
});

test("explicit .txt and common source extensions are recognized", async () => {
  const text = await compileCodeArtifact("code", "literal.txt", "plain <>& text\n");
  expect(text.language).toBe("text");
  for (const filename of [
    "app.tsx",
    "app.js",
    "test.py",
    "main.rs",
    "style.css",
    "data.json",
    "run.sh",
    "README.md",
  ]) {
    expect((await compileCodeArtifact("code", filename, "example\n")).language).not.toBe("text");
  }
  await expect(compileCodeArtifact("code", "unknown.frobnicate", "literal")).rejects.toThrow(
    "explicit .txt?code",
  );
  await expect(
    compileCodeArtifact("diff", "unknown.diff", patch("unknown.frobnicate")),
  ).rejects.toThrow("unsupported language");
});

test("Unicode and script/style delimiters stay text, never executable nodes", async () => {
  const source =
    '\ufeffconst text = "計算 🦀 é </script><script>alert(1)</script></style><style>body{display:none}</style><img src=x onerror=alert(2)>";\r\n// \u2028 \u2029 & < >\r\n';
  const artifact = await compileCodeArtifact("code", "名-<script>.ts", source);
  const parsed = await markupContents(artifact.prerenderedHTML);
  expect(artifact.source).toBe(source);
  // HTMLRewriter reports escaped text chunks rather than decoding entities.
  expect(parsed.text).toContain(
    "計算 🦀 é &#x3C;/script>&#x3C;script>alert(1)&#x3C;/script>&#x3C;/style>&#x3C;style>",
  );
  expect(parsed.tags).not.toContain("script");
  expect(parsed.tags).not.toContain("img");
  expect(parsed.tags.filter((tag) => tag === "style")).toHaveLength(3);
  expect(parsed.attributes.some((name) => /^on/i.test(name))).toBe(false);
  const diff = await compileCodeArtifact(
    "diff",
    "unsafe.patch",
    patch().replace("+const value = 2;", '+const x = "</style><script>alert(3)</script> 🦀";'),
  );
  if (diff.kind !== "diff") throw new Error("expected diff artifact");
  for (const html of [diff.prerenderedHTML, diff.splitPrerenderedHTML]) {
    const parsed = await markupContents(html);
    expect(parsed.tags).not.toContain("script");
    expect(parsed.attributes.some((name) => /^on/i.test(name))).toBe(false);
  }
});

test("malformed, empty, binary, multiple-file and inconsistent patches fail clearly", async () => {
  const invalid: [string, RegExp][] = [
    ["", /empty patch/],
    ["not a patch", /malformed patch/],
    ["--- a/a.ts\n+++ b/a.ts\n", /empty patch/],
    [patch() + patch("other.ts"), /multi-file patch/],
    [patch().replace("@@ -1 +1 @@", "@@ -1,2 +1 @@"), /malformed patch/],
    [patch().replace("@@ -1 +1 @@", "@@ -zero +one @@"), /malformed patch/],
    [patch().replace("@@ -1 +1 @@", "@@ -0 +1 @@"), /invalid hunk range/],
    [patch() + "garbage\n", /malformed patch/],
    [patch() + "+extra\n", /malformed patch/],
    [patch().replace("+const value = 2;", "?const value = 2;"), /malformed patch/],
    [patch() + "@@ -1 +1 @@\n-a\n+b\n", /overlapping/],
    ["diff --git a/a.ts b/a.ts\nBinary files a/a.ts and b/a.ts differ\n", /malformed patch/],
    ["--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n same\n", /empty patch/],
  ];
  for (const [source, message] of invalid) {
    await expect(compileCodeArtifact("diff", "bad.patch", source)).rejects.toThrow(message);
  }
});

test("git patches, multiple hunks, new/deleted files and missing final newline work", async () => {
  const sources = [
    `diff --git a/example.ts b/example.ts\nindex 1234567..2345678 100644\n${patch()}`,
    patch() + "@@ -4 +4 @@\n-last\n+next\n",
    "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+const x = 1;\n",
    "--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-const x = 1;\n",
    "--- a/last.txt\n+++ b/last.txt\n@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n",
    patch().replaceAll("\n", "\r\n"),
  ];
  for (const source of sources)
    expect((await compileCodeArtifact("diff", "ok.patch", source)).source).toBe(source);
});

test("plugin uses resolved Vite root, preserves UTF-8 bytes and emits HTML-safe JSON", async () => {
  const root = sandbox();
  const source =
    '\ufeffthrow new Error("must never execute </script></style> 計算 🦀 \u2028 \u2029");\r\n';
  writeFileSync(join(root, "unsafe.ts"), source);
  writeFileSync(join(root, "change.diff"), patch());
  const server = await localServer(root);
  const code = await imported(server, "./unsafe.ts?code", root);
  const diff = await imported(server, "./change.diff?diff", root);
  expect(code.artifact.filename).toBe("unsafe.ts");
  expect(code.artifact.source).toBe(source);
  expect(diff.artifact.source).toBe(patch());
  expect(code.module).not.toContain(root);
  expect(code.module).not.toMatch(/[<>&\u2028\u2029]/);
  expect(diff.module).not.toMatch(/[<>&\u2028\u2029]/);
  expect(code.module).toBe((await imported(server, "./unsafe.ts?code", root)).module);
});

test("plugin refuses escapes, symlink escapes, directories, invalid UTF-8 and query shapes", async () => {
  const root = sandbox();
  const outside = sandbox();
  writeFileSync(join(outside, "secret.ts"), "do not read");
  symlinkSync(join(outside, "secret.ts"), join(root, "escape.ts"));
  mkdirSync(join(root, "folder.ts"));
  writeFileSync(join(root, "bad.ts"), new Uint8Array([0xff, 0xfe]));
  writeFileSync(join(root, "ok.ts"), "text");
  symlinkSync(join(root, "ok.ts"), join(root, "local.ts"));
  const server = await localServer(root);
  for (const source of [join(outside, "secret.ts") + "?code", "./escape.ts?code"]) {
    await expect(imported(server, source, root)).rejects.toThrow("inside the project root");
  }
  await expect(imported(server, "./folder.ts?code", root)).rejects.toThrow(
    /regular files|resolve a local/,
  );
  await expect(imported(server, "./bad.ts?code", root)).rejects.toThrow("valid UTF-8");
  for (const suffix of [
    "?code&raw",
    "?diff&code",
    "?code=true",
    "?code#fragment",
    "?code?raw",
    "?diff/raw",
  ]) {
    await expect(imported(server, "./ok.ts" + suffix, root)).rejects.toThrow("use exactly");
  }
  await expect(imported(server, "https://example.com/a.ts?code", root)).rejects.toThrow(
    "only local",
  );
  await expect(imported(server, "solid-js?code", root)).rejects.toThrow("only local");
  expect((await imported(server, "./local.ts?code", root)).artifact.source).toBe("text");
});

test("production probe wraps aligned split rows and preserves manual views and exact Copy in an opaque sandbox", async () => {
  const root = sandbox();
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
  );
  writeFileSync(
    join(root, "sample.ts"),
    'throw new Error("only a displayed example 🦀 </script>");\n',
  );
  const source = unequalPatch().replaceAll("\n", "\r\n");
  writeFileSync(join(root, "change.diff"), source);
  writeFileSync(
    join(root, "main.tsx"),
    `import { render } from 'solid-js/web';\nimport { CodeBlock } from ${JSON.stringify(join(ROOT, "src/kit/CodeBlock.tsx"))};\nimport code from './sample.ts?code';\nimport diff from './change.diff?diff';\nimport ${JSON.stringify(join(ROOT, "src/post/theme.css"))};\nimport ${JSON.stringify(join(ROOT, "src/post/post.css"))};\nrender(() => <main style="width:min(680px,calc(100% - 32px));margin:24px auto"><CodeBlock artifact={code}/><CodeBlock artifact={diff}/></main>, document.getElementById('root')!);`,
  );
  const modules: string[] = [];
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [
      codeBlocks(),
      solid(),
      {
        name: "record-browser-modules",
        generateBundle() {
          modules.push(...this.getModuleIds());
        },
      },
      viteSingleFile(),
    ],
    build: { target: "esnext", outDir: "dist", minify: true, modulePreload: false },
  });
  const html = readFileSync(join(root, "dist/index.html"), "utf8");
  expect(Buffer.byteLength(html)).toBeLessThan(5 * 1024 * 1024);
  expect(html).toContain("attachShadow");
  expect(html).toContain("data-diff-type");
  expect(html).toContain("data-unified");
  expect(html).toContain("splitPrerenderedHTML");
  expect(html).not.toContain('<script type="module" src=');
  expect(html).not.toContain('<link rel="stylesheet"');
  expect(html).not.toMatch(/\b(?:new Worker|fetch|WebAssembly)\(/);
  expect(modules.filter((id) => /node_modules\/(?:@pierre|shiki|@shikijs)/.test(id))).toEqual([]);
  expect(html).not.toContain(ROOT);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      return new URL(request.url).pathname === "/content"
        ? new Response(html, {
            headers: { "Content-Type": "text/html", "Content-Security-Policy": CONTENT_CSP },
          })
        : new Response(
            '<style>body{margin:0}iframe{display:block;border:0;width:100%;height:100vh}</style><iframe sandbox="allow-scripts" src="/content"></iframe>',
            { headers: { "Content-Type": "text/html" } },
          );
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(server.url.href);
      const frame = page.frames().find((frame) => frame.url().endsWith("/content"))!;
      expect(await frame.evaluate(() => self.origin)).toBe("null");
      const figure = frame.locator('[data-kind="diff"]');
      if (width === 1440) {
        await figure.evaluate((element) => {
          const root = element.querySelector(".nk-code-block-render")!.shadowRoot!;
          const pre = root.querySelector("pre")!,
            stage = root.querySelector<HTMLElement>(".morph-stage")!;
          const row = [...root.querySelectorAll<HTMLElement>(".morph-row")].find((row) =>
            row.textContent?.includes("const tail = 4;"),
          )!;
          const measure = () => ({
            y: row.getBoundingClientRect().top - pre.getBoundingClientRect().top,
            height: stage.getBoundingClientRect().height,
          });
          (window as any).codeMotionProbe = {
            measure,
            before: measure(),
            nodes: [...root.querySelectorAll("[data-morph-row], [data-morph-part]")],
          };
        });
        await figure
          .getByRole("button", { name: "Show the after version of the code", exact: true })
          .click();
        await page.waitForTimeout(100);
        const motion = await figure.evaluate(async (element) => {
          const root = element.querySelector(".nk-code-block-render")!.shadowRoot!;
          const { measure, before, nodes } = (window as any).codeMotionProbe;
          const middle = measure();
          await new Promise((resolve) => setTimeout(resolve, 450));
          return {
            before,
            middle,
            after: measure(),
            same: nodes.every(
              (node: Element, i: number) =>
                node === root.querySelectorAll("[data-morph-row], [data-morph-part]")[i],
            ),
            running: root.getAnimations().length,
          };
        });
        expect(motion.same).toBe(true);
        expect(motion.running).toBe(0);
        expect(motion.middle.y).toBeGreaterThan(motion.before.y + 0.2);
        expect(motion.middle.y).toBeLessThan(motion.after.y - 0.2);
        expect(motion.middle.height).toBeGreaterThan(motion.before.height + 0.2);
        expect(motion.middle.height).toBeLessThan(motion.after.height - 0.2);
      }
      const tools = figure.locator("..").locator(".nk-code-source-tools");
      await tools.locator("summary").click();
      const unified = tools.getByRole("button", { name: "Show unified diff", exact: true });
      const split = tools.getByRole("button", { name: "Show split diff", exact: true });
      expect(await unified.getAttribute("aria-pressed")).toBe("true");
      await split.focus();
      await page.keyboard.press("Enter");
      expect(await split.getAttribute("aria-pressed")).toBe("true");
      const listing = tools.locator("pre");
      expect(await listing.count()).toBe(1);
      const layout = await listing.evaluate((pre) => {
        const bounds = (element: Element) => {
          const r = element.getBoundingClientRect();
          return { y: r.y, height: r.height, width: r.width, right: r.right };
        };
        const contents = [...pre.querySelectorAll("[data-content]")];
        return {
          client: pre.clientWidth,
          scroll: pre.scrollWidth,
          right: pre.getBoundingClientRect().right,
          body: document.documentElement.scrollWidth,
          font: getComputedStyle(pre).fontSize,
          overflow: pre.getAttribute("data-overflow"),
          columns: contents.map(bounds),
          rows: contents.map((content) => [...content.children].map(bounds)),
        };
      });
      // The header is a <figcaption>; the global figcaption measure must not shorten its rule.
      for (const card of await frame.locator(".nk-code-block").all()) {
        const header = await card.evaluate((f) => ({
          header: f.querySelector(".nk-code-block-header")!.getBoundingClientRect().width,
          inner: f.clientWidth,
        }));
        expect(header.header).toBe(header.inner);
      }
      expect(layout.overflow).toBe("wrap");
      expect(layout.font).toBe("15px");
      expect(layout.body).toBe(width);
      expect(layout.columns).toHaveLength(2);
      expect(layout.columns[0].width).toBe(layout.columns[1].width);
      expect(layout.columns[0].width).toBeGreaterThanOrEqual(260);
      expect(layout.rows[0].map(({ y, height }) => ({ y, height }))).toEqual(
        layout.rows[1].map(({ y, height }) => ({ y, height })),
      );
      expect(layout.rows[0][1].height).toBeGreaterThan(100);
      if (width === 1440) {
        expect(layout.scroll).toBe(layout.client);
        expect(layout.columns[1].right).toBeLessThanOrEqual(layout.right);
        await page.setViewportSize({ width: 320, height: 1000 });
        expect(await split.getAttribute("aria-pressed")).toBe("true");
        await page.setViewportSize({ width, height: 1000 });
      } else {
        expect(layout.scroll).toBeGreaterThan(layout.client);
        await tools.locator(".nk-code-block-scroll-hint").waitFor({ state: "visible" });
        await tools.locator(".nk-code-inspector-render").focus();
        await page.keyboard.press("ArrowRight");
        expect(await listing.evaluate((pre) => pre.scrollLeft)).toBeGreaterThan(0);
        await listing.evaluate((pre) => {
          pre.scrollLeft = pre.scrollWidth;
        });
        const last = await listing.evaluate(
          (pre) =>
            pre.querySelector("[data-additions] [data-content]")!.getBoundingClientRect().right -
            pre.getBoundingClientRect().right,
        );
        expect(Math.abs(last)).toBeLessThan(1);
      }
      await frame.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw Error("opaque clipboard");
            },
          },
        });
        Object.defineProperty(document, "execCommand", {
          configurable: true,
          value: () => {
            const data = new DataTransfer();
            document.dispatchEvent(
              new ClipboardEvent("copy", { clipboardData: data, cancelable: true }),
            );
            (window as unknown as { copiedText: string }).copiedText = data.getData("text/plain");
            return true;
          },
        });
      });
      await tools.getByRole("button", { name: "Copy patch" }).click();
      expect(
        await frame.evaluate(() => (window as unknown as { copiedText: string }).copiedText),
      ).toBe(source);
      await unified.focus();
      await page.keyboard.press("Space");
      expect(await unified.getAttribute("aria-pressed")).toBe("true");
      expect(await listing.count()).toBe(1);
      expect(await tools.locator("[data-content]").count()).toBe(1);
      await tools.locator(".nk-code-block-scroll-hint").waitFor({ state: "detached" });
      expect(await tools.locator(".nk-code-block-scroll-hint").count()).toBe(0);
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
}, 30_000);

// These failures are part of the author API and checked by `bun run check`.
function _artifactTypes(
  code: typeof import("./fixture.ts?code").default,
  diff: typeof import("./fixture.diff?diff").default,
) {
  const codeProps: CodeBlockProps = { artifact: code };
  const diffProps: CodeBlockProps = { artifact: diff };
  // @ts-expect-error Raw strings are not compiled artifacts.
  const raw: CodeBlockProps = { artifact: "<pre>arbitrary HTML</pre>" };
  // @ts-expect-error The private unique-symbol brand cannot be authored structurally.
  const forged: CodeArtifact = {
    kind: "code",
    filename: "a.ts",
    language: "typescript",
    source: "",
    prerenderedHTML: "",
  };
  // @ts-expect-error Import queries carry their discriminant.
  const wrongKind: Extract<CodeArtifact, { kind: "code" }> = diff;
  // @ts-expect-error The diff branch must contain its second compiled view.
  const missingSplit: CodeArtifact = { ...diff, splitPrerenderedHTML: undefined };
  // @ts-expect-error Source artifacts expose no split listing.
  const splitCode = code.splitPrerenderedHTML;
  return { codeProps, diffProps, raw, forged, wrongKind, missingSplit, splitCode };
}
