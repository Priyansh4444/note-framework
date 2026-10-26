import { expect, test } from "bun:test";
import { notesPlugin } from "./notes";

test("single-file favicon is inline after Vite rewrites public asset paths", () => {
  const previous = process.env.VITE_SINGLE_FILE;
  process.env.VITE_SINGLE_FILE = "1";
  try {
    const transform = notesPlugin("framework-demo").transformIndexHtml as (html: string) => string;
    for (const path of ["/favicon.svg", "./favicon.svg"]) {
      const html = transform(`<title>Old</title><link rel="icon" href="${path}">`);
      expect(html).toContain('href="data:image/svg+xml,');
      expect(html).not.toContain('href="' + path + '"');
    }
  } finally {
    if (previous === undefined) delete process.env.VITE_SINGLE_FILE;
    else process.env.VITE_SINGLE_FILE = previous;
  }
});
