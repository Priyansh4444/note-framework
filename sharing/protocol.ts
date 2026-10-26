export const MAX_HTML_BYTES = 5_242_880;
export const MAX_VERSIONS_PER_PUBLISHER = 1000;
export const MAX_CHUNK_UNITS = 262_144;
export const DEFAULT_QUOTA_BYTES = 128 * 1024 * 1024;
export const PUBLISHER_HASH_DOMAIN = "note-framework/publisher/v1\0";
export const OWNER_HASH_DOMAIN = "note-framework/owner/v1\0";
export const ID_PATTERN = /^[0-9a-f]{32}$/;
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

// These are the subset of D1 used here, without adding Worker globals to the app.
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ success: boolean }[]>;
}
export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  PUBLIC_ORIGIN: string;
  OWNER_TOKEN_SHA256: string;
}
export interface Principal {
  publisherId: string;
  keyId: string;
  tokenHash: string;
  label: string;
  quotaBytes: number;
  usedBytes: number;
}
export interface Receipt {
  id: string;
  version: number;
  etag: string;
  sha256: string;
  bytes: number;
  url: string;
  versionUrl: string;
  contentUrl: string;
  downloadUrl: string;
}
export interface Upload {
  id: string;
  operationKey: string;
  expected: number | null;
  title: string;
  bytes: number;
  sha256: string;
  chunks: string[];
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const unauthorized = () =>
  new HttpError(401, "unauthorized", "Valid bearer credentials are required.");
export const notFound = () => new HttpError(404, "not_found", "Not found.");
export const unavailable = () =>
  new HttpError(
    503,
    "unavailable",
    "Storage is temporarily unavailable. Retry the same operation.",
  );

const encoder = new TextEncoder();
export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(value);
}
export async function sha256(value: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof value === "string" ? utf8(value) : value,
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function equalHash(a: string, b: string): boolean {
  if (!HASH_PATTERN.test(a) || !HASH_PATTERN.test(b)) return false;
  let difference = 0;
  // Both inputs are fixed-size digests. Do not exit at the first different byte.
  for (let i = 0; i < 64; i += 2)
    difference |= parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
  return difference === 0;
}
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodeBase64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid base64url");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error("Noncanonical base64url");
  return bytes;
}
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
export function validSecret(value: string): boolean {
  if (value.length !== 43) return false;
  try {
    return decodeBase64url(value).length === 32;
  } catch {
    return false;
  }
}
export function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + MAX_CHUNK_UNITS, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
export function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw unavailable();
  return url.origin;
}
export function makeReceipt(origin: string, upload: Upload): Receipt {
  const version = (upload.expected ?? 0) + 1;
  return {
    id: upload.id,
    version,
    etag: `"${version}"`,
    sha256: upload.sha256,
    bytes: upload.bytes,
    url: `${origin}/d/${upload.id}`,
    versionUrl: `${origin}/d/${upload.id}/v/${version}`,
    contentUrl: `${origin}/content/${upload.id}/v/${version}`,
    downloadUrl: `${origin}/raw/${upload.id}/v/${version}`,
  };
}
