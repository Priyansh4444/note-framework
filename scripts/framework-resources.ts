import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** The service's reviewed public release files, never the surrounding workspace. */
export function frameworkResources(): Plugin {
  const root = resolve(import.meta.dirname, "..", "releases");
  const names = () =>
    existsSync(root)
      ? readdirSync(root).filter(
          (name) =>
            ["starter.zip", "starter.sha256", "cli.ts", "llms.txt", "skill.md"].includes(name) ||
            /^(?:starter-[a-f0-9]{12}\.zip|cli-[a-f0-9]{12}\.ts)$/.test(name),
        )
      : [];
  return {
    name: "framework-public-release",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        const name = path.startsWith("/downloads/") ? path.slice(11) : path.slice(1);
        if (
          !names().includes(name) ||
          (path.startsWith("/downloads/") && !/^(?:starter-|cli-)/.test(name))
        )
          return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          return res.end();
        }
        res.setHeader(
          "Content-Type",
          name.endsWith(".zip") ? "application/zip" : "text/plain; charset=utf-8",
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.end(req.method === "HEAD" ? undefined : readFileSync(resolve(root, name)));
      });
    },
    generateBundle() {
      if (!names().includes("starter.zip") || !names().includes("llms.txt")) {
        throw new Error(
          "Build the public starter and CLI with bun run framework:release before publishing the service.",
        );
      }
      for (const name of names())
        this.emitFile({
          type: "asset",
          fileName: /^(?:starter-|cli-)/.test(name) ? `downloads/${name}` : name,
          source: readFileSync(resolve(root, name)),
        });
    },
  };
}
