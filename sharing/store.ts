import {
  DEFAULT_QUOTA_BYTES,
  MAX_HTML_BYTES,
  MAX_VERSIONS_PER_PUBLISHER,
  PUBLISHER_HASH_DOMAIN,
  ID_PATTERN,
  HttpError,
  base64url,
  decodeBase64url,
  decodeUtf8,
  equalHash,
  makeReceipt,
  notFound,
  randomId,
  sha256,
  unauthorized,
  unavailable,
  utf8,
  validSecret,
  type D1Database,
  type Principal,
  type Receipt,
  type Upload,
} from "./protocol";

type AuthRow = {
  publisherId: string;
  keyId: string;
  tokenHash: string;
  label: string;
  quotaBytes: number;
  usedBytes: number;
  versionCount: number;
  active: number;
  revoked: number;
  expiresAt: number | null;
};
const AUTH_SQL = `SELECT p.id AS publisherId,k.id AS keyId,k.token_hash AS tokenHash,
  p.label,p.quota_bytes AS quotaBytes,p.used_bytes AS usedBytes,p.version_count AS versionCount,p.active,k.revoked,k.expires_at AS expiresAt
  FROM api_keys k JOIN publishers p ON p.id=k.publisher_id WHERE k.id=?`;

async function verifiedPrincipal(
  db: D1Database,
  keyId: string,
  tokenHash: string,
): Promise<Principal & { versionCount: number }> {
  const row = await db.prepare(AUTH_SQL).bind(keyId).first<AuthRow>();
  // Still perform a fixed-size comparison for unknown keys.
  const matches = equalHash(tokenHash, row?.tokenHash ?? "0".repeat(64));
  if (
    !row ||
    !matches ||
    !row.active ||
    row.revoked ||
    (row.expiresAt !== null && row.expiresAt <= Date.now())
  )
    throw unauthorized();
  return {
    publisherId: row.publisherId,
    keyId: row.keyId,
    tokenHash: row.tokenHash,
    label: row.label,
    quotaBytes: row.quotaBytes,
    usedBytes: row.usedBytes,
    versionCount: row.versionCount,
  };
}

export async function authenticatePublisher(
  db: D1Database,
  authorization: string | null,
): Promise<Principal> {
  const match = /^Bearer (nf_pub_([0-9a-f]{32})\.([A-Za-z0-9_-]{43}))$/.exec(authorization ?? "");
  if (!match || !validSecret(match[3]!)) throw unauthorized();
  return verifiedPrincipal(db, match[2]!, await sha256(PUBLISHER_HASH_DOMAIN + match[1]!));
}

type Operation = { fingerprint: string; receipt_json: string };
async function replay(
  db: D1Database,
  publisherId: string,
  key: string,
  fingerprint: string,
): Promise<Receipt | null> {
  const operation = await db
    .prepare(
      `SELECT fingerprint,receipt_json FROM operations WHERE publisher_id=? AND operation_key=?`,
    )
    .bind(publisherId, key)
    .first<Operation>();
  if (!operation) return null;
  if (!equalHash(operation.fingerprint, fingerprint))
    throw new HttpError(
      409,
      "idempotency_conflict",
      "This operation key was already used for a different request.",
    );
  return JSON.parse(operation.receipt_json) as Receipt;
}

type DraftState = { publisher_id: string; head_version: number };
async function draftState(db: D1Database, id: string): Promise<DraftState | null> {
  return db
    .prepare(`SELECT publisher_id,head_version FROM drafts WHERE id=?`)
    .bind(id)
    .first<DraftState>();
}
function checkPrecondition(
  draft: DraftState | null,
  principal: Principal,
  expected: number | null,
): void {
  if (draft && draft.publisher_id !== principal.publisherId) throw notFound();
  if (draft && expected === null)
    throw new HttpError(428, "precondition_required", "Updating a draft requires If-Match.");
  if (
    (draft && draft.head_version !== expected) ||
    (!draft && expected !== null && expected !== 0)
  ) {
    throw new HttpError(412, "precondition_failed", "The draft version does not match If-Match.");
  }
}

export async function publish(
  db: D1Database,
  principal: Principal,
  upload: Upload,
  origin: string,
): Promise<{ receipt: Receipt; replayed: boolean }> {
  const fingerprint = await sha256(
    JSON.stringify([
      "note-framework/put-draft/v1",
      "PUT",
      upload.id,
      upload.expected,
      upload.title,
      upload.bytes,
      upload.sha256,
    ]),
  );
  // A key may have been revoked while the request body was being read. Replays
  // also require a currently valid key, before looking at the stored operation.
  await verifiedPrincipal(db, principal.keyId, principal.tokenHash);
  const previous = await replay(db, principal.publisherId, upload.operationKey, fingerprint);
  if (previous) return { receipt: previous, replayed: true };

  const receipt = makeReceipt(origin, upload);
  const nonce = randomId();
  const now = Date.now();
  const q = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).bind(...values);
  const statements = [
    q(
      `INSERT INTO transaction_guards(nonce,ok) VALUES (?,CASE WHEN
      EXISTS (SELECT 1 FROM api_keys k JOIN publishers p ON p.id=k.publisher_id
        WHERE k.id=? AND k.publisher_id=? AND k.token_hash=? AND k.revoked=0 AND p.active=1
          AND (k.expires_at IS NULL OR k.expires_at>unixepoch('subsec')*1000)
          AND p.used_bytes<=p.quota_bytes-? AND p.version_count<?)
      AND ((COALESCE(?,0)=0 AND NOT EXISTS (SELECT 1 FROM drafts WHERE id=?))
        OR EXISTS (SELECT 1 FROM drafts WHERE id=? AND publisher_id=? AND head_version=?))
      THEN 1 ELSE 0 END)`,
      nonce,
      principal.keyId,
      principal.publisherId,
      principal.tokenHash,
      upload.bytes,
      MAX_VERSIONS_PER_PUBLISHER,
      upload.expected,
      upload.id,
      upload.id,
      principal.publisherId,
      upload.expected,
    ),
    q(
      `INSERT INTO drafts(id,publisher_id,head_version,created_at,updated_at)
      VALUES (?,?,0,?,?) ON CONFLICT(id) DO NOTHING`,
      upload.id,
      principal.publisherId,
      now,
      now,
    ),
    q(
      `INSERT INTO versions(draft_id,version,title,sha256,bytes,chunk_count,created_at) VALUES (?,?,?,?,?,?,?)`,
      upload.id,
      receipt.version,
      upload.title,
      upload.sha256,
      upload.bytes,
      upload.chunks.length,
      now,
    ),
    ...upload.chunks.map((chunk, ordinal) =>
      q(
        `INSERT INTO body_chunks(draft_id,version,ordinal,body,utf16_units,byte_count) VALUES (?,?,?,?,?,?)`,
        upload.id,
        receipt.version,
        ordinal,
        chunk,
        chunk.length,
        utf8(chunk).length,
      ),
    ),
    q(
      `UPDATE drafts SET head_version=?,updated_at=MAX(updated_at,?) WHERE id=? AND publisher_id=?`,
      receipt.version,
      now,
      upload.id,
      principal.publisherId,
    ),
    q(
      `UPDATE publishers SET used_bytes=used_bytes+?,version_count=version_count+1 WHERE id=?`,
      upload.bytes,
      principal.publisherId,
    ),
    q(
      `INSERT INTO operations(publisher_id,operation_key,fingerprint,draft_id,version,receipt_json,created_at) VALUES (?,?,?,?,?,?,?)`,
      principal.publisherId,
      upload.operationKey,
      fingerprint,
      upload.id,
      receipt.version,
      JSON.stringify(receipt),
      now,
    ),
    q(`DELETE FROM transaction_guards WHERE nonce=?`, nonce),
  ];
  try {
    const result = await db.batch(statements);
    if (result.some((item) => !item.success)) throw unavailable();
    return { receipt, replayed: false };
  } catch {
    // Do not infer the cause from provider error strings. A concurrent identical
    // request may have committed, or auth/head/quota may have changed. Anything
    // not explained by current authoritative state remains a storage failure.
    const current = await verifiedPrincipal(db, principal.keyId, principal.tokenHash);
    const committed = await replay(db, principal.publisherId, upload.operationKey, fingerprint);
    if (committed) return { receipt: committed, replayed: true };
    checkPrecondition(await draftState(db, upload.id), current, upload.expected);
    if (
      current.usedBytes > current.quotaBytes - upload.bytes ||
      current.versionCount >= MAX_VERSIONS_PER_PUBLISHER
    ) {
      throw new HttpError(403, "quota_exceeded", "The publisher storage quota would be exceeded.");
    }
    const platform = await db
      .prepare(
        `SELECT enabled,max_bytes AS maxBytes,max_versions AS maxVersions,used_bytes AS usedBytes,version_count AS versionCount FROM public_settings WHERE id=1`,
      )
      .first<{
        enabled: number;
        maxBytes: number;
        maxVersions: number;
        usedBytes: number;
        versionCount: number;
      }>();
    if (
      platform?.enabled &&
      (platform.usedBytes > platform.maxBytes - upload.bytes ||
        platform.versionCount >= platform.maxVersions)
    )
      throw new HttpError(
        429,
        "capacity_reached",
        "The public beta storage allowance is full. Existing notes remain available.",
      );
    throw unavailable();
  }
}

export interface VersionRow {
  id: string;
  publisherId: string;
  version: number;
  headVersion: number;
  title: string;
  sha256: string;
  bytes: number;
  chunkCount: number;
  updatedAt: number;
}
const VERSION_SQL = `SELECT d.id,d.publisher_id AS publisherId,v.version,d.head_version AS headVersion,
  v.title,v.sha256,v.bytes,v.chunk_count AS chunkCount,v.created_at AS updatedAt
  FROM drafts d JOIN versions v ON v.draft_id=d.id`;

export async function getPublicVersion(
  db: D1Database,
  id: string,
  version: number | null,
): Promise<VersionRow> {
  const row = await db
    .prepare(`${VERSION_SQL} WHERE d.id=? AND v.version=COALESCE(?,d.head_version)`)
    .bind(id, version)
    .first<VersionRow>();
  if (!row) throw notFound();
  return row;
}

export async function getOwnDraft(
  db: D1Database,
  publisherId: string,
  id: string,
): Promise<Receipt & { title: string; updatedAt: number }> {
  const row = await db
    .prepare(`SELECT v.title,v.created_at AS updatedAt,o.receipt_json
    FROM drafts d JOIN versions v ON v.draft_id=d.id AND v.version=d.head_version
    JOIN operations o ON o.draft_id=v.draft_id AND o.version=v.version AND o.publisher_id=d.publisher_id
    WHERE d.id=? AND d.publisher_id=?`)
    .bind(id, publisherId)
    .first<{ title: string; updatedAt: number; receipt_json: string }>();
  if (!row) throw notFound();
  return {
    ...(JSON.parse(row.receipt_json) as Receipt),
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

export async function listDrafts(
  db: D1Database,
  publisherId: string,
  cursor: string | null,
  limit: number,
  origin: string,
) {
  let before: { time: number; id: string } | null = null;
  if (cursor !== null) {
    try {
      if (cursor.length > 512) throw new Error();
      const tuple: unknown = JSON.parse(decodeUtf8(decodeBase64url(cursor)));
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 3 ||
        tuple[0] !== publisherId ||
        !Number.isSafeInteger(tuple[1]) ||
        tuple[1] < 0 ||
        typeof tuple[2] !== "string" ||
        !ID_PATTERN.test(tuple[2])
      )
        throw new Error();
      before = { time: tuple[1], id: tuple[2] };
    } catch {
      throw new HttpError(400, "invalid_cursor", "The listing cursor is invalid.");
    }
  }
  const rows = await db
    .prepare(`SELECT d.id,v.title,d.head_version AS version,d.updated_at AS updatedAt
    FROM drafts d JOIN versions v ON v.draft_id=d.id AND v.version=d.head_version
    WHERE d.publisher_id=? AND (? IS NULL OR d.updated_at<? OR (d.updated_at=? AND d.id<?))
    ORDER BY d.updated_at DESC,d.id DESC LIMIT ?`)
    .bind(
      publisherId,
      before?.time ?? null,
      before?.time ?? null,
      before?.time ?? null,
      before?.id ?? null,
      limit + 1,
    )
    .all<{ id: string; title: string; version: number; updatedAt: number }>();
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      ...row,
      etag: `"${row.version}"`,
      url: `${origin}/d/${row.id}`,
      versionUrl: `${origin}/d/${row.id}/v/${row.version}`,
    })),
    nextCursor:
      rows.results.length > limit && last
        ? base64url(utf8(JSON.stringify([publisherId, last.updatedAt, last.id])))
        : null,
  };
}

export async function readOriginal(
  db: D1Database,
  version: VersionRow,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    version.bytes < 1 ||
    version.bytes > MAX_HTML_BYTES ||
    version.chunkCount < 1 ||
    version.chunkCount > 21
  )
    throw unavailable();
  const body = new Uint8Array(version.bytes);
  let offset = 0;
  // Read bounded individual rows rather than one giant D1 JSON result, notably
  // when NULs expand to six characters each in binding serialization.
  for (let ordinal = 0; ordinal < version.chunkCount; ordinal++) {
    const row = await db
      .prepare(
        `SELECT body,utf16_units AS units,byte_count AS bytes FROM body_chunks WHERE draft_id=? AND version=? AND ordinal=?`,
      )
      .bind(version.id, version.version, ordinal)
      .first<{ body: string; units: number; bytes: number }>();
    if (!row || row.body.length !== row.units || row.units > 262_144) throw unavailable();
    const chunk = utf8(row.body);
    if (chunk.length !== row.bytes || offset + chunk.length > body.length) throw unavailable();
    body.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== body.length || !equalHash(await sha256(body), version.sha256)) throw unavailable();
  return body;
}

export interface Registration {
  label: string;
  tokenHash: string;
  quotaBytes?: number;
}
type RegisteredKey = {
  publisherId: string;
  tokenHash: string;
  revoked: number;
  label: string;
  quotaBytes: number;
};
async function registeredKey(db: D1Database, keyId: string) {
  return db
    .prepare(`SELECT k.publisher_id AS publisherId,k.token_hash AS tokenHash,k.revoked,p.label,p.quota_bytes AS quotaBytes
    FROM api_keys k JOIN publishers p ON p.id=k.publisher_id WHERE k.id=?`)
    .bind(keyId)
    .first<RegisteredKey>();
}
async function revocation(db: D1Database, keyId: string) {
  return db
    .prepare(`SELECT publisher_id AS publisherId FROM key_revocations WHERE id=?`)
    .bind(keyId)
    .first<{ publisherId: string }>();
}
function registrationConflict(): HttpError {
  return new HttpError(
    409,
    "registration_conflict",
    "The key or publisher is already registered with different settings.",
  );
}

export async function registerKey(
  db: D1Database,
  publisherId: string,
  keyId: string,
  registration: Registration,
) {
  const { label, tokenHash, quotaBytes } = registration;
  const nonce = randomId();
  const q = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).bind(...values);
  try {
    const result = await db.batch([
      q(
        `INSERT INTO transaction_guards(nonce,ok) VALUES (?,CASE WHEN
        (NOT EXISTS (SELECT 1 FROM publishers WHERE id=?) OR EXISTS
          (SELECT 1 FROM publishers WHERE id=? AND label=? AND (? IS NULL OR quota_bytes=?)))
        AND (NOT EXISTS (SELECT 1 FROM api_keys WHERE id=?) OR EXISTS
          (SELECT 1 FROM api_keys WHERE id=? AND publisher_id=? AND token_hash=?))
        AND NOT EXISTS (SELECT 1 FROM key_revocations WHERE id=? AND
          (publisher_id<>? OR NOT EXISTS (SELECT 1 FROM api_keys WHERE id=? AND publisher_id=? AND revoked=1)))
        THEN 1 ELSE 0 END)`,
        nonce,
        publisherId,
        publisherId,
        label,
        quotaBytes ?? null,
        quotaBytes ?? null,
        keyId,
        keyId,
        publisherId,
        tokenHash,
        keyId,
        publisherId,
        keyId,
        publisherId,
      ),
      q(
        `INSERT INTO publishers(id,label,quota_bytes,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING`,
        publisherId,
        label,
        quotaBytes ?? DEFAULT_QUOTA_BYTES,
        Date.now(),
      ),
      // Matching retries preserve registered revoked keys; unknown tombstones fail the guard.
      q(
        `INSERT INTO api_keys(id,publisher_id,token_hash,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING`,
        keyId,
        publisherId,
        tokenHash,
        Date.now(),
      ),
      q(`DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
    if (result.some((item) => !item.success)) throw unavailable();
  } catch {
    const key = await registeredKey(db, keyId);
    const tombstone = await revocation(db, keyId);
    const publisher = await db
      .prepare(`SELECT label,quota_bytes AS quotaBytes FROM publishers WHERE id=?`)
      .bind(publisherId)
      .first<{ label: string; quotaBytes: number }>();
    const duplicateHash = await db
      .prepare(`SELECT id FROM api_keys WHERE token_hash=?`)
      .bind(tokenHash)
      .first<{ id: string }>();
    if (
      (key && (key.publisherId !== publisherId || !equalHash(key.tokenHash, tokenHash))) ||
      (publisher &&
        (publisher.label !== label ||
          (quotaBytes !== undefined && publisher.quotaBytes !== quotaBytes))) ||
      (duplicateHash && duplicateHash.id !== keyId) ||
      (tombstone && (tombstone.publisherId !== publisherId || !key || !key.revoked))
    )
      throw registrationConflict();
    throw unavailable();
  }
  const key = await registeredKey(db, keyId);
  if (!key) throw unavailable();
  return {
    publisherId,
    keyId,
    label: key.label,
    quotaBytes: key.quotaBytes,
    revoked: !!key.revoked,
  };
}

export async function revokeKey(db: D1Database, publisherId: string, keyId: string): Promise<void> {
  const nonce = randomId();
  const q = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).bind(...values);
  try {
    const result = await db.batch([
      // Ownership must be checked in the same transaction as the tombstone:
      // registration or another revocation can win after any application read.
      q(
        `INSERT INTO transaction_guards(nonce,ok) VALUES (?,CASE WHEN
        NOT EXISTS (SELECT 1 FROM api_keys WHERE id=? AND publisher_id<>?)
        AND NOT EXISTS (SELECT 1 FROM key_revocations WHERE id=? AND publisher_id<>?)
        THEN 1 ELSE 0 END)`,
        nonce,
        keyId,
        publisherId,
        keyId,
        publisherId,
      ),
      q(
        `INSERT INTO key_revocations(id,publisher_id,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING`,
        keyId,
        publisherId,
        Date.now(),
      ),
      q(`UPDATE api_keys SET revoked=1 WHERE id=? AND publisher_id=?`, keyId, publisherId),
      q(`DELETE FROM transaction_guards WHERE nonce=?`, nonce),
    ]);
    if (result.some((item) => !item.success)) throw unavailable();
  } catch {
    const key = await registeredKey(db, keyId);
    const tombstone = await revocation(db, keyId);
    if (
      (key && key.publisherId !== publisherId) ||
      (tombstone && tombstone.publisherId !== publisherId)
    )
      throw notFound();
    throw unavailable();
  }
}
