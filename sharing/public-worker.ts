import legacy from "./worker";
import { canonicalOrigin, HttpError, unavailable, type Env } from "./protocol";
import { authJson, cleanupPublic, publicAuth, publisherRequest } from "./public-auth";

const APP_PATHS = new Set([
  "/",
  "/docs",
  "/studies",
  "/components",
  "/account",
  "/agent/approve",
  "/notes/framework-demo",
  "/notes/shared-service",
  "/notes/inside-svg",
  "/notes/spring-workshop",
]);
const RELEASE_PATHS = new Set([
  "/favicon.svg",
  "/llms.txt",
  "/starter.zip",
  "/starter.sha256",
  "/cli.ts",
  "/skill.md",
]);
const TRUSTED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

async function studyPolicy(html: string): Promise<string> {
  const hashes = await Promise.all(
    [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter((match) => !/\bsrc\s*=/i.test(match[1]!))
      .map(async (match) => {
        const script = match[2]!.replace(/\r\n?/g, "\n");
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script)),
        );
        return `'sha256-${btoa(String.fromCharCode(...digest))}'`;
      }),
  );
  return TRUSTED_CSP.replace("script-src 'self'", `script-src 'self' ${hashes.join(" ")}`);
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    origin = canonicalOrigin(env.PUBLIC_ORIGIN),
    path = url.pathname;
  if (url.origin !== origin)
    throw new HttpError(400, "invalid_origin", "Use the canonical public origin.");
  const authentication = await publicAuth(request, env, origin);
  if (authentication) return authentication;
  if (path === "/api/me" || path === "/api/drafts" || /^\/api\/drafts\/[^/]+$/.test(path))
    return legacy.fetch(await publisherRequest(request, env, origin), env);
  if (/^\/(?:d|content|raw)\//.test(path) || path === "/healthz" || path.startsWith("/api/admin/"))
    return legacy.fetch(request, env);
  if (request.method !== "GET" && request.method !== "HEAD")
    throw new HttpError(405, "method_not_allowed", "This method is not supported.");
  const withoutSlash = path.replace(/\/+$/, "") || "/";
  const studyAlias = /^\/studies\/(hairline|morph|ink|mechanical-arm)$/.exec(withoutSlash);
  if ((path !== withoutSlash && APP_PATHS.has(withoutSlash)) || studyAlias) {
    const location = studyAlias ? `${withoutSlash}/index.html` : withoutSlash;
    return new Response(null, {
      status: 308,
      headers: { Location: location + url.search, "Cache-Control": "no-store" },
    });
  }
  const asset =
    APP_PATHS.has(path) ||
    RELEASE_PATHS.has(path) ||
    /^\/assets\/[A-Za-z0-9_.-]+$/.test(path) ||
    /^\/downloads\/(?:starter-[a-f0-9]{12}\.zip|cli-[a-f0-9]{12}\.ts)$/.test(path) ||
    /^\/studies\/(?:hairline|morph|layers|ink|mechanical-arm|anatomy)\/[A-Za-z0-9_./-]+$/.test(
      path,
    ) ||
    /^\/studies\/previews\/[a-z-]+\.(?:webp|png|svg)$/.test(path);
  if (!asset) throw new HttpError(404, "not_found", "Not found.");
  if (APP_PATHS.has(path)) {
    url.pathname = "/index.html";
    url.search = "";
  }
  const studyDocument = /^\/studies\/(?:hairline|morph|ink|mechanical-arm)\/index\.html$/.test(
    path,
  );
  const assetRequest = new Request(url, request);
  const response = await env.ASSETS.fetch(
    studyDocument && request.method === "HEAD"
      ? new Request(assetRequest, { method: "GET" })
      : assetRequest,
  );
  const headers = new Headers(response.headers);
  if (
    /^\/(?:llms\.txt|starter\.sha256|skill\.md|cli\.ts|downloads\/cli-[a-f0-9]{12}\.ts)$/.test(path)
  )
    headers.set("Content-Type", "text/plain; charset=utf-8");
  const html = studyDocument && response.ok ? await response.text() : null;
  if (html !== null) {
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
  }
  headers.set("Content-Security-Policy", html !== null ? await studyPolicy(html) : TRUSTED_CSP);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.delete("Set-Cookie");
  return new Response(request.method === "HEAD" ? null : (html ?? response.body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      const safe = error instanceof HttpError ? error : unavailable();
      return authJson({ error: { code: safe.code, message: safe.message } }, safe.status);
    }
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await cleanupPublic(env.DB);
  },
};
