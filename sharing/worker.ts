import {
  HASH_PATTERN,
  ID_PATTERN,
  MAX_HTML_BYTES,
  OWNER_HASH_DOMAIN,
  HttpError,
  canonicalOrigin,
  decodeBase64url,
  decodeUtf8,
  equalHash,
  sha256,
  splitChunks,
  unauthorized,
  notFound,
  unavailable,
  utf8,
  validSecret,
  type Env,
  type Upload,
} from "./protocol";
import {
  authenticatePublisher,
  getOwnDraft,
  getPublicVersion,
  listDrafts,
  publish,
  readOriginal,
  registerKey,
  revokeKey,
  type Registration,
  type VersionRow,
} from "./store";

export type { Env, Receipt } from "./protocol";

const PERMISSIONS = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";
const TRUSTED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const VIEWER_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CONTENT_CSP =
  "default-src 'none'; sandbox allow-scripts; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const RAW_CSP =
  "default-src 'none'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function headers(csp = TRUSTED_CSP): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": PERMISSIONS,
  });
}
function json(value: unknown, status = 200, etag?: string): Response {
  const h = headers();
  h.set("Content-Type", "application/json; charset=utf-8");
  if (etag) h.set("ETag", etag);
  return new Response(JSON.stringify(value), { status, headers: h });
}
function methodNotAllowed(): never {
  throw new HttpError(405, "method_not_allowed", "This method is not supported.");
}
function requireId(id: string): string {
  if (!ID_PATTERN.test(id))
    throw new HttpError(400, "invalid_id", "An ID must be 32 lowercase hexadecimal characters.");
  return id;
}
function parseVersion(value: string): number {
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw notFound();
  return Number(value);
}
function singleLine(value: string): boolean {
  return !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

async function boundedBody(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) throw new HttpError(400, "empty_body", "A nonempty request body is required.");
  const reader = request.body.getReader();
  let buffer = new Uint8Array(Math.min(maximum, 65_536));
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const nextSize = size + value.byteLength;
      if (nextSize > maximum) {
        await reader.cancel().catch(() => {});
        throw new HttpError(413, "body_too_large", "The request exceeds the byte limit.");
      }
      if (nextSize > buffer.length) {
        const expanded = new Uint8Array(Math.max(nextSize, Math.min(maximum, buffer.length * 2)));
        expanded.set(buffer);
        buffer = expanded;
      }
      // One bounded buffer avoids per-chunk overhead for many tiny chunks, and
      // copies immediately because a stream can reuse its backing buffer.
      buffer.set(value, size);
      size = nextSize;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_body", "The request body could not be read.");
  } finally {
    reader.releaseLock();
  }
  if (size === 0) throw new HttpError(400, "empty_body", "A nonempty request body is required.");
  return size === buffer.length ? buffer : buffer.slice(0, size);
}
function requireIdentity(request: Request): void {
  const encoding = request.headers.get("Content-Encoding");
  if (encoding !== null && encoding.trim().toLowerCase() !== "identity")
    throw new HttpError(
      415,
      "unsupported_encoding",
      "Only identity request encoding is supported.",
    );
}
async function parseUpload(request: Request, id: string): Promise<Upload> {
  requireIdentity(request);
  if (
    !/^text\/html\s*;\s*charset\s*=\s*(?:utf-8|"utf-8")\s*$/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  ) {
    throw new HttpError(415, "unsupported_media_type", "Use text/html; charset=utf-8.");
  }
  const operationKey = request.headers.get("Idempotency-Key") ?? "";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationKey))
    throw new HttpError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must contain 16–128 URL-safe characters.",
    );
  const match = request.headers.get("If-Match");
  let expected: number | null = null;
  if (match !== null) {
    if (!/^"(?:0|[1-9][0-9]*)"$/.test(match))
      throw new HttpError(
        400,
        "invalid_precondition",
        "If-Match must be one quoted version number.",
      );
    expected = Number(match.slice(1, -1));
    if (!Number.isSafeInteger(expected) || expected >= Number.MAX_SAFE_INTEGER)
      throw new HttpError(
        400,
        "invalid_precondition",
        "The version number is outside the supported range.",
      );
  }
  let title = "Untitled note";
  const encodedTitle = request.headers.get("X-Note-Title");
  if (encodedTitle !== null) {
    try {
      if (encodedTitle.length > 342) throw new Error();
      const bytes = decodeBase64url(encodedTitle);
      if (bytes.length > 256) throw new Error();
      title = decodeUtf8(bytes);
      if (!singleLine(title)) throw new Error();
    } catch {
      throw new HttpError(
        400,
        "invalid_title",
        "X-Note-Title must be canonical base64url UTF-8, at most 256 bytes and one line.",
      );
    }
  }
  const bytes = await boundedBody(request, MAX_HTML_BYTES);
  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch {
    throw new HttpError(422, "invalid_utf8", "The HTML body must be valid UTF-8.");
  }
  return {
    id,
    operationKey,
    expected,
    title,
    bytes: bytes.length,
    sha256: await sha256(bytes),
    chunks: splitChunks(text),
  };
}

async function authenticateOwner(request: Request, env: Env): Promise<void> {
  const match = /^Bearer (nf_owner_([A-Za-z0-9_-]{43}))$/.exec(
    request.headers.get("Authorization") ?? "",
  );
  if (!match || !validSecret(match[2]!)) throw unauthorized();
  const hash = await sha256(OWNER_HASH_DOMAIN + match[1]!);
  if (!equalHash(hash, env.OWNER_TOKEN_SHA256)) throw unauthorized();
}
async function parseRegistration(request: Request): Promise<Registration> {
  requireIdentity(request);
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")
  )
    throw new HttpError(415, "unsupported_media_type", "Use application/json.");
  try {
    const object: unknown = JSON.parse(decodeUtf8(await boundedBody(request, 4096)));
    if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error();
    const value = object as Record<string, unknown>;
    if (Object.keys(value).some((key) => !["label", "tokenHash", "quotaBytes"].includes(key)))
      throw new Error();
    if (
      typeof value.label !== "string" ||
      !singleLine(value.label) ||
      utf8(value.label).length < 1 ||
      utf8(value.label).length > 256
    )
      throw new Error();
    if (typeof value.tokenHash !== "string" || !HASH_PATTERN.test(value.tokenHash))
      throw new Error();
    if (
      value.quotaBytes !== undefined &&
      (typeof value.quotaBytes !== "number" ||
        !Number.isSafeInteger(value.quotaBytes) ||
        value.quotaBytes < 0)
    )
      throw new Error();
    return {
      label: value.label,
      tokenHash: value.tokenHash,
      ...(value.quotaBytes === undefined ? {} : { quotaBytes: value.quotaBytes as number }),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "invalid_registration",
      "Provide a single-line label, SHA-256 tokenHash, and optional nonnegative integer quotaBytes.",
    );
  }
}

async function api(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const admin = /^\/api\/admin\/publishers\/([^/]+)\/keys\/([^/]+)$/.exec(path);
  if (admin) {
    await authenticateOwner(request, env);
    const publisherId = requireId(admin[1]!);
    const keyId = requireId(admin[2]!);
    if (request.method === "PUT")
      return json(await registerKey(env.DB, publisherId, keyId, await parseRegistration(request)));
    if (request.method === "DELETE") {
      await revokeKey(env.DB, publisherId, keyId);
      return new Response(null, { status: 204, headers: headers() });
    }
    return methodNotAllowed();
  }
  if (path.startsWith("/api/admin")) throw notFound();
  if (path !== "/api/me" && path !== "/api/drafts" && !/^\/api\/drafts\/[^/]+$/.test(path))
    throw notFound();
  const principal = await authenticatePublisher(env.DB, request.headers.get("Authorization"));
  if (path === "/api/me") {
    if (request.method !== "GET") return methodNotAllowed();
    const { publisherId, keyId, label, quotaBytes, usedBytes } = principal;
    return json({ publisherId, keyId, label, maxBytes: MAX_HTML_BYTES, quotaBytes, usedBytes });
  }
  const origin = canonicalOrigin(env.PUBLIC_ORIGIN);
  if (path === "/api/drafts") {
    if (request.method !== "GET") return methodNotAllowed();
    const limitText = url.searchParams.get("limit") ?? "50";
    if (!/^[1-9][0-9]{0,2}$/.test(limitText) || Number(limitText) > 100)
      throw new HttpError(400, "invalid_limit", "The listing limit must be between 1 and 100.");
    return json(
      await listDrafts(
        env.DB,
        principal.publisherId,
        url.searchParams.get("cursor"),
        Number(limitText),
        origin,
      ),
    );
  }
  const id = requireId(path.slice("/api/drafts/".length));
  if (request.method === "GET") {
    const detail = await getOwnDraft(env.DB, principal.publisherId, id);
    return json(detail, 200, detail.etag);
  }
  if (request.method !== "PUT") return methodNotAllowed();
  const { receipt, replayed } = await publish(
    env.DB,
    principal,
    await parseUpload(request, id),
    origin,
  );
  return json(receipt, replayed ? 200 : 201, receipt.etag);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}
function viewer(version: VersionRow): Response {
  const { id, version: number, headVersion } = version;
  const pinned = `/d/${id}/v/${number}`;
  const title = escapeHtml(version.title);
  const navigation =
    `<a href="/d/${id}">Current</a><a href="${pinned}" aria-current="page">Pinned v${number}</a>` +
    (number > 1 ? `<a href="/d/${id}/v/${number - 1}">Previous</a>` : "") +
    (number < headVersion ? `<a href="/d/${id}/v/${number + 1}">Next</a>` : "") +
    `<a href="/raw/${id}/v/${number}" download>Download HTML</a>`;
  // The inner lane matches a kit note's 680px measure (24px gutters) and its 20px phone gutters.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — shared note</title><style>
    *{box-sizing:border-box}html,body{margin:0;background:#050505;color:#e0e0e0}body{position:fixed;inset:0;display:grid;grid-template-rows:auto minmax(0,1fr);font-family:ui-serif,Georgia,serif}
    header{border-bottom:1px solid #303036}.viewer-inner{width:100%;max-width:728px;margin-inline:auto;padding:12px 24px;display:grid;grid-template-columns:minmax(0,1fr) fit-content(50%);align-items:center;gap:4px 32px}h1{grid-column:1;grid-row:2;font-size:17px;line-height:1.35;font-weight:400;margin:0;overflow-wrap:anywhere;min-width:0}
    small{grid-column:1/-1;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#aaaaaa}nav{grid-column:2;grid-row:2;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 16px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace}a{color:#e0e0e0;text-underline-offset:3px}nav a{white-space:nowrap}a:focus-visible{outline:2px solid #26bbd9;outline-offset:4px}iframe{border:0;width:100%;height:100%;background:#050505;min-height:0}
    @media(max-width:640px){.viewer-inner{grid-template-columns:minmax(0,1fr);padding:12px 20px}nav{grid-column:1;grid-row:3;justify-content:flex-start;margin-top:8px;gap:8px 16px;font-size:11px}}
    </style></head><body><header><div class="viewer-inner"><small>Uploaded note · v${number}</small><h1>${title}</h1><nav aria-label="Note versions">${navigation}</nav></div></header><iframe title="${title}" src="/content/${id}/v/${number}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></body></html>`;
  const h = headers(VIEWER_CSP);
  h.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { headers: h });
}

const STATIC_PATHS = new Set([
  "/",
  "/favicon.svg",
  "/llms.txt",
  "/starter.zip",
  "/cli.ts",
  "/skill.md",
  "/starter.sha256",
  "/docs",
]);
async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/")) return api(request, env, path, url);
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  if (path === "/healthz") return json({ ok: true });
  const publicRoute = /^\/(d|content|raw)\/([0-9a-f]{32})(?:\/v\/([1-9][0-9]*))?$/.exec(path);
  if (publicRoute) {
    const kind = publicRoute[1]!;
    const version = publicRoute[3] === undefined ? null : parseVersion(publicRoute[3]);
    if (kind !== "d" && version === null) throw notFound();
    const row = await getPublicVersion(env.DB, publicRoute[2]!, version);
    if (kind === "d") return viewer(row);
    // Browsing a payload directly must keep the trusted frame restriction too:
    // sandbox CSP alone cannot stop a document navigating its own top-level tab.
    if (kind === "content" && request.headers.get("Sec-Fetch-Dest") === "document") {
      const h = headers();
      h.set("Location", `/d/${row.id}/v/${row.version}`);
      return new Response(null, { status: 303, headers: h });
    }
    const h = headers(kind === "raw" ? RAW_CSP : CONTENT_CSP);
    h.set(
      "Content-Type",
      kind === "raw" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
    );
    h.set("Content-Length", String(row.bytes));
    h.set("ETag", `"${row.sha256}"`);
    h.set("Cache-Control", "public, max-age=31536000, immutable");
    if (kind === "raw")
      h.set("Content-Disposition", `attachment; filename="note-${row.id}-v${row.version}.html"`);
    return new Response(request.method === "HEAD" ? null : await readOriginal(env.DB, row), {
      headers: h,
    });
  }
  if (
    STATIC_PATHS.has(path) ||
    /^\/assets\/[A-Za-z0-9_./-]+$/.test(path) ||
    /^\/downloads\/(?:starter-[a-f0-9]{12}\.zip|cli-[a-f0-9]{12}\.ts)$/.test(path)
  ) {
    const assetUrl = new URL(request.url);
    if (path === "/docs") assetUrl.pathname = "/";
    const response = await env.ASSETS.fetch(
      path === "/docs" ? new Request(assetUrl, request) : request,
    );
    const h = new Headers(response.headers);
    for (const [name, value] of headers()) h.set(name, value);
    h.delete("Set-Cookie");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: h,
    });
  }
  throw notFound();
}

async function fetch(request: Request, env: Env): Promise<Response> {
  let path = "";
  let response: Response;
  try {
    const url = new URL(request.url);
    path = url.pathname;
    response = await route(request, env, url);
  } catch (error) {
    const safe = error instanceof HttpError ? error : unavailable();
    response = json({ error: { code: safe.code, message: safe.message } }, safe.status);
    if (/^\/(content|raw)(?:\/|$)/.test(path))
      response.headers.set("Content-Security-Policy", RAW_CSP);
  }
  if (request.method === "HEAD") {
    await response.body?.cancel().catch(() => {});
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

export default { fetch };
