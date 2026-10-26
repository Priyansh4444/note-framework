import type { Plugin } from "vite";

/** The review site has its own entry; portable notes keep their existing registry and app. */
export function frameworkPreviewEntry(): Plugin {
  return {
    name: "framework-preview-entry",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace('src="/src/index.tsx"', 'src="/src/framework-preview.tsx"')
          .replace(/<title>.*?<\/title>/, "<title>Note Framework — redesign preview</title>");
      },
    },
  };
}
