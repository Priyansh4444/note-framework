/** Standalone Bun sharing client; copy this file without repository dependencies.
 * Publisher login uses /api/me; owner bootstrap uses saveOwnerProfile(server, token).
 * NOTE_FRAMEWORK_CONFIG_DIR overrides ~/.config/note-framework/share for isolated use.
 * Local HTTP requires --local on every command (including credential-file login).
 */
import { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";

const MAX_BYTES = 5_242_880;
const ID = /^[0-9a-f]{32}$/;
const OWNER = /^nf_owner_[A-Za-z0-9_-]{43}$/;
const PUBLISHER = /^nf_pub_([0-9a-f]{32})\.[A-Za-z0-9_-]{43}$/;
class ClientError extends Error {
  constructor(
    readonly code: string,
    readonly definitive = false,
  ) {
    super(code);
  }
}
function fail(code: string): never {
  throw new ClientError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_response");
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    fail("invalid_response");
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) fail("invalid_id");
  return value;
}
function tokenRole(token: string): "owner" | "publisher" {
  if (
    OWNER.test(token) &&
    Buffer.from(token.slice(9), "base64url").toString("base64url") === token.slice(9)
  )
    return "owner";
  if (PUBLISHER.test(token)) {
    const part = token.slice(token.indexOf(".") + 1);
    if (Buffer.from(part, "base64url").toString("base64url") === part) return "publisher";
  }
  return fail("invalid_credential");
}
export function normalizeServer(input: string, local = false): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail("invalid_server");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !/^https?:\/\/[^/]+\/?$/i.test(input) ||
    /[?#\\\s]/.test(input) ||
    (url.protocol !== "https:" && !(local && loopback && url.protocol === "http:"))
  )
    fail("invalid_server");
  return url.origin;
}
function hash(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function credentialHash(token: string): string {
  const role = tokenRole(token);
  return hash(`note-framework/${role}/v1\0${token}`);
}
function assertNoSymlinks(path: string): void {
  let current = parse(path).root;
  for (const component of path.slice(current.length).split("/").filter(Boolean)) {
    current = join(current, component);
    try {
      if (lstatSync(current).isSymbolicLink()) fail("unsafe_private_path");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
function assertOutsideProject(path: string): void {
  let current = dirname(path);
  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, "package.json")))
      fail("credential_inside_project");
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function checkPrivate(path: string, directory = false): void {
  assertNoSymlinks(path);
  const info = lstatSync(path);
  if (
    info.uid !== process.getuid?.() ||
    (info.mode & 0o777) !== (directory ? 0o700 : 0o600) ||
    (directory ? !info.isDirectory() : !info.isFile()) ||
    (!directory && info.nlink !== 1)
  )
    fail("unsafe_private_file");
}
function configRoot(): string {
  const configured = process.env.NOTE_FRAMEWORK_CONFIG_DIR;
  if (configured && !isAbsolute(configured)) fail("invalid_config_directory");
  const root = configured || join(homedir(), ".config", "note-framework", "share");
  assertOutsideProject(join(root, "profiles.json"));
  assertNoSymlinks(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  checkPrivate(root, true);
  return root;
}
function privateRead(path: string): unknown {
  assertOutsideProject(path);
  checkPrivate(dirname(path), true);
  checkPrivate(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o600 ||
      info.nlink !== 1 ||
      info.size > 1_048_576
    )
      fail("unsafe_private_file");
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally {
    closeSync(fd);
  }
}
function privateWrite(path: string, value: unknown, exclusive = false): void {
  path = resolve(path);
  assertOutsideProject(path);
  assertNoSymlinks(path);
  checkPrivate(dirname(path), true);
  if (existsSync(path)) {
    checkPrivate(path);
    if (exclusive) fail("credential_file_exists");
  }
  const temporary = join(dirname(path), `.share-${randomUUID()}.tmp`);
  const fd = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    // Link publishes a fully fsynced inode atomically and refuses to replace an
    // existing handoff. No process can observe a half-written credential bundle.
    if (exclusive) {
      linkSync(temporary, path);
      unlinkSync(temporary);
    } else renameSync(temporary, path);
    const directory = openSync(dirname(path), constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
type Credentials = { server: string; token: string };
type Profiles = {
  defaultServer?: string;
  profiles: Record<string, { owner?: string; publisher?: string }>;
};
function readProfiles(): Profiles {
  const path = join(configRoot(), "profiles.json");
  if (!existsSync(path)) return { profiles: {} };
  const raw = object(privateRead(path));
  const profiles: Profiles["profiles"] = {};
  for (const [server, value] of Object.entries(object(raw.profiles))) {
    if (normalizeServer(server, true) !== server) fail("invalid_profile");
    const entry = object(value);
    profiles[server] = {};
    for (const role of ["owner", "publisher"] as const) {
      if (entry[role] !== undefined) {
        if (typeof entry[role] !== "string" || tokenRole(entry[role]) !== role)
          fail("invalid_profile");
        profiles[server][role] = entry[role];
      }
    }
  }
  if (
    raw.defaultServer !== undefined &&
    (typeof raw.defaultServer !== "string" || !profiles[raw.defaultServer])
  )
    fail("invalid_profile");
  return { profiles, defaultServer: raw.defaultServer as string | undefined };
}
function openPrivateDatabase(name: string): Database {
  const root = configRoot();
  const path = join(root, name);
  if (!existsSync(path)) {
    try {
      closeSync(
        openSync(
          path,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  checkPrivate(path);
  for (const suffix of ["-journal", "-wal", "-shm"])
    if (existsSync(path + suffix)) checkPrivate(path + suffix);
  const db = new Database(path, { strict: true });
  db.exec("PRAGMA busy_timeout=30000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
  return db;
}
function openState(): Database {
  const db = openPrivateDatabase("state.sqlite");
  db.exec(`CREATE TABLE IF NOT EXISTS publications (
    origin TEXT NOT NULL, publisher TEXT NOT NULL, source TEXT NOT NULL,
    draft TEXT NOT NULL, version INTEGER NOT NULL,
    PRIMARY KEY(origin,publisher,source));
    CREATE TABLE IF NOT EXISTS operations (
    operation TEXT PRIMARY KEY, origin TEXT NOT NULL, publisher TEXT NOT NULL, source TEXT NOT NULL,
    draft TEXT NOT NULL, expected INTEGER NOT NULL, title TEXT NOT NULL, body BLOB NOT NULL,
    sha256 TEXT NOT NULL, receipt TEXT, failed INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON operations(origin,publisher,source)
    WHERE receipt IS NULL AND failed=0;`);
  return db;
}
function storeProfile(server: string, token: string): void {
  const db = openState();
  try {
    db.exec("BEGIN IMMEDIATE");
    const profiles = readProfiles();
    (profiles.profiles[server] ||= {})[tokenRole(token)] = token;
    profiles.defaultServer = server;
    privateWrite(join(configRoot(), "profiles.json"), profiles);
    db.exec("COMMIT");
  } finally {
    db.close();
  }
}
/** Parent bootstrap calls this after securely installing the owner verifier. No network. */
export function saveOwnerProfile(
  server: string,
  token: string,
  options: { local?: boolean } = {},
): void {
  server = normalizeServer(server, options.local === true);
  if (tokenRole(token) !== "owner") fail("owner_credential_required");
  storeProfile(server, token);
}
type Options = Record<string, string | boolean>;
function parseArgs(args: string[]): { words: string[]; options: Options } {
  const words: string[] = [],
    options: Options = {};
  const flags = new Set(["local", "new", "json", "token-stdin"]);
  const values = new Set([
    "server",
    "credential-file",
    "id",
    "expect",
    "title",
    "name",
    "out",
    "publisher",
    "quota",
    "key",
  ]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (options[key] !== undefined) fail("duplicate_option");
    if (flags.has(key)) options[key] = true;
    else if (values.has(key) && args[index + 1] && !args[index + 1]!.startsWith("--"))
      options[key] = args[++index]!;
    else fail("invalid_arguments");
  }
  return { words, options };
}
function textOption(options: Options, name: string): string | undefined {
  return typeof options[name] === "string" ? (options[name] as string) : undefined;
}
function allowOptions(options: Options, allowed: string[]): void {
  for (const name of Object.keys(options))
    if (!["server", "local", ...allowed].includes(name)) fail("invalid_arguments");
}
function credentials(options: Options, role: "publisher" | "owner"): Credentials {
  const profiles = readProfiles();
  const selected = textOption(options, "server") ?? profiles.defaultServer;
  if (!selected) fail("login_required");
  const server = normalizeServer(selected, options.local === true);
  const token = profiles.profiles[server]?.[role];
  if (!token) fail(`${role}_login_required`);
  return { server, token };
}
const KNOWN_CODES = new Set([
  "unauthorized",
  "forbidden",
  "not_found",
  "draft_not_found",
  "stale_version",
  "precondition_failed",
  "precondition_required",
  "idempotency_conflict",
  "quota_exceeded",
  "invalid_request",
  "invalid_title",
  "invalid_utf8",
  "too_large",
  "key_conflict",
  "key_revoked",
  "publisher_not_found",
  "rate_limited",
  "invalid_registration",
  "registration_conflict",
  "body_too_large",
  "empty_body",
  "invalid_body",
  "unsupported_encoding",
  "unsupported_media_type",
  "invalid_idempotency_key",
  "invalid_precondition",
  "invalid_cursor",
  "invalid_limit",
  "unavailable",
]);
async function responseJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) fail("invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65_536) {
      await reader.cancel();
      fail("invalid_response");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return fail("invalid_response");
  }
}
async function api(auth: Credentials, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${auth.token}`);
  return serviceRequest(auth.server, path, { ...init, headers });
}
async function serviceRequest(
  server: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(server + path, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const error = object(object(await responseJson(response)).error);
      if (typeof error.code === "string" && KNOWN_CODES.has(error.code)) code = error.code;
    } catch {
      /* Never reflect untrusted response text into logs. */
    }
    throw new ClientError(
      code,
      [400, 403, 404, 405, 409, 412, 413, 415, 422, 428].includes(response.status),
    );
  }
  return response;
}
type Me = { publisherId: string; keyId: string };
async function publisherMe(auth: Credentials): Promise<Me> {
  const raw = object(await responseJson(await api(auth, "/api/me")));
  const result = { publisherId: identifier(raw.publisherId), keyId: identifier(raw.keyId) };
  if (result.keyId !== PUBLISHER.exec(auth.token)?.[1]) fail("identity_mismatch");
  if (typeof raw.label !== "string") fail("invalid_response");
  integer(raw.maxBytes, 1);
  integer(raw.quotaBytes);
  integer(raw.usedBytes);
  return result;
}
type Bundle = Credentials & {
  publisherId: string;
  keyId: string;
  label: string;
  quotaBytes?: number;
};
function readBundle(path: string, local: boolean): Bundle {
  const raw = object(privateRead(resolve(path)));
  if (
    typeof raw.server !== "string" ||
    typeof raw.token !== "string" ||
    tokenRole(raw.token) !== "publisher"
  )
    fail("invalid_credential");
  const bundle: Bundle = {
    server: normalizeServer(raw.server, local),
    token: raw.token,
    publisherId: identifier(raw.publisherId),
    keyId: identifier(raw.keyId),
    label: validTitle(raw.label),
  };
  if (PUBLISHER.exec(bundle.token)?.[1] !== bundle.keyId) fail("identity_mismatch");
  if (raw.quotaBytes !== undefined) bundle.quotaBytes = integer(raw.quotaBytes);
  return bundle;
}
function validTitle(value: unknown): string {
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value) ||
    Buffer.byteLength(value) > 256
  )
    fail("invalid_title");
  return value;
}
async function login(options: Options): Promise<void> {
  allowOptions(options, ["credential-file", "token-stdin", "new", "name"]);
  const file = textOption(options, "credential-file");
  if (!file && options["token-stdin"] !== true) return agentLogin(options);
  if (options.new || options.name) fail("invalid_arguments");
  if (!!file === (options["token-stdin"] === true)) fail("invalid_arguments");
  let auth: Credentials;
  let bundle: Bundle | undefined;
  if (file) {
    bundle = readBundle(file, options.local === true);
    if (
      options.server &&
      normalizeServer(String(options.server), options.local === true) !== bundle.server
    )
      fail("server_mismatch");
    auth = bundle;
  } else {
    if (!options.server) fail("server_required");
    const reader = Bun.stdin.stream().getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        fail("invalid_credential");
      }
      chunks.push(value);
    }
    auth = {
      server: normalizeServer(String(options.server), options.local === true),
      token: Buffer.concat(chunks).toString("utf8").trim(),
    };
  }
  if (tokenRole(auth.token) !== "publisher") fail("owner_bootstrap_required");
  const me = await publisherMe(auth);
  if (bundle && (me.publisherId !== bundle.publisherId || me.keyId !== bundle.keyId))
    fail("identity_mismatch");
  storeProfile(auth.server, auth.token);
  console.log("Logged in.");
}

type PendingLogin = {
  version: 1;
  server: string;
  requestId: string;
  keyId: string;
  token: string;
  pollSecret: string;
  label: string;
  createdAt: number;
  expiresAt: number | null;
  state: "pending" | "denied" | "expired";
};
const LOGIN_LIMIT_MS = 10 * 60_000;
const POLL_DOMAIN = "note-framework/agent-poll/v1\0";
function loginLabel(value: string): string {
  if (!value.trim() || Buffer.byteLength(validTitle(value)) > 80) fail("invalid_agent_name");
  return value;
}
function pendingLogin(value: unknown, server: string): PendingLogin {
  const raw = object(value);
  if (
    raw.version !== 1 ||
    raw.server !== server ||
    typeof raw.token !== "string" ||
    tokenRole(raw.token) !== "publisher" ||
    typeof raw.pollSecret !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(raw.pollSecret) ||
    Buffer.from(raw.pollSecret, "base64url").toString("base64url") !== raw.pollSecret ||
    typeof raw.label !== "string" ||
    !["pending", "denied", "expired"].includes(String(raw.state))
  )
    fail("invalid_login_journal");
  const keyId = identifier(raw.keyId);
  if (PUBLISHER.exec(raw.token)?.[1] !== keyId) fail("invalid_login_journal");
  return {
    version: 1,
    server,
    requestId: identifier(raw.requestId),
    keyId,
    token: raw.token,
    pollSecret: raw.pollSecret,
    label: loginLabel(raw.label),
    createdAt: integer(raw.createdAt),
    expiresAt: raw.expiresAt === null ? null : integer(raw.expiresAt, 1),
    state: raw.state as PendingLogin["state"],
  };
}
function newLogin(server: string, label: string): PendingLogin {
  const keyId = randomBytes(16).toString("hex");
  return {
    version: 1,
    server,
    requestId: randomBytes(16).toString("hex"),
    keyId,
    token: `nf_pub_${keyId}.${randomBytes(32).toString("base64url")}`,
    pollSecret: randomBytes(32).toString("base64url"),
    label,
    createdAt: Date.now(),
    expiresAt: null,
    state: "pending",
  };
}
async function knownPublisher(auth: Credentials): Promise<Me | null> {
  try {
    return await publisherMe(auth);
  } catch (error) {
    if (error instanceof ClientError && error.code === "unauthorized") return null;
    throw error;
  }
}
async function grantJson(server: string, path: string, body: unknown) {
  return object(
    await responseJson(
      await serviceRequest(server, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
  );
}

async function agentLogin(options: Options): Promise<void> {
  const profiles = readProfiles();
  const selected = textOption(options, "server") ?? profiles.defaultServer;
  if (!selected) fail("server_required");
  const server = normalizeServer(selected, options.local === true);
  const label = loginLabel(textOption(options, "name") ?? "Coding agent");
  // A separate database locks only this origin's login, not uploads or another
  // service. SQLite releases the lock if a waiting CLI is killed.
  const db = openPrivateDatabase(`login-${hash(server)}.sqlite`);
  db.exec(
    "CREATE TABLE IF NOT EXISTS pending_login (id INTEGER PRIMARY KEY CHECK(id=1), record TEXT NOT NULL)",
  );
  db.exec("PRAGMA busy_timeout=1000");
  let inTransaction = false;
  const lock = () => {
    try {
      db.exec("BEGIN IMMEDIATE");
      inTransaction = true;
    } catch {
      fail("login_in_progress");
    }
  };
  const commit = () => {
    db.exec("COMMIT");
    inTransaction = false;
  };
  const read = () => {
    const row = db
      .query<{ record: string }, []>("SELECT record FROM pending_login WHERE id=1")
      .get();
    return row ? pendingLogin(JSON.parse(row.record), server) : null;
  };
  const save = (record: PendingLogin) =>
    db
      .query(
        "INSERT INTO pending_login(id,record) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record",
      )
      .run(JSON.stringify(record));
  try {
    lock();
    let pending = options.new ? null : read();
    if (!pending && !options.new) {
      const existing = readProfiles().profiles[server]?.publisher;
      if (existing && (await knownPublisher({ server, token: existing }))) {
        storeProfile(server, existing);
        commit();
        console.log("Logged in.");
        return;
      }
    }
    pending ??= newLogin(server, label);
    if (options.name && pending.label !== label) fail("pending_login_exists");
    if (pending.state !== "pending") fail(`login_${pending.state}`);
    save(pending);
    // The credential and grant binding must survive a crash before the first
    // request. The longer transaction below owns only network serialization.
    commit();
    lock();
    const current = read();
    if (!current || current.requestId !== pending.requestId) fail("login_replaced");
    pending = current;
    const auth = { server, token: pending.token };
    if (await knownPublisher(auth)) {
      storeProfile(server, pending.token);
      db.exec("DELETE FROM pending_login WHERE id=1");
      commit();
      console.log("Logged in.");
      return;
    }
    const expire = () => {
      pending.state = "expired";
      save(pending);
      commit();
      fail("login_expired");
    };
    if (Date.now() >= pending.createdAt + LOGIN_LIMIT_MS) expire();
    const tokenHash = credentialHash(pending.token);
    const fingerprint = tokenHash.slice(0, 12).match(/.{3}/g)!.join(" ");
    const verificationUrl = `${server}/agent/approve?request=${pending.requestId}`;
    const started = await grantJson(server, "/api/agent-grants", {
      requestId: pending.requestId,
      keyId: pending.keyId,
      tokenHash,
      pollHash: hash(POLL_DOMAIN + pending.pollSecret),
      label: pending.label,
    });
    const expiresAt = integer(started.expiresAt, 1);
    if (
      started.requestId !== pending.requestId ||
      started.verificationUrl !== verificationUrl ||
      started.fingerprint !== fingerprint ||
      expiresAt > Date.now() + LOGIN_LIMIT_MS + 5000 ||
      (pending.expiresAt !== null && pending.expiresAt !== expiresAt)
    )
      fail("invalid_response");
    pending.expiresAt = expiresAt;
    if (Date.now() >= expiresAt) expire();
    console.log(
      `Approve this agent: ${verificationUrl}\nFingerprint: ${fingerprint}\nWaiting for approval…`,
    );
    const deadline = Math.min(expiresAt, pending.createdAt + LOGIN_LIMIT_MS);
    while (Date.now() < deadline) {
      const result = await grantJson(server, `/api/agent-grants/${pending.requestId}/poll`, {
        pollSecret: pending.pollSecret,
      });
      if (integer(result.expiresAt, 1) !== expiresAt) fail("invalid_response");
      if (result.state === "approved") {
        const publisherId = identifier(result.publisherId);
        if (identifier(result.keyId) !== pending.keyId) fail("identity_mismatch");
        const me = await publisherMe(auth);
        if (me.publisherId !== publisherId) fail("identity_mismatch");
        storeProfile(server, pending.token);
        db.exec("DELETE FROM pending_login WHERE id=1");
        commit();
        console.log("Logged in.");
        return;
      }
      if (result.state === "denied" || result.state === "expired") {
        pending.state = result.state;
        save(pending);
        commit();
        fail(`login_${result.state}`);
      }
      if (result.state !== "pending") fail("invalid_response");
      await Bun.sleep(Math.min(2000, Math.max(0, deadline - Date.now())));
    }
    expire();
  } finally {
    if (inTransaction) db.exec("ROLLBACK");
    db.close();
  }
}
type Receipt = {
  id: string;
  version: number;
  etag: string;
  sha256: string;
  bytes: number;
  url: string;
  versionUrl: string;
  contentUrl: string;
  downloadUrl: string;
};
type Operation = {
  operation: string;
  origin: string;
  publisher: string;
  source: string;
  draft: string;
  expected: number;
  title: string;
  body: Uint8Array;
  sha256: string;
  receipt: string | null;
  failed: number;
};
function receiptOf(value: unknown, operation: Operation): Receipt {
  const raw = object(value);
  const id = identifier(raw.id),
    version = integer(raw.version, 1);
  if (
    id !== operation.draft ||
    version !== operation.expected + 1 ||
    raw.etag !== `"${version}"` ||
    raw.sha256 !== operation.sha256 ||
    raw.bytes !== operation.body.length
  )
    fail("invalid_receipt");
  const paths = {
    url: `/d/${id}`,
    versionUrl: `/d/${id}/v/${version}`,
    contentUrl: `/content/${id}/v/${version}`,
    downloadUrl: `/raw/${id}/v/${version}`,
  };
  for (const [key, path] of Object.entries(paths))
    if (raw[key] !== operation.origin + path) fail("invalid_receipt");
  return {
    id,
    version,
    etag: raw.etag as string,
    sha256: raw.sha256 as string,
    bytes: raw.bytes as number,
    url: raw.url as string,
    versionUrl: raw.versionUrl as string,
    contentUrl: raw.contentUrl as string,
    downloadUrl: raw.downloadUrl as string,
  };
}
async function verifyDownload(receipt: Receipt, signal: AbortSignal): Promise<void> {
  const response = await fetch(receipt.downloadUrl, { redirect: "error", signal });
  if (response.status !== 200) fail("download_verification_failed");
  const reader = response.body?.getReader();
  if (!reader) fail("download_verification_failed");
  const digest = createHash("sha256");
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > receipt.bytes) {
      await reader.cancel();
      fail("download_verification_failed");
    }
    digest.update(value);
  }
  if (bytes !== receipt.bytes || digest.digest("hex") !== receipt.sha256)
    fail("download_verification_failed");
}
function sourcePath(file: string): string {
  const path = resolve(file);
  assertNoSymlinks(path);
  return join(realpathSync(dirname(path)), basename(path));
}
function readHtml(path: string, title?: string): { body: Uint8Array; title: string } {
  if (!lstatSync(path).isFile()) fail("html_file_required");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let body: Buffer;
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) fail("html_file_required");
    if (info.size > MAX_BYTES) fail("file_too_large");
    const buffer = Buffer.allocUnsafe(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    body = buffer.subarray(0, size);
  } finally {
    closeSync(fd);
  }
  if (body.length > MAX_BYTES) fail("file_too_large");
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    return fail("invalid_utf8");
  }
  let inferred =
    /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ||
    basename(path);
  inferred = inferred
    .replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
      };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]!;
      const number =
        entity[2]?.toLowerCase() === "x"
          ? parseInt(entity.slice(3, -1), 16)
          : parseInt(entity.slice(2, -1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : "�";
    })
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");
  let bounded = "",
    titleBytes = 0;
  for (const character of inferred) {
    titleBytes += Buffer.byteLength(character);
    if (titleBytes > 256) break;
    bounded += character;
  }
  inferred = bounded;
  return { body, title: validTitle(title ?? inferred) };
}
function decimalOption(value: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) fail("invalid_number");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail("invalid_number");
  return number;
}
async function upload(
  file: string | (() => Promise<string>),
  source: string,
  options: Options,
): Promise<Receipt> {
  const auth = credentials(options, "publisher");
  const me = await publisherMe(auth);
  const db = openState();
  let inTransaction = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    inTransaction = true;
    let operation = db
      .query<Operation, [string, string, string]>(
        "SELECT * FROM operations WHERE origin=? AND publisher=? AND source=? AND receipt IS NULL AND failed=0",
      )
      .get(auth.server, me.publisherId, source);
    if (!operation) {
      const current = db
        .query<{ draft: string; version: number }, [string, string, string]>(
          "SELECT draft,version FROM publications WHERE origin=? AND publisher=? AND source=?",
        )
        .get(auth.server, me.publisherId, source);
      const explicitId = textOption(options, "id");
      const expectedOption = textOption(options, "expect");
      if (options.new && (explicitId || expectedOption)) fail("invalid_arguments");
      if (expectedOption && !explicitId) fail("id_required");
      if (explicitId && !expectedOption) fail("expect_required");
      const draft = explicitId
        ? identifier(explicitId)
        : !options.new && current
          ? current.draft
          : randomBytes(16).toString("hex");
      const expected = expectedOption
        ? decimalOption(expectedOption)
        : !options.new && current
          ? current.version
          : 0;
      const payload = readHtml(
        typeof file === "function" ? await file() : file,
        textOption(options, "title"),
      );
      operation = {
        operation: randomUUID(),
        origin: auth.server,
        publisher: me.publisherId,
        source,
        draft,
        expected,
        ...payload,
        sha256: hash(payload.body),
        receipt: null,
        failed: 0,
      };
      db.query(
        "INSERT INTO operations(operation,origin,publisher,source,draft,expected,title,body,sha256) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        operation.operation,
        operation.origin,
        operation.publisher,
        operation.source,
        operation.draft,
        operation.expected,
        operation.title,
        operation.body,
        operation.sha256,
      );
    }
    // Commit exact bytes before any PUT. A killed process's later network transaction
    // rolls back independently; the durable pending operation is still recoverable.
    db.exec("COMMIT");
    inTransaction = false;
    db.exec("BEGIN IMMEDIATE");
    inTransaction = true;
    operation = db
      .query<Operation, [string]>("SELECT * FROM operations WHERE operation=?")
      .get(operation.operation)!;
    if (operation.failed) fail("operation_rejected");
    let receipt: Receipt;
    const signal = AbortSignal.timeout(20_000);
    if (operation.receipt) receipt = receiptOf(JSON.parse(operation.receipt), operation);
    else {
      try {
        const response = await api(auth, `/api/drafts/${operation.draft}`, {
          method: "PUT",
          signal,
          body: Buffer.from(operation.body),
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Idempotency-Key": operation.operation,
            "If-Match": `"${operation.expected}"`,
            "X-Note-Title": Buffer.from(operation.title).toString("base64url"),
          },
        });
        if (![200, 201].includes(response.status)) fail("invalid_response");
        receipt = receiptOf(await responseJson(response), operation);
      } catch (error) {
        if (error instanceof ClientError && error.definitive) {
          db.query("UPDATE operations SET failed=1, body=X'' WHERE operation=?").run(
            operation.operation,
          );
          db.exec("COMMIT");
          inTransaction = false;
        }
        throw error;
      }
    }
    await verifyDownload(receipt, signal);
    if (!operation.receipt) {
      db.query(
        "INSERT INTO publications(origin,publisher,source,draft,version) VALUES(?,?,?,?,?) ON CONFLICT(origin,publisher,source) DO UPDATE SET draft=excluded.draft,version=excluded.version",
      ).run(operation.origin, operation.publisher, operation.source, receipt.id, receipt.version);
      // A waiting process may observe this completed operation after a later one
      // finishes. Replaying its receipt must never move the local head backwards.
      db.query("UPDATE operations SET receipt=? WHERE operation=?").run(
        JSON.stringify(receipt),
        operation.operation,
      );
    }
    db.exec("COMMIT");
    inTransaction = false;
    return receipt;
  } finally {
    if (inTransaction) db.exec("ROLLBACK");
    db.close();
  }
}
async function register(bundle: Bundle, options: Options): Promise<void> {
  if (
    options.server &&
    normalizeServer(String(options.server), options.local === true) !== bundle.server
  )
    fail("server_mismatch");
  const auth = credentials({ ...options, server: bundle.server }, "owner");
  const response = await api(
    auth,
    `/api/admin/publishers/${bundle.publisherId}/keys/${bundle.keyId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: bundle.label,
        tokenHash: credentialHash(bundle.token),
        ...(bundle.quotaBytes === undefined ? {} : { quotaBytes: bundle.quotaBytes }),
      }),
    },
  );
  if (![200, 201, 204].includes(response.status)) fail("invalid_response");
  const registered = object(await responseJson(response));
  if (
    registered.publisherId !== bundle.publisherId ||
    registered.keyId !== bundle.keyId ||
    registered.label !== bundle.label ||
    typeof registered.revoked !== "boolean"
  )
    fail("invalid_response");
  if (registered.revoked) fail("key_revoked");
  console.log(`Registered publisher ${bundle.publisherId}, key ${bundle.keyId}.`);
}
async function keyCommand(
  action: string | undefined,
  args: string[],
  options: Options,
): Promise<void> {
  if (action === "create") {
    allowOptions(options, ["name", "out", "publisher", "quota"]);
    if (args.length || !options.name || !options.out) fail("invalid_arguments");
    const auth = credentials(options, "owner");
    const publisherId = options.publisher
      ? identifier(options.publisher)
      : randomBytes(16).toString("hex");
    const keyId = randomBytes(16).toString("hex");
    const bundle: Bundle = {
      server: auth.server,
      token: `nf_pub_${keyId}.${randomBytes(32).toString("base64url")}`,
      publisherId,
      keyId,
      label: validTitle(options.name),
    };
    if (options.quota) bundle.quotaBytes = decimalOption(String(options.quota));
    // A durable private handoff precedes registration; retry using key register.
    privateWrite(resolve(String(options.out)), bundle, true);
    await register(bundle, options);
  } else if (action === "register") {
    allowOptions(options, []);
    if (args.length !== 1) fail("invalid_arguments");
    await register(readBundle(args[0]!, options.local === true), options);
  } else if (action === "revoke") {
    allowOptions(options, ["publisher", "key"]);
    if (args.length || !options.publisher || !options.key) fail("invalid_arguments");
    const auth = credentials(options, "owner");
    await api(
      auth,
      `/api/admin/publishers/${identifier(options.publisher)}/keys/${identifier(options.key)}`,
      { method: "DELETE" },
    );
    console.log("Key revoked.");
  } else fail("invalid_arguments");
}
async function list(options: Options): Promise<void> {
  allowOptions(options, ["json"]);
  const auth = credentials(options, "publisher");
  const raw = object(await responseJson(await api(auth, "/api/drafts")));
  if (
    !Array.isArray(raw.items) ||
    raw.items.length > 1000 ||
    !(raw.nextCursor === null || typeof raw.nextCursor === "string")
  )
    fail("invalid_response");
  const items = raw.items.map((value) => {
    const item = object(value),
      id = identifier(item.id),
      version = integer(item.version, 1);
    if (
      item.url !== `${auth.server}/d/${id}` ||
      item.versionUrl !== `${auth.server}/d/${id}/v/${version}` ||
      item.etag !== `"${version}"`
    )
      fail("invalid_response");
    if (
      typeof item.updatedAt !== "string" &&
      (typeof item.updatedAt !== "number" || !Number.isFinite(item.updatedAt))
    )
      fail("invalid_response");
    return {
      id,
      title: validTitle(item.title),
      version,
      etag: item.etag,
      url: item.url,
      versionUrl: item.versionUrl,
      updatedAt: item.updatedAt,
    };
  });
  if (options.json) console.log(JSON.stringify({ items, nextCursor: raw.nextCursor }));
  else
    for (const item of items)
      console.log(`${item.url}\t${item.version}\t${JSON.stringify(item.title)}`);
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  const { words, options } = parseArgs(args);
  const [command, ...rest] = words;
  if (command === "login" && rest.length === 0) await login(options);
  else if (command === "key") await keyCommand(rest[0], rest.slice(1), options);
  else if (command === "list" && rest.length === 0) await list(options);
  else if ((command === "upload" || command === "note") && rest.length === 1) {
    allowOptions(options, ["new", "id", "expect", "json", "title"]);
    let file: string | (() => Promise<string>), source: string;
    if (command === "note") {
      const slug = rest[0]!;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail("invalid_slug");
      source = sourcePath(join(process.cwd(), "src", "notes", slug));
      file = async () => {
        const result = Bun.spawn([process.execPath, "run", "note:html", slug], {
          cwd: process.cwd(),
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
        // Export tools may print URLs; keep successful upload stdout machine-readable.
        const drains = Promise.all([
          new Response(result.stdout).arrayBuffer(),
          new Response(result.stderr).arrayBuffer(),
        ]);
        if ((await result.exited) !== 0) {
          await drains;
          fail("note_export_failed");
        }
        await drains;
        return sourcePath(join(process.cwd(), `dist-${slug}-single`, "index.html"));
      };
    } else {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rest[0]!)) fail("html_file_required");
      file = sourcePath(rest[0]!);
      source = file;
    }
    const receipt = await upload(file, source, options);
    console.log(options.json ? JSON.stringify(receipt) : receipt.url);
  } else fail("invalid_arguments");
}
if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`share: ${error instanceof ClientError ? error.code : "operation_failed"}`);
    process.exitCode = 1;
  });
}
