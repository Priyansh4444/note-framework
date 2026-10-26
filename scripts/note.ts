#!/usr/bin/env bun
/**
 * bun run note:new <slug> "Title"   scaffold src/notes/<slug>/ from templates/note
 * bun run note:list                 every note, its route, and where it publishes
 * bun run note:build <slug>         build that note alone into dist-<slug>
 * bun run note:publish <slug>       build, check, deploy to Cloudflare, and wait until it is live
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { NOTES_DIR, ROOT, findNote, listNotes } from "./notes";

const [command, slug, ...rest] = process.argv.slice(2);
const fail = (message: string): never => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

async function run(cmd: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "inherit",
  });
  let out = "";
  const decoder = new TextDecoder();
  for await (const chunk of proc.stdout) {
    const text = decoder.decode(chunk);
    out += text;
    process.stdout.write(text);
  }
  if ((await proc.exited) !== 0) fail(`${cmd.join(" ")} failed.`);
  return out;
}

function scaffold(name: string, title: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    fail(`Slug "${name}" must be lowercase letters, digits and dashes.`);
  const target = resolve(NOTES_DIR, name);
  if (existsSync(target)) fail(`src/notes/${name} already exists.`);
  const template = resolve(ROOT, "templates/note");
  const today = new Date().toISOString().slice(0, 10);
  for (const file of walk(template)) {
    const out = resolve(target, relative(template, file));
    mkdirSync(dirname(out), { recursive: true });
    const replace = (value: string) =>
      value
        .replaceAll("__SLUG__", () => name)
        .replaceAll("__TITLE__", () => title)
        .replaceAll("__DATE__", () => today);
    const substitute = (value: unknown): unknown =>
      typeof value === "string"
        ? replace(value)
        : Array.isArray(value)
          ? value.map(substitute)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.entries(value).map(([key, child]) => [key, substitute(child)]),
              )
            : value;
    const text = readFileSync(file, "utf8");
    writeFileSync(
      out,
      file.endsWith(".json")
        ? JSON.stringify(substitute(JSON.parse(text)), null, 2) + "\n"
        : replace(text),
    );
  }
  console.log(`
  Created src/notes/${name}/ (route /notes/${name}).

  Next:
    1. Read .agents/skills/note-explainers/SKILL.md, then list the skills you have and pick the apt ones.
    2. Write chapters.ts first: each chapter is a question and the takeaway that answers it.
    3. Fill glossary.tsx and the sources, then the prose and figures in index.tsx.
    4. bun run dev  →  http://localhost:3000/notes/${name}
    5. bun run note:publish ${name}  when it is verified.
`);
}

async function build(name: string, singleFile = false) {
  findNote(name);
  const out = `dist-${name}${singleFile ? "-single" : ""}`;
  await run(["bunx", "vite", "build", "--outDir", out, "--emptyOutDir"], {
    VITE_PUBLISH_NOTE: name,
    VITE_SINGLE_FILE: singleFile ? "1" : "",
  });
  // Course material that must never be published: homework, solutions, and any PDF a note did not opt into.
  const allowPdf = (findNote(name) as { allowPdf?: boolean }).allowPdf;
  const files = walk(resolve(ROOT, out)).map((f) => relative(resolve(ROOT, out), f));
  const bad = files.filter(
    (f) => /homework|solution|\bhw\d/i.test(f) || (!allowPdf && f.endsWith(".pdf")),
  );
  if (bad.length) fail(`Refusing to publish ${out}: it contains\n    ${bad.join("\n    ")}`);
  console.log(`\n  ${out}: ${files.length} files, no course material.`);
  return out;
}

async function publish(name: string) {
  if (name === "framework" && existsSync(resolve(ROOT, "wrangler.sharing.jsonc")))
    fail("The hosted service includes an API. Use bun run share:deploy to preserve it.");
  const note = findNote(name);
  const worker = note.worker ?? `${name}-note`;
  const out = await build(name);
  const config = `wrangler.${name}.jsonc`;
  if (!existsSync(resolve(ROOT, config))) {
    writeFileSync(
      resolve(ROOT, config),
      `// Deploys only the ${name} note (built by \`bun run note:build ${name}\`) as static assets.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${worker}",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./${out}",
    "not_found_handling": "single-page-application"
  }
}
`,
    );
    console.log(`  Wrote ${config} (worker "${worker}").`);
  }
  const log = await run(["bunx", "wrangler", "deploy", "--config", config]);
  const url = log.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
  if (!url)
    return console.log("\n  Deployed. Wrangler printed no workers.dev URL; check the dashboard.");
  // A fresh workers.dev name can 404 for a minute while it propagates.
  for (let i = 0; i < 24; i++) {
    const res = await fetch(url).catch(() => undefined);
    if (res?.ok && (await res.text()).includes('id="app"'))
      return console.log(`\n  Live: ${url}\n`);
    await Bun.sleep(5000);
  }
  console.log(
    `\n  Deployed to ${url}, but it was not serving the page after two minutes. Check again shortly.`,
  );
}

switch (command) {
  case "new":
    if (!slug) fail('Usage: bun run note:new <slug> "Title"');
    scaffold(slug, rest.join(" ") || slug);
    break;
  case "list":
    for (const n of listNotes())
      console.log(
        `  ${n.slug.padEnd(16)} ${(n.home ? "/" : `/notes/${n.slug}`).padEnd(22)} ${n.worker ?? "(not published yet)"}  ${n.title}`,
      );
    break;
  case "build":
    if (!slug) fail("Usage: bun run note:build <slug>");
    await build(slug);
    break;
  case "html":
    if (!slug) fail("Usage: bun run note:html <slug>");
    console.log(`\n  HTML: ${await build(slug, true)}/index.html\n`);
    break;
  case "audit":
    if (!slug) fail("Usage: bun run note:audit <slug>");
    await run([
      "bun",
      "scripts/audit.ts",
      "--html",
      resolve(ROOT, await build(slug, true), "index.html"),
      ...rest,
    ]);
    break;
  case "publish":
    if (!slug) fail("Usage: bun run note:publish <slug>");
    await publish(slug);
    break;
  default:
    fail("Commands: new, list, build, html, audit, publish. See scripts/note.ts.");
}
