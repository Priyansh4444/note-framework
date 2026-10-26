import { frameworkPreviewEntry } from "./scripts/framework-preview.ts";
import { codeBlocks } from "./scripts/code-blocks.ts";
import { frameworkResources } from "./scripts/framework-resources.ts";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "path";
import { notesPlugin } from "./scripts/notes.ts";

/** `VITE_PUBLISH_NOTE=<slug>` builds one note on its own (see scripts/notes.ts and `bun run note:publish`). */
const single = process.env.VITE_PUBLISH_NOTE;
const frameworkPreview = !single || process.env.VITE_FRAMEWORK_PREVIEW === "1";

export default defineConfig({
  define: {
    "import.meta.env.VITE_FRAMEWORK_PREVIEW": JSON.stringify(frameworkPreview ? "1" : "0"),
  },
  plugins: [
    codeBlocks(),
    solid(),
    frameworkPreview ? frameworkPreviewEntry() : notesPlugin(single),
    ...(process.env.VITE_SINGLE_FILE ? [viteSingleFile()] : []),
    ...(!single || single === "framework" ? [frameworkResources()] : []),
  ],
  resolve: {
    alias: {
      "~": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
  optimizeDeps: frameworkPreview ? { entries: ["src/framework-preview.tsx"] } : undefined,
  server: {
    port: 3000,
  },
});
