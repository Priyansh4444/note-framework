import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Every note is a folder in src/notes/ with a note.json. That file is the whole registration:
 * the app's routes and navigation, the published page's <title>, and the Cloudflare worker name
 * all come from it. Nothing else needs editing to add or publish a note.
 */
export interface NoteManifest {
  slug: string;
  title: string;
  description: string;
  /** Label in the local site's navigation. */
  nav: string;
  /** Cloudflare Workers name for `bun run note:publish <slug>`; becomes <worker>.<account>.workers.dev. */
  worker?: string;
  /** Serve this note at "/" on the local site. */
  home?: boolean;
  order?: number;
  /** Component file, relative to the folder. Default "index.tsx". */
  entry?: string;
  /** Named export of that file. Default "default". */
  export?: string;
}

export const ROOT = resolve(import.meta.dirname, "..");
export const NOTES_DIR = resolve(ROOT, "src/notes");

export function listNotes(): NoteManifest[] {
  return readdirSync(NOTES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(NOTES_DIR, d.name, "note.json")))
    .map((d) => ({
      slug: d.name,
      ...JSON.parse(readFileSync(resolve(NOTES_DIR, d.name, "note.json"), "utf8")),
    }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));
}

export function findNote(slug: string): NoteManifest {
  const note = listNotes().find((n) => n.slug === slug);
  if (!note) {
    const known = listNotes()
      .map((n) => n.slug)
      .join(", ");
    throw new Error(
      `No note "${slug}". Known notes: ${known}. A note is src/notes/<slug>/note.json.`,
    );
  }
  return note;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * `virtual:notes` lists the notes this build includes. With VITE_PUBLISH_NOTE=<slug> that is
 * one note, so no other note's code (and no navigation) reaches the published site.
 */
export function notesPlugin(only = process.env.VITE_PUBLISH_NOTE): Plugin {
  const ID = "virtual:notes";
  const notes = () => (only ? [findNote(only)] : listNotes());
  return {
    name: "note-registry",
    resolveId: (id) => ([ID, "virtual:single-note"].includes(id) ? `\0${id}` : undefined),
    load(id) {
      if (id === "\0virtual:single-note") {
        if (!only) throw new Error("A single-file export needs a selected note");
        const n = findNote(only);
        const file = JSON.stringify(resolve(NOTES_DIR, n.slug, n.entry ?? "index.tsx"));
        return `import * as page from ${file}; export default page[${JSON.stringify(n.export ?? "default")}];`;
      }
      if (id !== `\0${ID}`) return;
      const list = notes();
      // Watch the manifests so a new or edited note.json reloads the dev server's routes.
      for (const n of list) this.addWatchFile(resolve(NOTES_DIR, n.slug, "note.json"));
      const entries = list.map((n) => {
        const file = JSON.stringify(resolve(NOTES_DIR, n.slug, n.entry ?? "index.tsx"));
        const name = JSON.stringify(n.export ?? "default");
        const fields = { slug: n.slug, title: n.title, nav: n.nav, home: !!n.home || !!only };
        return `{ ...${JSON.stringify(fields)}, component: lazy(() => import(${file}).then((m) => ({ default: m[${name}] }))) }`;
      });
      return `import { lazy } from "solid-js";\nexport const only = ${JSON.stringify(only ?? null)};\nexport const notes = [\n  ${entries.join(",\n  ")}\n];\n`;
    },
    transformIndexHtml(html) {
      if (!only) return html;
      const n = findNote(only);
      if (process.env.VITE_SINGLE_FILE)
        html = html.replace('src="/src/index.tsx"', 'src="/src/single.tsx"');
      const icon = resolve(ROOT, "public/favicon.svg");
      if (process.env.VITE_SINGLE_FILE && existsSync(icon)) {
        html = html.replace(
          /href="(?:\/|\.\/)?favicon\.svg"/,
          `href="data:image/svg+xml,${encodeURIComponent(readFileSync(icon, "utf8"))}"`,
        );
      }
      return html
        .replace(/<title>.*<\/title>/, `<title>${escape(n.title)}</title>`)
        .replace(
          "</title>",
          `</title>\n    <meta name="description" content="${escape(n.description)}" />`,
        );
    },
  };
}
