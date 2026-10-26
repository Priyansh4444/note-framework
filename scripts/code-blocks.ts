import { compileDiffMorph } from "./diff-morph";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, sep } from "node:path";
import { getFiletypeFromFileName, parsePatchFiles, resolveLanguage } from "@pierre/diffs";
import { preloadFile, preloadFileDiff } from "@pierre/diffs/ssr";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { Plugin } from "vite";
import type { CodeArtifact } from "../src/kit/CodeBlock.tsx";

type BlockKind = CodeArtifact["kind"];
// Built-in Vesper, derived from https://github.com/raunofreiberg/vesper.
const theme = "vesper";

// This fixed stylesheet is build-owned, never supplied by an author import.
const shadowCSS = `
:host {
  display:block; min-width:0; max-width:100%; box-sizing:border-box;
  padding-block:8px; border-radius:0 0 5px 5px;
  font:inherit; color:#ffffff; background:#101010;
  --diffs-font-family:inherit; --diffs-font-size:15px;
  --diffs-line-height:1.65; --diffs-tab-size:2;
}
pre { font-family:inherit; font-size:15px; line-height:1.65; }
[data-code] { overflow-wrap:anywhere; }
[data-gutter] { user-select:none; }
/* Keep the number, classic diff sign and source in separate padded tracks.
   The sign is Pierre's absolute ::before; spacing must live in this shadow root. */
[data-column-number] { padding-inline-end:12px; }
[data-line], [data-no-newline] { padding-inline:16px; }
[data-indicators="classic"] [data-line],
[data-indicators="classic"] [data-no-newline] { padding-inline-start:calc(1ch + 16px); }
/* Pierre's wrap grid shares rows across both sides. Bound the equal content
   tracks, retaining readable panes and local comparison scrolling on phones. */
pre[data-diff-type="split"] {
  overflow-x:auto;
  grid-template-columns:repeat(2,var(--diffs-grid-number-column-width) minmax(260px,1fr));
}
::selection { color:#101010; background:#ffffff; }
`;

const options = {
  theme,
  themeType: "dark",
  preferredHighlighter: "shiki-js",
  disableFileHeader: true,
  overflow: "wrap",
  unsafeCSS: shadowCSS,
} as const;

function diagnostic(filename: string, message: string): never {
  throw new Error(`[code-blocks] ${filename}: ${message}`);
}

async function languageFor(filename: string) {
  if (extname(filename).toLowerCase() === ".txt") return "text";
  const language = getFiletypeFromFileName(filename);
  if (language === "text")
    diagnostic(filename, "unsupported language; use an explicit .txt?code file for plain text.");
  try {
    await resolveLanguage(language);
  } catch {
    diagnostic(
      filename,
      `unsupported language ${JSON.stringify(language)}; use an explicit .txt file for plain text.`,
    );
  }
  return language;
}

/** Reject text the upstream parser would otherwise recover or silently ignore. */
function validatePatch(source: string, filename: string): FileDiffMetadata {
  if (!source.trim())
    diagnostic(filename, "empty patch; provide a unified patch for exactly one file.");
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  let i = 0;
  if (lines[i]?.startsWith("diff --git ")) {
    i++;
    while (
      /^(?:index |(?:new|deleted) file mode |(?:old|new) mode |similarity index |(?:rename|copy) (?:from|to) )/.test(
        lines[i] ?? "",
      )
    )
      i++;
  }
  const fail = (message: string): never =>
    diagnostic(filename, `malformed patch at line ${i + 1}: ${message}`);
  if (!/^--- .+/.test(lines[i] ?? "") || !/^\+\+\+ .+/.test(lines[i + 1] ?? "")) {
    fail("expected --- / +++ file headers and unified hunks for exactly one file.");
  }
  i += 2;
  let hunks = 0;
  let changed = false;
  let oldEnd = 0;
  let newEnd = 0;
  while (i < lines.length) {
    if (/^(?:diff --git |--- )/.test(lines[i]))
      diagnostic(
        filename,
        "multi-file patch; split it into imports containing exactly one file each.",
      );
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[i]);
    if (!header) fail("expected a unified @@ hunk header.");
    const [oldStart, oldCount, newStart, newCount] = [
      Number(header![1]),
      Number(header![2] ?? 1),
      Number(header![3]),
      Number(header![4] ?? 1),
    ];
    if (
      ![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger) ||
      (oldCount === 0 && newCount === 0) ||
      (oldCount > 0 && oldStart === 0) ||
      (newCount > 0 && newStart === 0)
    )
      fail("invalid hunk range.");
    const oldBoundary = oldCount === 0 ? oldStart : oldStart - 1;
    const newBoundary = newCount === 0 ? newStart : newStart - 1;
    if (oldBoundary < oldEnd || newBoundary < newEnd) fail("overlapping or out-of-order hunks.");
    oldEnd = oldBoundary + oldCount;
    newEnd = newBoundary + newCount;
    let oldRemaining = oldCount;
    let newRemaining = newCount;
    let previousWasContent = false;
    i++;
    while (oldRemaining > 0 || newRemaining > 0 || lines[i] === "\\ No newline at end of file") {
      const line = lines[i];
      if (line === "\\ No newline at end of file" && previousWasContent) {
        previousWasContent = false;
        i++;
        continue;
      }
      const marker = line?.[0];
      if (marker !== " " && marker !== "+" && marker !== "-")
        fail("hunk line count mismatch or invalid line prefix.");
      if (marker !== "+") oldRemaining--;
      if (marker !== "-") newRemaining--;
      if (oldRemaining < 0 || newRemaining < 0) fail("hunk has more lines than declared.");
      if (marker === "+" || marker === "-") changed = true;
      previousWasContent = true;
      i++;
    }
    hunks++;
  }
  if (hunks === 0 || !changed)
    diagnostic(
      filename,
      "empty patch; at least one unified hunk with additions or deletions is required.",
    );
  let patches;
  try {
    patches = parsePatchFiles(source, undefined, true);
  } catch (error) {
    diagnostic(
      filename,
      `malformed patch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (patches.length !== 1 || patches[0].files.length !== 1)
    diagnostic(filename, "patch must contain exactly one file and one patch.");
  const file = patches[0].files[0];
  if (!file.name || file.hunks.length !== hunks)
    diagnostic(filename, "malformed patch: file name or hunks could not be parsed exactly.");
  return file;
}

/** Build-only boundary. The component accepts branded imports, never HTML props. */
export async function compileCodeArtifact(
  kind: BlockKind,
  filename: string,
  source: string,
): Promise<CodeArtifact> {
  if (kind === "code") {
    const language = await languageFor(filename);
    const result = await preloadFile({
      file: { name: filename, contents: source, lang: language },
      options: {
        ...options,
        theme: "github-dark",
        overflow: "scroll",
        unsafeCSS: `${shadowCSS}
:host { padding:0; border-radius:0; background:transparent; color:#e1e4e8; --diffs-font-size:inherit; --diffs-line-height:1.7; }
pre { display:block; margin:0; padding:20px 22px 24px; font:inherit; line-height:1.7; overflow-x:auto; white-space:pre; }
[data-code] { display:block; width:max-content; min-width:100%; overflow-wrap:normal; }
[data-gutter] { display:none; }
[data-line], [data-no-newline] { padding:0; white-space:pre; }
`,
      },
    });
    return {
      kind,
      filename,
      language,
      source,
      prerenderedHTML: result.prerenderedHTML,
    } as CodeArtifact;
  }
  const fileDiff = validatePatch(source, filename);
  // Patch paths are display metadata only. Never resolve or read them.
  const language = await languageFor(fileDiff.name);
  const render = (diffStyle: "unified" | "split") =>
    preloadFileDiff({
      fileDiff: { ...fileDiff, lang: language },
      options: { ...options, diffStyle, diffIndicators: "classic", hunkSeparators: "metadata" },
    });
  const [unified, split, morph] = await Promise.all([
    render("unified"),
    render("split"),
    compileDiffMorph(source, fileDiff.name, language),
  ]);
  return {
    kind,
    filename: fileDiff.name,
    language,
    source,
    morph,
    prerenderedHTML: unified.prerenderedHTML,
    splitPrerenderedHTML: split.prerenderedHTML,
  } as CodeArtifact;
}

function within(root: string, path: string) {
  const local = relative(root, path);
  return local !== "" && !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`);
}

async function localFile(root: string, path: string) {
  const canonical = await realpath(path);
  if (!within(root, canonical))
    diagnostic(path, "imports must resolve to local regular files inside the project root.");
  return canonical;
}

function serialize(artifact: CodeArtifact) {
  // Safe even when a single-file exporter places this module in an HTML script.
  return JSON.stringify(artifact)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Install in either Vite config; project bounds come from configResolved.root. */
export function codeBlocks(): Plugin {
  let root: string;
  const imports = new Map<string, { kind: BlockKind; path: string }>();
  return {
    name: "note-code-blocks",
    enforce: "pre",
    async configResolved(config) {
      root = await realpath(config.root);
    },
    async resolveId(source, importer) {
      const queryIndex = source.indexOf("?");
      if (queryIndex < 0) return;
      const query = source.slice(queryIndex + 1);
      if (!/(?:^|&)(?:code|diff)(?:[^\w-]|$)/.test(query)) return;
      if (query !== "code" && query !== "diff")
        diagnostic(source, "use exactly ?code or ?diff, without other queries or fragments.");
      const request = source.slice(0, queryIndex);
      if (!request.startsWith(".") && !request.startsWith("/"))
        diagnostic(source, "only local file imports are supported.");
      const resolved = await this.resolve(request, importer, { skipSelf: true });
      if (!resolved || resolved.external || !isAbsolute(resolved.id) || /[?\0]/.test(resolved.id))
        diagnostic(source, "could not resolve a local source file.");
      const path = await localFile(root, resolved.id);
      const id = `\0note-code-block:${query}:${path}`;
      imports.set(id, { kind: query, path });
      return id;
    },
    async load(id) {
      const input = imports.get(id);
      if (!input) return;
      const path = await localFile(root, input.path);
      // NONBLOCK prevents a FIFO/device from hanging before the regular-file check.
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let source: string;
      try {
        if (!(await handle.stat()).isFile()) diagnostic(path, "imports must be regular files.");
        const bytes = await handle.readFile();
        try {
          source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch {
          diagnostic(path, "source must be valid UTF-8 text.");
        }
      } finally {
        await handle.close();
      }
      this.addWatchFile(path);
      const filename = relative(root, path).split(sep).join("/");
      const artifact = await compileCodeArtifact(input.kind, filename || basename(path), source);
      return { code: `export default ${serialize(artifact)};`, map: null };
    },
  };
}
