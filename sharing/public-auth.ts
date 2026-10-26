import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  HASH_PATTERN,
  ID_PATTERN,
  MAX_HTML_BYTES,
  PUBLISHER_HASH_DOMAIN,
  HttpError,
  base64url,
  decodeBase64url,
  equalHash,
  randomId,
  sha256,
  unauthorized,
  notFound,
  unavailable,
  utf8,
  validSecret,
  type D1Database,
  type D1Statement,
  type Env,
  type Principal,
} from "./protocol";
import { authenticatePublisher } from "./store";

export const PUBLIC_LIMITS = {
  accounts: 1000,
  quotaBytes: 32 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  totalVersions: 10000,
  passkeys: 8,
  sessions: 8,
  activeAgents: 16,
  lifetimeAgents: 64,
  ceremonies: 2000,
  grants: 2000,
} as const;
const SESSION_COOKIE = "__Host-nf_session";
const CHALLENGE_COOKIE = "__Host-nf_challenge";
const CEREMONY_MS = 10 * 60_000;
const SESSION_MS = 7 * 86_400_000;
const POLL_DOMAIN = "note-framework/agent-poll/v1\0";
const q = (db: D1Database, sql: string, ...values: (string | number | null)[]) =>
  db.prepare(sql).bind(...values);
const invalid = (message = "The request is invalid.") =>
  new HttpError(400, "invalid_request", message);
const conflict = () =>
  new HttpError(
    409,
    "auth_conflict",
    "This request has changed or already completed. Start again.",
  );
const capacity = () =>
  new HttpError(429, "capacity_reached", "The public beta is at capacity. Try again later.");

export function authJson(value: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(value), { status, headers });
}
function cookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
}
function readCookie(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0]!.slice(name.length + 1) : null;
}
export function requireBrowserMutation(request: Request, origin: string): void {
  if (request.headers.get("Origin") !== origin || request.headers.get("X-Note-Request") !== "1")
    throw new HttpError(403, "forbidden", "Use the account page on this origin.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")
  )
    throw invalid("Use application/json.");
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  const bytes = new Uint8Array(16384);
  let count = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (count + part.value.length > bytes.length) {
        await reader.cancel();
        throw new HttpError(413, "body_too_large", "Use at most 16 KiB of JSON.");
      }
      bytes.set(part.value, count);
      count += part.value.length;
    }
    return object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count))),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}
function label(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    utf8(value).length > 128 ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)
  )
    throw invalid("Use a name between 1 and 128 UTF-8 bytes on one line.");
  return value.trim();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw invalid();
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw invalid();
  return value;
}
function credentialId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 1400) throw invalid();
  try {
    decodeBase64url(value);
  } catch {
    throw invalid();
  }
  return value;
}
async function batch(db: D1Database, statements: D1Statement[]): Promise<void> {
  const result = await db.batch(statements);
  if (result.some((item) => !item.success)) throw unavailable();
}
function guard(
  db: D1Database,
  nonce: string,
  condition: string,
  ...values: (string | number | null)[]
): D1Statement {
  return q(
    db,
    `INSERT INTO transaction_guards(nonce,ok) VALUES (?,CASE WHEN ${condition} THEN 1 ELSE 0 END)`,
    nonce,
    ...values,
  );
}
const validSessionSql = `EXISTS(SELECT 1 FROM browser_sessions s JOIN api_keys k ON k.id=s.key_id JOIN publishers p ON p.id=s.publisher_id WHERE s.key_id=? AND s.publisher_id=? AND k.revoked=0 AND p.active=1 AND k.expires_at>unixepoch('subsec')*1000)`;

export async function session(
  request: Request,
  env: Env,
): Promise<{ token: string; principal: Principal }> {
  // An explicit bearer identity must never be silently replaced by a cookie.
  if (request.headers.has("Authorization")) throw unauthorized();
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) throw unauthorized();
  const principal = await authenticatePublisher(env.DB, `Bearer ${token}`);
  const row = await q(
    env.DB,
    `SELECT key_id FROM browser_sessions WHERE key_id=? AND publisher_id=?`,
    principal.keyId,
    principal.publisherId,
  ).first();
  if (!row) throw unauthorized();
  return { token, principal };
}
export async function publisherRequest(
  request: Request,
  env: Env,
  origin: string,
): Promise<Request> {
  if (request.headers.has("Authorization")) return request;
  const auth = await session(request, env);
  if (!["GET", "HEAD"].includes(request.method)) requireBrowserMutation(request, origin);
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${auth.token}`);
  return new Request(request, { headers });
}

export async function cleanupPublic(db: D1Database): Promise<void> {
  await batch(db, [
    q(
      db,
      `DELETE FROM auth_challenges WHERE id IN(SELECT id FROM auth_challenges WHERE expires_at<=? LIMIT 100)`,
      Date.now(),
    ),
    q(
      db,
      `DELETE FROM agent_grants WHERE id IN(SELECT id FROM agent_grants WHERE expires_at<=? LIMIT 100)`,
      Date.now(),
    ),
    q(
      db,
      `DELETE FROM auth_rates WHERE bucket IN(SELECT bucket FROM auth_rates WHERE expires_at<=? LIMIT 100)`,
      Date.now(),
    ),
    q(
      db,
      `DELETE FROM api_keys WHERE id IN(SELECT k.id FROM api_keys k JOIN browser_sessions s ON s.key_id=k.id WHERE k.revoked=1 OR k.expires_at<=? LIMIT 100)`,
      Date.now(),
    ),
  ]);
}
async function rate(request: Request, db: D1Database): Promise<void> {
  await cleanupPublic(db);
  const now = Date.now(),
    window = Math.floor(now / CEREMONY_MS),
    end = (window + 1) * CEREMONY_MS;
  const ip = await sha256(
    `note-framework/auth-rate/v1\0${request.headers.get("CF-Connecting-IP") ?? "local"}`,
  );
  const buckets = [
    { name: `ip:${ip}:${window}`, maximum: 60 },
    { name: `global:${window}`, maximum: 3000 },
  ];
  const nonce = randomId();
  try {
    await batch(db, [
      guard(
        db,
        nonce,
        `(SELECT COUNT(*) FROM auth_rates)<10000 AND ${buckets.map(() => `COALESCE((SELECT count FROM auth_rates WHERE bucket=?),0)<?`).join(" AND ")}`,
        ...buckets.flatMap((entry) => [entry.name, entry.maximum]),
      ),
      ...buckets.map((entry) =>
        q(
          db,
          `INSERT INTO auth_rates(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1`,
          entry.name,
          end,
        ),
      ),
      q(db, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw new HttpError(429, "rate_limited", "Too many sign-in requests. Try again later.");
  }
}

type Challenge = {
  id: string;
  challenge: string;
  kind: "register" | "login" | "backup";
  publisher_id: string | null;
  session_key_id: string | null;
  label: string;
  expires_at: number;
};
async function challenge(
  request: Request,
  db: D1Database,
  kind: Challenge["kind"],
): Promise<Challenge> {
  const secret = readCookie(request, CHALLENGE_COOKIE);
  if (!secret || !validSecret(secret)) throw unauthorized();
  const row = await q(
    db,
    `SELECT * FROM auth_challenges WHERE id=?`,
    await sha256(secret),
  ).first<Challenge>();
  if (!row || row.kind !== kind || row.expires_at <= Date.now()) throw unauthorized();
  return row;
}
async function saveChallenge(
  db: D1Database,
  entry: Omit<Challenge, "id" | "expires_at">,
): Promise<string> {
  const secret = base64url(crypto.getRandomValues(new Uint8Array(32))),
    nonce = randomId();
  try {
    await batch(db, [
      guard(db, nonce, `(SELECT COUNT(*) FROM auth_challenges)<?`, PUBLIC_LIMITS.ceremonies),
      q(
        db,
        `INSERT INTO auth_challenges(id,challenge,kind,publisher_id,session_key_id,label,expires_at) VALUES (?,?,?,?,?,?,?)`,
        await sha256(secret),
        entry.challenge,
        entry.kind,
        entry.publisher_id,
        entry.session_key_id,
        entry.label,
        Date.now() + CEREMONY_MS,
      ),
      q(db, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw capacity();
  }
  return cookie(CHALLENGE_COOKIE, secret, CEREMONY_MS / 1000);
}
function newSession(publisherId: string) {
  const keyId = randomId(),
    token = `nf_pub_${keyId}.${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  return { keyId, token, publisherId, expiresAt: Date.now() + SESSION_MS };
}
async function sessionWrites(
  db: D1Database,
  created: ReturnType<typeof newSession>,
): Promise<D1Statement[]> {
  return [
    q(
      db,
      `INSERT INTO api_keys(id,publisher_id,token_hash,created_at,expires_at) VALUES (?,?,?,?,?)`,
      created.keyId,
      created.publisherId,
      await sha256(PUBLISHER_HASH_DOMAIN + created.token),
      Date.now(),
      created.expiresAt,
    ),
    q(
      db,
      `INSERT INTO browser_sessions(key_id,publisher_id,created_at) VALUES (?,?,?)`,
      created.keyId,
      created.publisherId,
      Date.now(),
    ),
  ];
}
function sessionCookies(created: ReturnType<typeof newSession>): string[] {
  return [
    cookie(SESSION_COOKIE, created.token, SESSION_MS / 1000),
    cookie(CHALLENGE_COOKIE, "", 0),
  ];
}
const challengeSql = `EXISTS(SELECT 1 FROM auth_challenges WHERE id=? AND kind=? AND expires_at>unixepoch('subsec')*1000)`;
const sessionCountSql = `(SELECT COUNT(*) FROM browser_sessions s JOIN api_keys k ON k.id=s.key_id WHERE s.publisher_id=? AND k.revoked=0 AND k.expires_at>unixepoch('subsec')*1000)`;

type StoredPasskey = {
  id: string;
  publisher_id: string;
  public_key: string;
  counter: number;
  label: string;
  created_at: number;
};
function registrationResponse(value: unknown): RegistrationResponseJSON {
  const raw = object(value);
  credentialId(raw.id);
  if (
    raw.type !== "public-key" ||
    raw.rawId !== raw.id ||
    !raw.response ||
    typeof raw.response !== "object"
  )
    throw invalid();
  return raw as unknown as RegistrationResponseJSON;
}
function authenticationResponse(value: unknown): AuthenticationResponseJSON {
  const raw = object(value);
  credentialId(raw.id);
  if (
    raw.type !== "public-key" ||
    raw.rawId !== raw.id ||
    !raw.response ||
    typeof raw.response !== "object"
  )
    throw invalid();
  return raw as unknown as AuthenticationResponseJSON;
}

async function options(
  request: Request,
  env: Env,
  origin: string,
  kind: Challenge["kind"],
): Promise<Response> {
  requireBrowserMutation(request, origin);
  const input = await body(request);
  await rate(request, env.DB);
  if (kind === "login") {
    const generated = await generateAuthenticationOptions({
      rpID: new URL(origin).hostname,
      userVerification: "required",
      timeout: CEREMONY_MS,
    });
    const saved = await saveChallenge(env.DB, {
      challenge: generated.challenge,
      kind,
      publisher_id: null,
      session_key_id: null,
      label: "",
    });
    return authJson(generated, 200, [saved]);
  }
  const name = label(input.label);
  const auth = kind === "backup" ? await session(request, env) : null;
  const publisherId = auth?.principal.publisherId ?? randomId();
  const existing =
    kind === "backup"
      ? (
          await q(env.DB, `SELECT id FROM passkeys WHERE publisher_id=?`, publisherId).all<{
            id: string;
          }>()
        ).results
      : [];
  if (existing.length >= PUBLIC_LIMITS.passkeys) throw capacity();
  const generated = await generateRegistrationOptions({
    rpName: "Note Framework",
    rpID: new URL(origin).hostname,
    userID: utf8(publisherId),
    userName: name,
    userDisplayName: name,
    attestationType: "none",
    supportedAlgorithmIDs: [-7, -257],
    timeout: CEREMONY_MS,
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    excludeCredentials: existing.map((entry) => ({ id: entry.id })),
  });
  const saved = await saveChallenge(env.DB, {
    challenge: generated.challenge,
    kind,
    publisher_id: publisherId,
    session_key_id: auth?.principal.keyId ?? null,
    label: name,
  });
  return authJson(generated, 200, [saved]);
}
async function verifyRegistration(
  request: Request,
  env: Env,
  origin: string,
  kind: "register" | "backup",
): Promise<Response> {
  requireBrowserMutation(request, origin);
  const input = await body(request),
    saved = await challenge(request, env.DB, kind);
  const auth = kind === "backup" ? await session(request, env) : null;
  if (
    auth &&
    (auth.principal.publisherId !== saved.publisher_id ||
      auth.principal.keyId !== saved.session_key_id)
  )
    throw unauthorized();
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: registrationResponse(input.response),
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: new URL(origin).hostname,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
  } catch {
    throw new HttpError(400, "passkey_invalid", "The passkey could not be verified. Start again.");
  }
  if (!verified.verified || !saved.publisher_id) throw unauthorized();
  const publisherId = saved.publisher_id,
    credential = verified.registrationInfo.credential;
  const created = kind === "register" ? newSession(publisherId) : null;
  const nonce = randomId();
  const conditions =
    kind === "register"
      ? `(SELECT COUNT(*) FROM publishers)<? AND NOT EXISTS(SELECT 1 FROM publishers WHERE id=?)`
      : `${validSessionSql} AND (SELECT COUNT(*) FROM passkeys WHERE publisher_id=?)<?`;
  const values =
    kind === "register"
      ? [PUBLIC_LIMITS.accounts, publisherId]
      : [saved.session_key_id!, publisherId, publisherId, PUBLIC_LIMITS.passkeys];
  try {
    await batch(env.DB, [
      guard(env.DB, nonce, `${challengeSql} AND ${conditions}`, saved.id, kind, ...values),
      ...(kind === "register"
        ? [
            q(
              env.DB,
              `INSERT INTO publishers(id,label,quota_bytes,created_at) VALUES (?,?,?,?)`,
              publisherId,
              saved.label,
              PUBLIC_LIMITS.quotaBytes,
              Date.now(),
            ),
          ]
        : []),
      q(
        env.DB,
        `INSERT INTO passkeys(id,publisher_id,public_key,counter,label,created_at) VALUES (?,?,?,?,?,?)`,
        credential.id,
        publisherId,
        base64url(credential.publicKey),
        credential.counter,
        kind === "register" ? "First passkey" : saved.label,
        Date.now(),
      ),
      ...(created ? await sessionWrites(env.DB, created) : []),
      q(env.DB, `DELETE FROM auth_challenges WHERE id=?`, saved.id),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw conflict();
  }
  return authJson(
    { ok: true },
    200,
    created ? sessionCookies(created) : [cookie(CHALLENGE_COOKIE, "", 0)],
  );
}
async function verifyLogin(request: Request, env: Env, origin: string): Promise<Response> {
  requireBrowserMutation(request, origin);
  const input = await body(request),
    saved = await challenge(request, env.DB, "login"),
    response = authenticationResponse(input.response);
  const credential = await q(
    env.DB,
    `SELECT * FROM passkeys WHERE id=?`,
    response.id,
  ).first<StoredPasskey>();
  if (!credential || response.response.userHandle !== base64url(utf8(credential.publisher_id)))
    throw unauthorized();
  let verified;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin,
      expectedRPID: new URL(origin).hostname,
      credential: {
        id: credential.id,
        publicKey: decodeBase64url(credential.public_key),
        counter: credential.counter,
      },
      requireUserVerification: true,
    });
  } catch {
    throw new HttpError(400, "passkey_invalid", "The passkey could not be verified. Start again.");
  }
  if (!verified.verified) throw unauthorized();
  const created = newSession(credential.publisher_id),
    nonce = randomId();
  try {
    await batch(env.DB, [
      guard(
        env.DB,
        nonce,
        `${challengeSql} AND EXISTS(SELECT 1 FROM passkeys c JOIN publishers p ON p.id=c.publisher_id WHERE c.id=? AND c.publisher_id=? AND c.counter=? AND p.active=1) AND ${sessionCountSql}<=?`,
        saved.id,
        "login",
        credential.id,
        credential.publisher_id,
        credential.counter,
        credential.publisher_id,
        PUBLIC_LIMITS.sessions,
      ),
      q(
        env.DB,
        `DELETE FROM api_keys WHERE id IN(SELECT k.id FROM api_keys k JOIN browser_sessions s ON s.key_id=k.id WHERE s.publisher_id=? AND k.revoked=0 AND k.expires_at>unixepoch('subsec')*1000 AND ${sessionCountSql}>=? ORDER BY s.created_at,k.id LIMIT 1)`,
        credential.publisher_id,
        credential.publisher_id,
        PUBLIC_LIMITS.sessions,
      ),
      q(
        env.DB,
        `UPDATE passkeys SET counter=? WHERE id=?`,
        verified.authenticationInfo.newCounter,
        credential.id,
      ),
      ...(await sessionWrites(env.DB, created)),
      q(env.DB, `DELETE FROM auth_challenges WHERE id=?`, saved.id),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw conflict();
  }
  return authJson({ ok: true }, 200, sessionCookies(created));
}

type Grant = {
  id: string;
  key_id: string;
  token_hash: string;
  poll_hash: string;
  label: string;
  state: "pending" | "approved" | "denied";
  publisher_id: string | null;
  expires_at: number;
};
function grantState(grant: Grant) {
  return grant.expires_at <= Date.now() ? "expired" : grant.state;
}
function fingerprint(grant: Grant): string {
  return grant.token_hash.slice(0, 12).match(/.{3}/g)!.join(" ");
}
async function readGrant(db: D1Database, requestId: string): Promise<Grant> {
  const entry = await q(db, `SELECT * FROM agent_grants WHERE id=?`, requestId).first<Grant>();
  if (!entry) throw notFound();
  return entry;
}
async function startGrant(request: Request, env: Env, origin: string): Promise<Response> {
  const input = await body(request),
    requestId = id(input.requestId),
    keyId = id(input.keyId),
    tokenHash = hash(input.tokenHash),
    pollHash = hash(input.pollHash),
    name = label(input.label);
  await rate(request, env.DB);
  const nonce = randomId();
  try {
    await batch(env.DB, [
      guard(
        env.DB,
        nonce,
        `(SELECT COUNT(*) FROM agent_grants)<? OR EXISTS(SELECT 1 FROM agent_grants WHERE id=?)`,
        PUBLIC_LIMITS.grants,
        requestId,
      ),
      q(
        env.DB,
        `INSERT INTO agent_grants(id,key_id,token_hash,poll_hash,label,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
        requestId,
        keyId,
        tokenHash,
        pollHash,
        name,
        Date.now() + CEREMONY_MS,
      ),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw capacity();
  }
  const grant = await readGrant(env.DB, requestId);
  if (
    grant.key_id !== keyId ||
    grant.token_hash !== tokenHash ||
    grant.poll_hash !== pollHash ||
    grant.label !== name
  )
    throw conflict();
  return authJson({
    requestId,
    verificationUrl: `${origin}/agent/approve?request=${requestId}`,
    expiresAt: grant.expires_at,
    fingerprint: fingerprint(grant),
  });
}
async function decideGrant(
  request: Request,
  env: Env,
  origin: string,
  requestId: string,
): Promise<Response> {
  requireBrowserMutation(request, origin);
  const auth = await session(request, env),
    input = await body(request);
  if (input.decision !== "approve" && input.decision !== "deny") throw invalid();
  const grant = await readGrant(env.DB, requestId),
    owner = auth.principal.publisherId,
    approved = input.decision === "approve";
  if (grantState(grant) === "expired") throw conflict();
  if (grant.state !== "pending") {
    if (grant.publisher_id !== owner || grant.state !== (approved ? "approved" : "denied"))
      throw conflict();
    if (approved) {
      const key = await q(
        env.DB,
        `SELECT revoked FROM api_keys WHERE id=? AND publisher_id=?`,
        grant.key_id,
        owner,
      ).first<{ revoked: number }>();
      if (!key || key.revoked) throw conflict();
    }
    return authJson({ state: grant.state });
  }
  const nonce = randomId();
  try {
    await batch(env.DB, [
      guard(
        env.DB,
        nonce,
        `${validSessionSql} AND EXISTS(SELECT 1 FROM agent_grants WHERE id=? AND state='pending' AND expires_at>unixepoch('subsec')*1000) AND (?=0 OR (NOT EXISTS(SELECT 1 FROM api_keys WHERE id=?) AND NOT EXISTS(SELECT 1 FROM key_revocations WHERE id=?) AND (SELECT COUNT(*) FROM agent_keys WHERE publisher_id=?)<? AND (SELECT COUNT(*) FROM agent_keys a JOIN api_keys k ON k.id=a.key_id WHERE a.publisher_id=? AND k.revoked=0)<?))`,
        auth.principal.keyId,
        owner,
        requestId,
        approved ? 1 : 0,
        grant.key_id,
        grant.key_id,
        owner,
        PUBLIC_LIMITS.lifetimeAgents,
        owner,
        PUBLIC_LIMITS.activeAgents,
      ),
      ...(approved
        ? [
            q(
              env.DB,
              `INSERT INTO api_keys(id,publisher_id,token_hash,created_at) VALUES (?,?,?,?)`,
              grant.key_id,
              owner,
              grant.token_hash,
              Date.now(),
            ),
            q(
              env.DB,
              `INSERT INTO agent_keys(key_id,publisher_id,label) VALUES (?,?,?)`,
              grant.key_id,
              owner,
              grant.label,
            ),
          ]
        : []),
      q(
        env.DB,
        `UPDATE agent_grants SET state=?,publisher_id=? WHERE id=?`,
        approved ? "approved" : "denied",
        owner,
        requestId,
      ),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    // An approval response may be lost or a concurrent repeat may have won.
    const current = await readGrant(env.DB, requestId);
    if (current.state === (approved ? "approved" : "denied") && current.publisher_id === owner) {
      const key = approved
        ? await q(env.DB, `SELECT revoked FROM api_keys WHERE id=?`, current.key_id).first<{
            revoked: number;
          }>()
        : null;
      if (!approved || key?.revoked === 0) return authJson({ state: current.state });
    }
    throw conflict();
  }
  return authJson({ state: approved ? "approved" : "denied" });
}
async function pollGrant(request: Request, env: Env, requestId: string): Promise<Response> {
  const input = await body(request);
  if (typeof input.pollSecret !== "string" || !validSecret(input.pollSecret)) throw unauthorized();
  const grant = await readGrant(env.DB, requestId);
  if (!equalHash(await sha256(POLL_DOMAIN + input.pollSecret), grant.poll_hash))
    throw unauthorized();
  return authJson({
    state: grantState(grant),
    expiresAt: grant.expires_at,
    ...(grantState(grant) === "approved"
      ? { publisherId: grant.publisher_id, keyId: grant.key_id }
      : {}),
  });
}

async function account(request: Request, env: Env): Promise<Response> {
  const { principal } = await session(request, env);
  const { publisherId, label: name, quotaBytes, usedBytes } = principal;
  const passkeys = (
    await q(
      env.DB,
      `SELECT id,label,created_at AS createdAt FROM passkeys WHERE publisher_id=? ORDER BY created_at,id`,
      publisherId,
    ).all()
  ).results;
  const agents = (
    await q(
      env.DB,
      `SELECT a.key_id AS keyId,a.label,k.created_at AS createdAt FROM agent_keys a JOIN api_keys k ON k.id=a.key_id WHERE a.publisher_id=? AND k.revoked=0 ORDER BY k.created_at,a.key_id`,
      publisherId,
    ).all()
  ).results;
  return authJson({
    publisherId,
    label: name,
    quotaBytes,
    usedBytes,
    maxBytes: MAX_HTML_BYTES,
    passkeys,
    agents,
  });
}
async function logout(request: Request, env: Env, origin: string): Promise<Response> {
  requireBrowserMutation(request, origin);
  const { principal } = await session(request, env);
  await batch(env.DB, [
    q(
      env.DB,
      `UPDATE api_keys SET revoked=1 WHERE id=? AND publisher_id=? AND EXISTS(SELECT 1 FROM browser_sessions WHERE key_id=?)`,
      principal.keyId,
      principal.publisherId,
      principal.keyId,
    ),
  ]);
  return authJson({ ok: true }, 200, [cookie(SESSION_COOKIE, "", 0)]);
}
async function removePasskey(
  request: Request,
  env: Env,
  origin: string,
  passkeyId: string,
): Promise<Response> {
  requireBrowserMutation(request, origin);
  const { principal } = await session(request, env),
    nonce = randomId();
  try {
    await batch(env.DB, [
      guard(
        env.DB,
        nonce,
        `${validSessionSql} AND EXISTS(SELECT 1 FROM passkeys WHERE id=? AND publisher_id=?) AND (SELECT COUNT(*) FROM passkeys WHERE publisher_id=?)>1`,
        principal.keyId,
        principal.publisherId,
        passkeyId,
        principal.publisherId,
        principal.publisherId,
      ),
      q(
        env.DB,
        `DELETE FROM passkeys WHERE id=? AND publisher_id=?`,
        passkeyId,
        principal.publisherId,
      ),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw new HttpError(409, "last_passkey", "Keep at least one passkey on your account.");
  }
  return authJson({ ok: true });
}
async function removeAgent(
  request: Request,
  env: Env,
  origin: string,
  keyId: string,
): Promise<Response> {
  requireBrowserMutation(request, origin);
  const { principal } = await session(request, env),
    nonce = randomId();
  try {
    await batch(env.DB, [
      guard(
        env.DB,
        nonce,
        `${validSessionSql} AND EXISTS(SELECT 1 FROM agent_keys WHERE key_id=? AND publisher_id=?)`,
        principal.keyId,
        principal.publisherId,
        keyId,
        principal.publisherId,
      ),
      q(
        env.DB,
        `INSERT INTO key_revocations(id,publisher_id,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING`,
        keyId,
        principal.publisherId,
        Date.now(),
      ),
      q(
        env.DB,
        `UPDATE api_keys SET revoked=1 WHERE id=? AND publisher_id=?`,
        keyId,
        principal.publisherId,
      ),
      q(env.DB, `DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
  } catch {
    throw notFound();
  }
  return authJson({ ok: true });
}
export async function publicAuth(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const methods = (method: string, action: () => Promise<Response>) =>
    request.method === method
      ? action()
      : Promise.reject(new HttpError(405, "method_not_allowed", "This method is not supported."));
  if (path === "/api/public-config")
    return methods("GET", async () => authJson({ auth: "passkey", limits: PUBLIC_LIMITS }));
  if (path === "/api/account") return methods("GET", () => account(request, env));
  if (path === "/api/logout") return methods("POST", () => logout(request, env, origin));
  const option = /^\/auth\/(register|login|passkeys)\/options$/.exec(path);
  if (option)
    return methods("POST", () =>
      options(
        request,
        env,
        origin,
        option[1] === "passkeys" ? "backup" : (option[1] as "register" | "login"),
      ),
    );
  const verify = /^\/auth\/(register|login|passkeys)\/verify$/.exec(path);
  if (verify)
    return methods("POST", () =>
      verify[1] === "login"
        ? verifyLogin(request, env, origin)
        : verifyRegistration(
            request,
            env,
            origin,
            verify[1] === "passkeys" ? "backup" : "register",
          ),
    );
  if (path === "/api/agent-grants") return methods("POST", () => startGrant(request, env, origin));
  const grant = /^\/api\/agent-grants\/([0-9a-f]{32})(?:\/(decision|poll))?$/.exec(path);
  if (grant) {
    if (grant[2] === "decision")
      return methods("POST", () => decideGrant(request, env, origin, grant[1]!));
    if (grant[2] === "poll") return methods("POST", () => pollGrant(request, env, grant[1]!));
    return methods("GET", async () => {
      const entry = await readGrant(env.DB, grant[1]!);
      return authJson({
        state: grantState(entry),
        label: entry.label,
        fingerprint: fingerprint(entry),
        expiresAt: entry.expires_at,
      });
    });
  }
  const passkey = /^\/api\/passkeys\/([A-Za-z0-9_-]{1,1400})$/.exec(path);
  if (passkey)
    return methods("DELETE", () => removePasskey(request, env, origin, credentialId(passkey[1])));
  const agent = /^\/api\/agents\/([0-9a-f]{32})$/.exec(path);
  if (agent) return methods("DELETE", () => removeAgent(request, env, origin, agent[1]!));
  return null;
}
