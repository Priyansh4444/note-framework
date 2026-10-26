import { codeBlocks } from "./scripts/code-blocks.ts";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath } from "node:url";
import { notesPlugin } from "./scripts/notes.ts";

export default defineConfig({
  plugins: [
    codeBlocks(),
    solid(),
    notesPlugin(process.env.VITE_PUBLISH_NOTE),
    ...(process.env.VITE_SINGLE_FILE ? [viteSingleFile()] : []),
  ],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { target: "esnext", outDir: "dist" },
  server: { port: 3000 },
});
