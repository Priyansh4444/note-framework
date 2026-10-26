import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { chromium } from "playwright";
import worker from "./worker";
import {
  DEFAULT_QUOTA_BYTES,
  MAX_CHUNK_UNITS,
  MAX_HTML_BYTES,
  OWNER_HASH_DOMAIN,
  PUBLISHER_HASH_DOMAIN,
  base64url,
  randomId,
  sha256,
  splitChunks,
  utf8,
  type D1Database,
  type D1Statement,
  type Env,
  type Receipt,
} from "./protocol";

// Exercise all migrations and actual SQL using SQLite transactions, rather than
// simulating successful writes in a mock. The parent additionally tests D1's
// transport/runtime with Wrangler; this adapter does not establish those limits.
class SQLiteStatement implements D1Statement {
  constructor(
    readonly owner: SQLiteD1,
    readonly sql: string,
    readonly values: (string | number | null)[] = [],
  ) {}
  bind(...values: (string | number | null)[]): SQLiteStatement {
    return new SQLiteStatement(this.owner, this.sql, values);
  }
  native() {
    let parameter = 0;
    // Bun binds non-ASCII JS strings with sqlite3_bind_text16, whose BOM
    // conversion removes U+FEFF. D1 transports UTF-8 JSON strings. Explicitly
    // bind UTF-8 bytes and cast to TEXT here so this adapter preserves strings.
    // Application SQL uses only anonymous placeholders, never literal '?'.
    const sql = this.sql.replace(/\?/g, () =>
      typeof this.values[parameter++] === "string" ? "CAST(? AS TEXT)" : "?",
    );
    const values = this.values.map((value) => (typeof value === "string" ? utf8(value) : value));
    return { statement: this.owner.sqlite.query(sql), values };
  }
  async first<T>(): Promise<T | null> {
    this.owner.queries++;
    const { statement, values } = this.native();
    return statement.get(...values) as T | null;
  }
  async all<T>(): Promise<{ success: boolean; results: T[] }> {
    this.owner.queries++;
    const { statement, values } = this.native();
    return { success: true, results: statement.all(...values) as T[] };
  }
}
class SQLiteD1 implements D1Database {
  readonly sqlite = new Database(":memory:");
  queries = 0;
  maxBatch = 0;
  beforeBatch: ((statements: D1Statement[]) => void | Promise<void>) | null = null;
  loseNextBatchResponse = false;
  prepare(sql: string): SQLiteStatement {
    return new SQLiteStatement(this, sql);
  }
  async batch(statements: D1Statement[]): Promise<{ success: boolean }[]> {
    await this.beforeBatch?.(statements);
    this.maxBatch = Math.max(this.maxBatch, statements.length);
    const result = this.sqlite.transaction(() =>
      statements.map((statement) => {
        const query = statement as SQLiteStatement;
        this.queries++;
        const { statement: native, values } = query.native();
        native.run(...values);
        return { success: true };
      }),
    )();
    if (this.loseNextBatchResponse) {
      this.loseNextBatchResponse = false;
      throw new Error("Simulated transport loss after actual SQLite commit");
    }
    return result;
  }
  // Force both requests to prepare against the same committed head/usage. Only
  // the SQL transaction, not scheduling luck or a JS mutex, can decide winners.
  raceNextTwoBatches(first?: (batch: SQLiteStatement[]) => boolean): void {
    const waiting: { batch: SQLiteStatement[]; release: () => void }[] = [];
    this.beforeBatch = (statements) =>
      new Promise<void>((release) => {
        waiting.push({ batch: statements as SQLiteStatement[], release });
        if (waiting.length !== 2) return;
        this.beforeBatch = null;
        // Request invocation order does not establish transaction order: async
        // authentication can reorder arrivals. These tests explicitly choose it.
        if (first && !first(waiting[0].batch) && first(waiting[1].batch)) waiting.reverse();
        // The second Promise executor runs before batch() attaches its await
        // continuation. Release after both are attached so SQL entry follows the
        // chosen order, including when the second arrival must transact first.
        queueMicrotask(() => {
          for (const item of waiting) item.release();
        });
      });
  }
}

type Publisher = { id: string; keyId: string; token: string; tokenHash: string; label: string };
let db: SQLiteD1;
let env: Env;
let ownerToken: string;
let first: Publisher;
let second: Publisher;
let assetRequests: string[];
const origin = "https://notes.example";
const migrationDirectory = new URL("./migrations/", import.meta.url);
const migrations = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
async function migrate(sqlite: Database, names = migrations) {
  for (const name of names) sqlite.exec(await Bun.file(new URL(name, migrationDirectory)).text());
}
function revoke(publisher: Publisher) {
  return request(`/api/admin/publishers/${publisher.id}/keys/${publisher.keyId}`, {
    method: "DELETE",
    headers: ownerHeaders(),
  });
}
function versionCount(publisher = first): number {
  return (
    db.sqlite.query("SELECT version_count AS n FROM publishers WHERE id=?").get(publisher.id) as {
      n: number;
    }
  ).n;
}

function request(path: string, options: RequestInit = {}) {
  return worker.fetch(new Request(origin + path, options), env);
}
function ownerHeaders() {
  return { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
}
function publisherHeaders(publisher = first) {
  return { Authorization: `Bearer ${publisher.token}` };
}
function operationKey() {
  return crypto.randomUUID();
}
function put(
  id: string,
  body: BodyInit = "<h1>hello</h1>",
  options: {
    publisher?: Publisher;
    key?: string;
    expected?: number | null;
    title?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return request(`/api/drafts/${id}`, {
    method: "PUT",
    body,
    headers: {
      ...publisherHeaders(options.publisher),
      "Content-Type": "text/html; charset=utf-8",
      "Idempotency-Key": options.key ?? operationKey(),
      ...(options.expected === undefined || options.expected === null
        ? {}
        : { "If-Match": `"${options.expected}"` }),
      ...(options.title === undefined ? {} : { "X-Note-Title": base64url(utf8(options.title)) }),
      ...options.headers,
    },
  });
}
async function register(publisher: Publisher, quotaBytes?: number) {
  return request(`/api/admin/publishers/${publisher.id}/keys/${publisher.keyId}`, {
    method: "PUT",
    headers: ownerHeaders(),
    body: JSON.stringify({
      label: publisher.label,
      tokenHash: publisher.tokenHash,
      ...(quotaBytes === undefined ? {} : { quotaBytes }),
    }),
  });
}
async function newPublisher(label: string): Promise<Publisher> {
  const keyId = randomId();
  const token = `nf_pub_${keyId}.${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  return {
    id: randomId(),
    keyId,
    token,
    label,
    tokenHash: await sha256(PUBLISHER_HASH_DOMAIN + token),
  };
}
async function errorCode(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await response.json();
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
  expect(JSON.stringify(body).length).toBeLessThan(512);
}
function counts() {
  return Object.fromEntries(
    ["drafts", "versions", "body_chunks", "operations", "transaction_guards"].map((table) => [
      table,
      (db.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]),
  );
}
async function usedBytes(publisher = first) {
  return (await (await request("/api/me", { headers: publisherHeaders(publisher) })).json())
    .usedBytes as number;
}

beforeEach(async () => {
  db = new SQLiteD1();
  db.sqlite.exec("PRAGMA foreign_keys=ON");
  await migrate(db.sqlite);
  ownerToken = `nf_owner_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
  assetRequests = [];
  env = {
    DB: db,
    PUBLIC_ORIGIN: origin,
    OWNER_TOKEN_SHA256: await sha256(OWNER_HASH_DOMAIN + ownerToken),
    ASSETS: {
      async fetch(req) {
        assetRequests.push(new URL(req.url).pathname);
        return new Response("trusted assets", {
          headers: { "Content-Type": "text/html", "Set-Cookie": "unwanted=1" },
        });
      },
    },
  };
  first = await newPublisher("First publisher");
  second = await newPublisher("Second publisher");
  expect((await register(first)).status).toBe(200);
  expect((await register(second)).status).toBe(200);
  db.queries = 0;
  db.maxBatch = 0;
});
afterEach(() => {
  db.sqlite.close();
});

describe("publisher administration and authentication", () => {
  test("locally generated hashes register idempotently without returning token material", async () => {
    const registration = await register(first);
    const body = await registration.json();
    expect(body).toEqual({
      publisherId: first.id,
      keyId: first.keyId,
      label: first.label,
      quotaBytes: DEFAULT_QUOTA_BYTES,
      revoked: false,
    });
    expect(JSON.stringify(body)).not.toContain(first.token);
    expect(JSON.stringify(body)).not.toContain(first.tokenHash);
    expect(await (await request("/api/me", { headers: publisherHeaders() })).json()).toEqual({
      publisherId: first.id,
      keyId: first.keyId,
      label: first.label,
      maxBytes: MAX_HTML_BYTES,
      quotaBytes: DEFAULT_QUOTA_BYTES,
      usedBytes: 0,
    });
    const changed = { ...first, tokenHash: await sha256("different") };
    await errorCode(await register(changed), 409, "registration_conflict");
    await errorCode(
      await register({ ...first, id: second.id, label: second.label }),
      409,
      "registration_conflict",
    );
  });

  test("owner/publisher roles, malformed secrets and missing credentials stay separate", async () => {
    await errorCode(await request("/api/me"), 401, "unauthorized");
    await errorCode(
      await request("/api/me", { headers: { Authorization: `Bearer ${ownerToken}` } }),
      401,
      "unauthorized",
    );
    await errorCode(
      await request(`/api/admin/publishers/${first.id}/keys/${first.keyId}`, {
        method: "DELETE",
        headers: publisherHeaders(),
      }),
      401,
      "unauthorized",
    );
    const wrong = first.token.slice(0, -1) + (first.token.endsWith("A") ? "B" : "A");
    await errorCode(
      await request("/api/me", { headers: { Authorization: `Bearer ${wrong}` } }),
      401,
      "unauthorized",
    );
    await errorCode(
      await request("/api/me", {
        headers: { Authorization: `Bearer nf_pub_${randomId()}.${"A".repeat(43)}` },
      }),
      401,
      "unauthorized",
    );
  });

  test("permanent revocation survives registration replay and blocks receipt replay", async () => {
    const id = randomId(),
      key = operationKey();
    expect((await put(id, "one", { key })).status).toBe(201);
    await errorCode(
      await request(`/api/admin/publishers/${second.id}/keys/${first.keyId}`, {
        method: "DELETE",
        headers: ownerHeaders(),
      }),
      404,
      "not_found",
    );
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(`/api/admin/publishers/${first.id}/keys/${first.keyId}`, {
            method: "DELETE",
            headers: ownerHeaders(),
          })
        ).status,
      ).toBe(204);
    expect((await (await register(first)).json()).revoked).toBe(true);
    await errorCode(await put(id, "one", { key }), 401, "unauthorized");
    expect(counts().versions).toBe(1);
  });

  test("revoke before initial registration persists without a publisher and permanently blocks delayed activation", async () => {
    const pending = await newPublisher("Saved invitation");
    for (let i = 0; i < 2; i++) expect((await revoke(pending)).status).toBe(204);
    expect(db.sqlite.query("SELECT id FROM publishers WHERE id=?").get(pending.id)).toBeNull();
    expect(db.sqlite.query("SELECT id FROM api_keys WHERE id=?").get(pending.keyId)).toBeNull();
    await errorCode(await register(pending), 409, "registration_conflict");
    await errorCode(
      await request("/api/me", { headers: publisherHeaders(pending) }),
      401,
      "unauthorized",
    );
    expect(
      db.sqlite.query("SELECT publisher_id FROM key_revocations WHERE id=?").get(pending.keyId),
    ).toEqual({ publisher_id: pending.id });
    expect(db.sqlite.query("SELECT id FROM publishers WHERE id=?").get(pending.id)).toBeNull();
  });

  test("a tombstoned key ID cannot be revoked or registered by a competing publisher", async () => {
    const pending = await newPublisher("Saved invitation");
    const competing = { ...pending, id: second.id, label: second.label };
    expect((await revoke(pending)).status).toBe(204);
    await errorCode(await revoke(competing), 404, "not_found");
    await errorCode(await register(competing), 409, "registration_conflict");
    expect((await revoke(pending)).status).toBe(204);
    expect(
      db.sqlite.query("SELECT publisher_id FROM key_revocations WHERE id=?").get(pending.keyId),
    ).toEqual({ publisher_id: pending.id });
  });

  test("race harness chooses actual SQL commit order after either arrival order", async () => {
    db.sqlite.exec("CREATE TABLE race_probe(position INTEGER PRIMARY KEY, label TEXT)");
    for (const chosen of ["second arrival", "first arrival"]) {
      db.sqlite.exec("DELETE FROM race_probe");
      db.raceNextTwoBatches((batch) => batch[0]!.values[0] === chosen);
      await Promise.all(
        ["first arrival", "second arrival"].map((label) =>
          db.batch([db.prepare("INSERT INTO race_probe(label) VALUES (?)").bind(label)]),
        ),
      );
      const committed = db.sqlite.query("SELECT label FROM race_probe ORDER BY position").all();
      expect(committed).toEqual([
        { label: chosen },
        { label: chosen === "first arrival" ? "second arrival" : "first arrival" },
      ]);
    }
  });

  test("revoke and initial registration races are permanent in either transaction order", async () => {
    for (const revokeFirst of [true, false]) {
      const pending = await newPublisher("Racing invitation");
      db.raceNextTwoBatches(
        (batch) => batch.some((q) => q.sql.includes("INSERT INTO key_revocations")) === revokeFirst,
      );
      const [firstResult, secondResult] = await Promise.all(
        revokeFirst ? [revoke(pending), register(pending)] : [register(pending), revoke(pending)],
      );
      const revoked = revokeFirst ? firstResult : secondResult;
      const registered = revokeFirst ? secondResult : firstResult;
      expect(revoked.status).toBe(204);
      if (revokeFirst) await errorCode(registered, 409, "registration_conflict");
      else expect(registered.status).toBe(200);
      const retry = await register(pending);
      if (revokeFirst) await errorCode(retry, 409, "registration_conflict");
      else {
        expect(retry.status).toBe(200);
        expect((await retry.json()).revoked).toBe(true);
      }
      await errorCode(
        await request("/api/me", { headers: publisherHeaders(pending) }),
        401,
        "unauthorized",
      );
      expect(
        db.sqlite.query("SELECT publisher_id FROM key_revocations WHERE id=?").get(pending.keyId),
      ).toEqual({ publisher_id: pending.id });
    }
  });

  test("competing publisher revoke/register races bind a key ID to only the winning publisher", async () => {
    for (const revokeFirst of [true, false]) {
      const pending = await newPublisher("Racing invitation");
      const competing = { ...pending, id: second.id, label: second.label };
      db.raceNextTwoBatches(
        (batch) => batch.some((q) => q.sql.includes("INSERT INTO key_revocations")) === revokeFirst,
      );
      const [firstResult, secondResult] = await Promise.all(
        revokeFirst
          ? [revoke(pending), register(competing)]
          : [register(competing), revoke(pending)],
      );
      if (revokeFirst) {
        expect(firstResult.status).toBe(204);
        await errorCode(secondResult, 409, "registration_conflict");
        expect(db.sqlite.query("SELECT id FROM api_keys WHERE id=?").get(pending.keyId)).toBeNull();
      } else {
        expect(firstResult.status).toBe(200);
        await errorCode(secondResult, 404, "not_found");
        expect(
          db.sqlite.query("SELECT id FROM key_revocations WHERE id=?").get(pending.keyId),
        ).toBeNull();
        expect((await request("/api/me", { headers: publisherHeaders(competing) })).status).toBe(
          200,
        );
      }
    }
  });

  test("competing unknown revocations and duplicate revocations are atomic", async () => {
    const pending = await newPublisher("Racing revocations");
    db.raceNextTwoBatches((batch) => batch.some((q) => q.values.includes(pending.id)));
    const responses = await Promise.all([revoke(pending), revoke({ ...pending, id: second.id })]);
    expect(responses.map((response) => response.status)).toEqual([204, 404]);
    expect(
      db.sqlite.query("SELECT publisher_id FROM key_revocations WHERE id=?").get(pending.keyId),
    ).toEqual({ publisher_id: pending.id });
    db.raceNextTwoBatches();
    expect(
      (await Promise.all([revoke(pending), revoke(pending)])).map((response) => response.status),
    ).toEqual([204, 204]);
    expect(
      db.sqlite.query("SELECT COUNT(*) AS n FROM key_revocations WHERE id=?").get(pending.keyId),
    ).toEqual({ n: 1 });
    expect(counts().transaction_guards).toBe(0);
  });

  test("new keys retain publisher identity, usage and durable operation scope", async () => {
    const id = randomId(),
      key = operationKey();
    const original = await (await put(id, "one", { key })).json();
    const replacement = { ...(await newPublisher(first.label)), id: first.id };
    expect((await register(replacement)).status).toBe(200);
    const replay = await put(id, "one", { key, publisher: replacement });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
    expect(await usedBytes(replacement)).toBe(3);
  });

  test("admin JSON is bounded and validates policy without leaking input", async () => {
    const publisher = await newPublisher("Quota");
    expect((await register(publisher, 123)).status).toBe(200);
    expect(
      (await (await request("/api/me", { headers: publisherHeaders(publisher) })).json())
        .quotaBytes,
    ).toBe(123);
    await errorCode(await register(publisher, 124), 409, "registration_conflict");
    const path = `/api/admin/publishers/${randomId()}/keys/${randomId()}`;
    for (const value of [
      { label: "a\nb", tokenHash: "a".repeat(64) },
      { label: "ok", tokenHash: "a".repeat(64), quotaBytes: -1 },
      { label: "ok", tokenHash: "a".repeat(64), token: "secret" },
    ]) {
      await errorCode(
        await request(path, {
          method: "PUT",
          headers: ownerHeaders(),
          body: JSON.stringify(value),
        }),
        400,
        "invalid_registration",
      );
    }
    await errorCode(
      await request(path, { method: "PUT", headers: ownerHeaders(), body: "x".repeat(4097) }),
      413,
      "body_too_large",
    );
  });
});

describe("numbered versions, isolation and durable receipts", () => {
  test("create/update receipts are exact and retries recover old receipts before checking today's head", async () => {
    const id = randomId(),
      key = operationKey();
    const response = await put(id, "<h1>one</h1>", { key, expected: 0, title: "One" });
    expect(response.status).toBe(201);
    const original: Receipt = await response.json();
    expect(original).toEqual({
      id,
      version: 1,
      etag: '"1"',
      sha256: await sha256("<h1>one</h1>"),
      bytes: 12,
      url: `${origin}/d/${id}`,
      versionUrl: `${origin}/d/${id}/v/1`,
      contentUrl: `${origin}/content/${id}/v/1`,
      downloadUrl: `${origin}/raw/${id}/v/1`,
    });
    expect(response.headers.get("ETag")).toBe('"1"');
    expect((await put(id, "two", { expected: 1, title: "Two" })).status).toBe(201);
    const retry = await put(id, "<h1>one</h1>", { key, expected: 0, title: "One" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(retry.headers.get("ETag")).toBe('"1"');
    expect(await usedBytes()).toBe(15);
    expect(counts()).toEqual({
      drafts: 1,
      versions: 2,
      body_chunks: 2,
      operations: 2,
      transaction_guards: 0,
    });
    const detail = await request(`/api/drafts/${id}`, { headers: publisherHeaders() });
    expect((await detail.json()).title).toBe("Two");
    expect(detail.headers.get("ETag")).toBe('"2"');
  });

  test("operation fingerprint includes ID, body, title and the exact precondition", async () => {
    const id = randomId(),
      key = operationKey();
    expect((await put(id, "one", { key })).status).toBe(201);
    for (const [requestedId, body, options] of [
      [id, "two", {}],
      [randomId(), "one", {}],
      [id, "one", { title: "Changed" }],
      [id, "one", { expected: 0 }],
      [id, "one", { expected: 1 }],
    ] as [string, string, { title?: string; expected?: number }][]) {
      await errorCode(
        await put(requestedId, body, { key, ...options }),
        409,
        "idempotency_conflict",
      );
    }
    expect(counts().versions).toBe(1);
  });

  test("foreign ownership is indistinguishable from missing; listing and cursors are owner-scoped", async () => {
    const foreignId = randomId();
    expect((await put(foreignId)).status).toBe(201);
    const foreign = await request(`/api/drafts/${foreignId}`, {
      headers: publisherHeaders(second),
    });
    const missing = await request(`/api/drafts/${randomId()}`, {
      headers: publisherHeaders(second),
    });
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).toBe(await missing.text());
    await errorCode(
      await put(foreignId, "steal", { publisher: second, expected: 1 }),
      404,
      "not_found",
    );
    const other = await (
      await request("/api/drafts", { headers: publisherHeaders(second) })
    ).json();
    expect(other).toEqual({ items: [], nextCursor: null });
    expect((await put(randomId())).status).toBe(201);
    const page = await (
      await request("/api/drafts?limit=1", { headers: publisherHeaders() })
    ).json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].etag).toBe('"1"');
    expect(page.nextCursor).toBeString();
    const next = await (
      await request(`/api/drafts?limit=1&cursor=${page.nextCursor}`, {
        headers: publisherHeaders(),
      })
    ).json();
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).not.toBe(page.items[0].id);
    expect(next.nextCursor).toBeNull();
    await errorCode(
      await request(`/api/drafts?cursor=${page.nextCursor}`, { headers: publisherHeaders(second) }),
      400,
      "invalid_cursor",
    );
  });

  test("missing, stale and malformed preconditions never silently rebase", async () => {
    const id = randomId();
    await errorCode(await put(id, "one", { expected: 1 }), 412, "precondition_failed");
    expect((await put(id)).status).toBe(201);
    await errorCode(await put(id), 428, "precondition_required");
    await errorCode(await put(id, "two", { expected: 0 }), 412, "precondition_failed");
    expect((await put(id, "two", { expected: 1 })).status).toBe(201);
    await errorCode(await put(id, "three", { expected: 1 }), 412, "precondition_failed");
    for (const value of ["1", 'W/"1"', '"01"', "*", '"1", "2"', '"9007199254740992"']) {
      await errorCode(
        await put(id, "three", { headers: { "If-Match": value } }),
        400,
        "invalid_precondition",
      );
    }
    expect(counts().versions).toBe(2);
    expect(counts().operations).toBe(2);
    expect(versionCount()).toBe(2);
  });

  test("lost batch response recovers a durable receipt after the actual transaction committed", async () => {
    const id = randomId(),
      key = operationKey();
    db.loseNextBatchResponse = true;
    const recovered = await put(id, "one", { key });
    expect(recovered.status).toBe(200);
    const retry = await put(id, "one", { key });
    expect(await retry.json()).toEqual(await recovered.json());
    expect(counts().versions).toBe(1);
    expect(await usedBytes()).toBe(3);
    expect(versionCount()).toBe(1);
  });
});

describe("actual SQL transaction races and rollback", () => {
  test("simultaneous creation by different owners cannot acquire or overwrite the other draft", async () => {
    const id = randomId();
    db.raceNextTwoBatches();
    const results = await Promise.all([put(id, "first"), put(id, "second", { publisher: second })]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 404]);
    expect(counts()).toEqual({
      drafts: 1,
      versions: 1,
      body_chunks: 1,
      operations: 1,
      transaction_guards: 0,
    });
    expect((await usedBytes()) + (await usedBytes(second))).toBe(
      results[0]!.status === 201 ? 5 : 6,
    );
  });

  test("two writers at the same head commit exactly one next version", async () => {
    const id = randomId();
    expect((await put(id, "zero")).status).toBe(201);
    db.raceNextTwoBatches();
    const results = await Promise.all([
      put(id, "one", { expected: 1 }),
      put(id, "two", { expected: 1 }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 412]);
    expect(counts()).toEqual({
      drafts: 1,
      versions: 2,
      body_chunks: 2,
      operations: 2,
      transaction_guards: 0,
    });
    expect(await usedBytes()).toBe(7);
  });

  test("concurrent identical operation keys produce one receipt; changed bytes conflict", async () => {
    const id = randomId(),
      key = operationKey();
    db.raceNextTwoBatches();
    const results = await Promise.all([put(id, "same", { key }), put(id, "same", { key })]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await results[0]!.json()).toEqual(await results[1]!.json());
    expect(counts().versions).toBe(1);
    const anotherId = randomId(),
      anotherKey = operationKey();
    db.raceNextTwoBatches();
    const changed = await Promise.all([
      put(anotherId, "a", { key: anotherKey }),
      put(anotherId, "b", { key: anotherKey }),
    ]);
    expect(changed.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(counts().operations).toBe(2);
    expect(versionCount()).toBe(2);
  });

  test("quota is exact original bytes and guarded across concurrent drafts", async () => {
    const limited = await newPublisher("Limited");
    expect((await register(limited, 5)).status).toBe(200);
    db.raceNextTwoBatches();
    const results = await Promise.all([
      put(randomId(), "1234", { publisher: limited }),
      put(randomId(), "1234", { publisher: limited }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 403]);
    expect(await usedBytes(limited)).toBe(4);
    expect((await put(randomId(), "x", { publisher: limited })).status).toBe(201);
    await errorCode(await put(randomId(), "x", { publisher: limited }), 403, "quota_exceeded");
    expect(await usedBytes(limited)).toBe(5);
    expect(counts().versions).toBe(2);
  });

  test("1000 tiny immutable versions exhaust metadata allowance without inflating exact byte usage", async () => {
    const id = randomId(),
      key = operationKey();
    const original = await (await put(id, "x", { key })).json();
    for (let expected = 1; expected < 1000; expected++) {
      expect((await put(id, "x", { expected })).status).toBe(201);
    }
    expect(versionCount()).toBe(1000);
    expect(await usedBytes()).toBe(1000);
    const before = counts();
    await errorCode(await put(id, "x", { expected: 1000 }), 403, "quota_exceeded");
    await errorCode(await put(randomId(), "x"), 403, "quota_exceeded");
    const retry = await put(id, "x", { key });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(counts()).toEqual(before);
    expect(versionCount()).toBe(1000);
    expect(await usedBytes()).toBe(1000);
    expect((await put(randomId(), "x", { publisher: second })).status).toBe(201);
    expect(versionCount(second)).toBe(1);
  }, 20_000);

  test("concurrent drafts share the last version allowance and identical retries never double-count", async () => {
    for (let n = 0; n < 999; n++) expect((await put(randomId(), "x")).status).toBe(201);
    expect(versionCount()).toBe(999);
    const ids = [randomId(), randomId()],
      keys = [operationKey(), operationKey()];
    db.raceNextTwoBatches();
    const responses = await Promise.all(ids.map((id, i) => put(id, "x", { key: keys[i] })));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 403]);
    const winner = responses.findIndex((response) => response.status === 201);
    const committed: Receipt = await responses[winner]!.json();
    expect(versionCount()).toBe(1000);
    expect(await usedBytes()).toBe(1000);
    expect(counts().versions).toBe(1000);
    const retry = await put(ids[winner]!, "x", { key: keys[winner] });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(committed);
    expect(versionCount()).toBe(1000);
    // A separate publisher has one final allowance too: the duplicate race must
    // recover its receipt before diagnosing the now-exhausted counter.
    for (let n = 0; n < 999; n++)
      expect((await put(randomId(), "x", { publisher: second })).status).toBe(201);
    const id = randomId(),
      key = operationKey();
    db.raceNextTwoBatches();
    const duplicates = await Promise.all([
      put(id, "x", { key, publisher: second }),
      put(id, "x", { key, publisher: second }),
    ]);
    expect(duplicates.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await duplicates[0]!.json()).toEqual(await duplicates[1]!.json());
    expect(versionCount(second)).toBe(1000);
    expect(await usedBytes(second)).toBe(1000);
    expect(counts().versions).toBe(2000);
    expect(counts().operations).toBe(2000);
    expect(counts().transaction_guards).toBe(0);
  }, 20_000);

  test("revocation after all application reads is rejected by the in-batch CHECK guard", async () => {
    db.beforeBatch = () => {
      db.beforeBatch = null;
      db.sqlite.query("UPDATE api_keys SET revoked=1 WHERE id=?").run(first.keyId);
    };
    await errorCode(await put(randomId(), "one"), 401, "unauthorized");
    expect(counts()).toEqual({
      drafts: 0,
      versions: 0,
      body_chunks: 0,
      operations: 0,
      transaction_guards: 0,
    });
    expect(
      (
        db.sqlite.query("SELECT used_bytes FROM publishers WHERE id=?").get(first.id) as {
          used_bytes: number;
        }
      ).used_bytes,
    ).toBe(0);
  });

  test("a real middle-chunk constraint failure rolls back all rows and leaves the operation retryable", async () => {
    const id = randomId(),
      key = operationKey();
    db.sqlite
      .exec(`CREATE TRIGGER reject_middle_chunk BEFORE INSERT ON body_chunks WHEN NEW.ordinal=1
      BEGIN SELECT RAISE(ABORT,'secret SQL HTML Authorization must never leak'); END`);
    const body = "x".repeat(MAX_CHUNK_UNITS * 2 + 1);
    const failed = await put(id, body, { key });
    await errorCode(failed, 503, "unavailable");
    expect(counts()).toEqual({
      drafts: 0,
      versions: 0,
      body_chunks: 0,
      operations: 0,
      transaction_guards: 0,
    });
    expect(await usedBytes()).toBe(0);
    expect(versionCount()).toBe(0);
    db.sqlite.exec("DROP TRIGGER reject_middle_chunk");
    expect((await put(id, body, { key })).status).toBe(201);
    expect(counts()).toEqual({
      drafts: 1,
      versions: 1,
      body_chunks: 3,
      operations: 1,
      transaction_guards: 0,
    });
    expect(await usedBytes()).toBe(body.length);
    expect(versionCount()).toBe(1);
  });

  test("failed updates preserve the complete previous head, body, usage and receipt", async () => {
    const id = randomId(),
      key = operationKey();
    const initial: Receipt = await (await put(id, "original")).json();
    const before = counts();
    db.sqlite
      .exec(`CREATE TRIGGER reject_update_chunk BEFORE INSERT ON body_chunks WHEN NEW.version=2 AND NEW.ordinal=1
      BEGIN SELECT RAISE(ABORT,'forced update failure'); END`);
    const body = "x".repeat(MAX_CHUNK_UNITS + 1);
    await errorCode(await put(id, body, { key, expected: 1 }), 503, "unavailable");
    expect(counts()).toEqual(before);
    expect(await usedBytes()).toBe(8);
    expect(versionCount()).toBe(1);
    const head = await (await request(`/api/drafts/${id}`, { headers: publisherHeaders() })).json();
    expect(head.version).toBe(1);
    expect(head.sha256).toBe(initial.sha256);
    expect(await (await request(`/raw/${id}/v/1`)).text()).toBe("original");
    expect((await request(`/raw/${id}/v/2`)).status).toBe(404);
    db.sqlite.exec("DROP TRIGGER reject_update_chunk");
    expect((await put(id, body, { key, expected: 1 })).status).toBe(201);
    expect(versionCount()).toBe(2);
  });

  test("receipt insertion failure rolls back the already-incremented version counter", async () => {
    const id = randomId(),
      key = operationKey();
    db.sqlite.exec(`CREATE TRIGGER reject_receipt BEFORE INSERT ON operations
      BEGIN SELECT RAISE(ABORT,'forced failure after counters'); END`);
    await errorCode(await put(id, "x", { key }), 503, "unavailable");
    expect(versionCount()).toBe(0);
    expect(await usedBytes()).toBe(0);
    expect(counts()).toEqual({
      drafts: 0,
      versions: 0,
      body_chunks: 0,
      operations: 0,
      transaction_guards: 0,
    });
    db.sqlite.exec("DROP TRIGGER reject_receipt");
    db.loseNextBatchResponse = true;
    expect((await put(id, "x", { key })).status).toBe(200);
    expect((await put(id, "x", { key })).status).toBe(200);
    expect(versionCount()).toBe(1);
    expect(await usedBytes()).toBe(1);
    expect(counts()).toEqual({
      drafts: 1,
      versions: 1,
      body_chunks: 1,
      operations: 1,
      transaction_guards: 0,
    });
  });

  test("schema enforces STRICT, foreign keys, formats, sizes and row consistency", () => {
    expect(() =>
      db.sqlite
        .query("INSERT INTO api_keys(id,publisher_id,token_hash,created_at) VALUES (?,?,?,0)")
        .run(randomId(), randomId(), "a".repeat(64)),
    ).toThrow();
    expect(() =>
      db.sqlite.query("UPDATE publishers SET used_bytes=quota_bytes+1 WHERE id=?").run(first.id),
    ).toThrow();
    expect(() =>
      db.sqlite.query("UPDATE publishers SET quota_bytes='invalid' WHERE id=?").run(first.id),
    ).toThrow();
    expect(() =>
      db.sqlite.query("UPDATE publishers SET version_count=-1 WHERE id=?").run(first.id),
    ).toThrow();
    expect(() =>
      db.sqlite.query("UPDATE publishers SET version_count=1.5 WHERE id=?").run(first.id),
    ).toThrow();
    expect(() =>
      db.sqlite.exec("INSERT INTO transaction_guards(nonce,ok) VALUES ('bad',1)"),
    ).toThrow();
    const tables = db.sqlite.query("PRAGMA table_list").all() as { name: string; strict: number }[];
    for (const table of tables.filter((row) => !row.name.startsWith("sqlite_")))
      expect(table.strict).toBe(1);
    expect(
      db.sqlite
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='drafts_owner_list'")
        .get(),
    ).not.toBeNull();
  });
});

describe("migration upgrades", () => {
  test("existing histories backfill by publisher, including over-cap history and registered revocations", async () => {
    const legacy = new SQLiteD1();
    const emptyId = randomId();
    const hash = await sha256("x");
    try {
      legacy.sqlite.exec("PRAGMA foreign_keys=ON");
      await migrate(legacy.sqlite, [migrations[0]!]);
      legacy.sqlite.transaction(() => {
        for (const [publisher, used] of [
          [first, 1001],
          [second, 2],
        ] as const) {
          legacy.sqlite
            .query(
              "INSERT INTO publishers(id,label,quota_bytes,used_bytes,created_at) VALUES (?,?,?,?,0)",
            )
            .run(publisher.id, publisher.label, DEFAULT_QUOTA_BYTES, used);
          legacy.sqlite
            .query(
              "INSERT INTO api_keys(id,publisher_id,token_hash,revoked,created_at) VALUES (?,?,?,?,0)",
            )
            .run(publisher.keyId, publisher.id, publisher.tokenHash, publisher === second ? 1 : 0);
        }
        legacy.sqlite
          .query("INSERT INTO publishers(id,label,quota_bytes,created_at) VALUES (?,'Empty',?,0)")
          .run(emptyId, DEFAULT_QUOTA_BYTES);
        for (const [publisherId, total] of [
          [first.id, 1000],
          [first.id, 1],
          [second.id, 2],
        ] as const) {
          const draftId = randomId();
          legacy.sqlite
            .query(
              "INSERT INTO drafts(id,publisher_id,head_version,created_at,updated_at) VALUES (?,?,?,0,0)",
            )
            .run(draftId, publisherId, total);
          legacy.sqlite
            .query(`WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n<?)
            INSERT INTO versions(draft_id,version,title,sha256,bytes,chunk_count,created_at)
            SELECT ?,n,'',?,1,1,0 FROM sequence`)
            .run(total, draftId, hash);
        }
        legacy.sqlite
          .exec(`INSERT INTO body_chunks(draft_id,version,ordinal,body,utf16_units,byte_count)
          SELECT draft_id,version,0,'x',1,1 FROM versions`);
      })();
      await migrate(legacy.sqlite, migrations.slice(1));
      for (const [publisherId, count] of [
        [first.id, 1001],
        [second.id, 2],
        [emptyId, 0],
      ] as const) {
        expect(
          legacy.sqlite
            .query("SELECT version_count,used_bytes FROM publishers WHERE id=?")
            .get(publisherId),
        ).toEqual({ version_count: count, used_bytes: count });
      }
      expect(legacy.sqlite.query("SELECT COUNT(*) AS n FROM versions").get()).toEqual({ n: 1003 });
      expect(legacy.sqlite.query("SELECT id,publisher_id FROM key_revocations").all()).toEqual([
        { id: second.keyId, publisher_id: second.id },
      ]);
      env.DB = legacy;
      await errorCode(await put(randomId(), "x"), 403, "quota_exceeded");
      expect((await (await register(second)).json()).revoked).toBe(true);
      await errorCode(
        await request("/api/me", { headers: publisherHeaders(second) }),
        401,
        "unauthorized",
      );
      expect(
        legacy.sqlite
          .query("SELECT version_count,used_bytes FROM publishers WHERE id=?")
          .get(first.id),
      ).toEqual({ version_count: 1001, used_bytes: 1001 });
    } finally {
      env.DB = db;
      legacy.sqlite.close();
    }
  });
});

describe("raw UTF-8, bounded input and full-size chunk transport", () => {
  test("the SQLite D1 adapter preserves a leading BOM through explicit UTF-8 TEXT binding", async () => {
    db.sqlite.exec("CREATE TABLE adapter_probe (body TEXT NOT NULL) STRICT");
    await db.batch([db.prepare("INSERT INTO adapter_probe(body) VALUES (?)").bind("\ufeffa\0b")]);
    const row = await db
      .prepare("SELECT body,hex(CAST(body AS BLOB)) AS hex FROM adapter_probe")
      .first<{ body: string; hex: string }>();
    expect(row).toEqual({ body: "\ufeffa\0b", hex: "EFBBBF610062" });
  });

  test("BOM, NUL, line endings, BMP and astral bytes survive HTML and raw delivery", async () => {
    const original = utf8("\ufeff<!doctype html>\r\n\0\0<p>π漢😀</p>\r\n");
    const response = await put(randomId(), original);
    expect(response.status).toBe(201);
    const receipt: Receipt = await response.json();
    expect(receipt.sha256).toBe(await sha256(original));
    for (const path of [receipt.downloadUrl, receipt.contentUrl]) {
      const fetched = await request(new URL(path).pathname);
      expect(fetched.status).toBe(200);
      const bytes = new Uint8Array(await fetched.arrayBuffer());
      expect(bytes).toEqual(original);
      expect(await sha256(bytes)).toBe(receipt.sha256);
    }
    expect(await usedBytes()).toBe(original.length);
  });

  const maxFixtures = {
    ASCII: () => utf8("a".repeat(MAX_HTML_BYTES)),
    BMP: () => utf8("漢".repeat(Math.floor(MAX_HTML_BYTES / 3)) + "a".repeat(MAX_HTML_BYTES % 3)),
    astral: () => utf8("😀".repeat(MAX_HTML_BYTES / 4)),
    NUL: () => new Uint8Array(MAX_HTML_BYTES),
    BOM: () => utf8("\ufeff" + "a".repeat(MAX_HTML_BYTES - 3)),
    surrogateBoundary: () =>
      utf8(
        "a".repeat(MAX_CHUNK_UNITS - 1) +
          "😀" +
          "b".repeat(MAX_HTML_BYTES - (MAX_CHUNK_UNITS - 1) - 4),
      ),
  };
  for (const [name, fixture] of Object.entries(maxFixtures)) {
    test(`exact 5 MiB ${name} fixture round-trips through real TEXT rows in fewer than 50 queries`, async () => {
      const original = fixture();
      expect(original.length).toBe(MAX_HTML_BYTES);
      db.queries = 0;
      const response = await put(randomId(), original, { headers: { "Content-Length": "1" } });
      expect(response.status).toBe(201);
      expect(db.queries).toBeLessThan(50);
      expect(db.maxBatch).toBeLessThan(50);
      const receipt: Receipt = await response.json();
      expect(receipt.bytes).toBe(MAX_HTML_BYTES);
      const chunks = db.sqlite
        .query(
          "SELECT body,utf16_units AS units,byte_count AS bytes,ordinal FROM body_chunks ORDER BY ordinal",
        )
        .all() as { body: string; units: number; bytes: number; ordinal: number }[];
      expect(chunks.length).toBeLessThanOrEqual(21);
      for (const [ordinal, chunk] of chunks.entries()) {
        expect(chunk.ordinal).toBe(ordinal);
        expect(chunk.units).toBe(chunk.body.length);
        expect(chunk.units).toBeLessThanOrEqual(MAX_CHUNK_UNITS);
        expect(chunk.bytes).toBeLessThanOrEqual(786_432);
        expect(utf8(chunk.body).length).toBe(chunk.bytes);
        const last = chunk.body.charCodeAt(chunk.body.length - 1);
        expect(last < 0xd800 || last > 0xdbff).toBe(true);
      }
      db.queries = 0;
      const downloaded = await request(new URL(receipt.downloadUrl).pathname);
      expect(downloaded.status).toBe(200);
      expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(original);
      expect(db.queries).toBeLessThan(50);
      expect(await usedBytes()).toBe(MAX_HTML_BYTES);
    }, 20_000);
  }

  test("split backs off a high surrogate instead of replacing either half", () => {
    const text = "a".repeat(MAX_CHUNK_UNITS - 1) + "😀b";
    const chunks = splitChunks(text);
    expect(chunks[0]!.length).toBe(MAX_CHUNK_UNITS - 1);
    expect(chunks[1]).toBe("😀b");
    expect(chunks.join("")).toBe(text);
  });

  test("stream overflow is cancelled without trusting Content-Length or leaving rows", async () => {
    let cancelled = false;
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted++;
        controller.enqueue(new Uint8Array(262_144));
      },
      cancel() {
        cancelled = true;
      },
    });
    await errorCode(
      await put(randomId(), body, { headers: { "Content-Length": "1" } }),
      413,
      "body_too_large",
    );
    expect(cancelled).toBe(true);
    expect(emitted).toBeLessThanOrEqual(23);
    await errorCode(
      await put(randomId(), new Uint8Array(MAX_HTML_BYTES + 1)),
      413,
      "body_too_large",
    );
    expect(counts().drafts).toBe(0);
  });

  test("stream reads tolerate split UTF-8, empty chunks and reused chunk buffers", async () => {
    const original = utf8("\ufeffπ漢😀\0\r\n");
    let index = 0;
    const reused = new Uint8Array(1);
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (index === original.length) {
            controller.close();
            return;
          }
          reused[0] = original[index++]!;
          controller.enqueue(new Uint8Array(0));
          controller.enqueue(reused);
        },
      },
      { highWaterMark: 0 },
    );
    const response = await put(randomId(), body);
    expect(response.status).toBe(201);
    const receipt: Receipt = await response.json();
    expect(
      new Uint8Array(await (await request(new URL(receipt.downloadUrl).pathname)).arrayBuffer()),
    ).toEqual(original);
  });

  test("malformed UTF-8, compressed encodings, empty bodies and invalid headers are rejected", async () => {
    for (const bytes of [
      [0xc0, 0xaf],
      [0xed, 0xa0, 0x80],
      [0xe2, 0x82],
      [0xf4, 0x90, 0x80, 0x80],
      [0x80],
    ]) {
      await errorCode(await put(randomId(), new Uint8Array(bytes)), 422, "invalid_utf8");
    }
    for (const encoding of ["gzip", "br", "identity, gzip", "unknown"])
      await errorCode(
        await put(randomId(), "x", { headers: { "Content-Encoding": encoding } }),
        415,
        "unsupported_encoding",
      );
    await errorCode(await put(randomId(), ""), 400, "empty_body");
    await errorCode(
      await put(randomId(), "x", { headers: { "Content-Type": "text/plain" } }),
      415,
      "unsupported_media_type",
    );
    await errorCode(
      await put(randomId(), "x", { headers: { "Idempotency-Key": "short" } }),
      400,
      "invalid_idempotency_key",
    );
    for (const title of [
      "=",
      "_w",
      base64url(utf8("line\nbreak")),
      base64url(utf8("x".repeat(257))),
    ]) {
      await errorCode(
        await put(randomId(), "x", { headers: { "X-Note-Title": title } }),
        400,
        "invalid_title",
      );
    }
    expect(counts().drafts).toBe(0);
    expect(
      (await put(randomId(), "x", { headers: { "Content-Encoding": "identity" } })).status,
    ).toBe(201);
  });
});

describe("public security boundaries and explicit asset routing", () => {
  test("hosted header centers title and navigation on one desktop row and wraps phone lanes", async () => {
    const id = randomId();
    for (const [index, title] of [
      "Geometry notes · split comparison",
      "Geometry ".repeat(25),
    ].entries()) {
      expect(
        (await put(id, "<!doctype html><p>Opaque content</p>", { title, expected: index || null }))
          .status,
      ).toBe(201);
    }
    expect((await put(id, "next version", { expected: 2 })).status).toBe(201);
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (request) => worker.fetch(request, env),
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const version of [1, 2]) {
          await page.goto(`${server.url}d/${id}/v/${version}`);
          const layout = await page.locator("header").evaluate((header) => {
            const rect = (element: Element) => {
              const r = element.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                bottom: r.bottom,
                centerY: r.y + r.height / 2,
                right: r.right,
              };
            };
            const title = header.querySelector("h1")!;
            const nav = header.querySelector("nav")!;
            return {
              outer: rect(header),
              inner: rect(header.querySelector(".viewer-inner")!),
              title: rect(title),
              nav: rect(nav),
              titleRow: getComputedStyle(title).gridRowStart,
              navRow: getComputedStyle(nav).gridRowStart,
              radius: getComputedStyle(header).borderRadius,
              border: getComputedStyle(header).borderBottomWidth,
              body: document.documentElement.scrollWidth,
              links: [...nav.querySelectorAll("a")].map(rect),
            };
          });
          expect(layout.outer.width).toBe(width);
          expect(layout.body).toBe(width);
          expect(layout.radius).toBe("0px");
          expect(layout.border).toBe("1px");
          for (const link of layout.links) {
            expect(link.x).toBeGreaterThanOrEqual(16);
            expect(link.right).toBeLessThanOrEqual(width - 16);
          }
          if (width === 1440) {
            expect(layout.inner.width).toBe(728);
            expect(layout.title.x).toBe((width - 680) / 2);
            expect(layout.titleRow).toBe("2");
            expect(layout.navRow).toBe("2");
            expect(Math.abs(layout.title.centerY - layout.nav.centerY)).toBeLessThan(0.5);
          } else {
            expect(layout.navRow).toBe("3");
            expect(layout.nav.y).toBeGreaterThan(layout.title.bottom);
            expect(layout.nav.x).toBe(layout.title.x);
            expect(layout.title.x).toBe(20);
          }
          expect(await page.locator("iframe").getAttribute("sandbox")).toBe("allow-scripts");
        }
      }
    } finally {
      await browser.close();
      server.stop(true);
    }
  }, 30_000);

  test("trusted viewer escapes titles and pins an opaque sandbox, with navigation outside it", async () => {
    const id = randomId();
    const title = '</h1><script>alert("secret")</script>';
    expect(
      (await put(id, "<script>parent.document.body.remove()</script>", { title })).status,
    ).toBe(201);
    expect((await put(id, "second", { expected: 1 })).status).toBe(201);
    const response = await request(`/d/${id}/v/1`);
    const html = await response.text();
    expect(html).toContain("&lt;/h1&gt;&lt;script&gt;alert(&quot;secret&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("allow-popups");
    expect(html).toContain(`src="/content/${id}/v/1" sandbox="allow-scripts"`);
    expect(html).toContain(`href="/d/${id}"`);
    expect(html).toContain(`href="/d/${id}/v/1"`);
    expect(html).toContain(`href="/d/${id}/v/2"`);
    expect(html).toContain(`href="/raw/${id}/v/1" download`);
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    expect(response.headers.get("Content-Security-Policy")).toContain("style-src 'unsafe-inline'");
    const current = await (await request(`/d/${id}`)).text();
    expect(current).toContain(`src="/content/${id}/v/2"`);
    expect(current).toContain(`href="/d/${id}/v/1">Previous`);
    expect(current).not.toContain(first.token);
  });

  test("direct HTML visits, raw attachments, HEAD and missing content all retain restrictive headers", async () => {
    const id = randomId();
    expect((await put(id, "<h1>safe boundary</h1>")).status).toBe(201);
    const content = await request(`/content/${id}/v/1`);
    const csp = content.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("sandbox allow-scripts;");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain("allow-same-origin");
    expect(content.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(content.headers.get("Set-Cookie")).toBeNull();
    const raw = await request(`/raw/${id}/v/1`);
    expect(raw.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(raw.headers.get("Content-Disposition")).toBe(
      `attachment; filename="note-${id}-v1.html"`,
    );
    expect(raw.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(raw.headers.get("Content-Security-Policy")).toContain("sandbox;");
    const head = await request(`/content/${id}/v/1`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Security-Policy")).toBe(csp);
    expect(await head.text()).toBe("");
    const missing = await request(`/content/${randomId()}/v/1`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Content-Security-Policy")).toContain("sandbox;");
    const invalid = await request(`/content/${id}/v/9007199254740992`, { method: "HEAD" });
    expect(invalid.status).toBe(404);
    expect(await invalid.text()).toBe("");
  });

  test("only explicit static paths reach ASSETS; trusted CSP permits own assets and self fetch", async () => {
    const allowed = [
      "/",
      "/assets/main-abcd.js",
      "/favicon.svg",
      "/llms.txt",
      "/starter.zip",
      "/cli.ts",
      "/skill.md",
      "/starter.sha256",
      "/docs",
      "/downloads/starter-012345abcdef.zip",
      "/downloads/cli-fedcba543210.ts",
    ];
    for (const path of allowed) {
      const response = await request(path);
      expect(response.status).toBe(200);
      const csp = response.headers.get("Content-Security-Policy")!;
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self'");
      expect(csp).toContain("font-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toContain("unsafe-inline");
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }
    const expectedAssets = allowed.map((path) => (path === "/docs" ? "/" : path));
    expect(assetRequests).toEqual(expectedAssets);
    for (const path of [
      "/unknown",
      "/api/nope",
      "/api",
      "/content/nope",
      "/raw/nope",
      "/d/nope",
      "/docs/other",
      "/assets/../not-allowed",
      "/content/anything/index.html",
      "/downloads/other-012345abcdef.zip",
      "/downloads/starter-012345abcdef0.zip",
      "/downloads/cli-fedcba543210.js",
    ]) {
      expect((await request(path)).status).toBe(404);
    }
    expect(assetRequests).toEqual(expectedAssets);
    expect(await (await request("/healthz")).json()).toEqual({ ok: true });
  });

  test("receipt origins come only from configuration and SQL failures stay bounded", async () => {
    const id = randomId();
    const response = await worker.fetch(
      new Request(`https://attacker.example/api/drafts/${id}`, {
        method: "PUT",
        body: "x",
        headers: {
          ...publisherHeaders(),
          "Content-Type": "text/html; charset=utf-8",
          "Idempotency-Key": operationKey(),
        },
      }),
      env,
    );
    expect((await response.json()).url).toBe(`${origin}/d/${id}`);
    db.sqlite.exec("DROP TABLE body_chunks");
    const failed = await request(`/raw/${id}/v/1`);
    const body = await failed.text();
    expect(failed.status).toBe(503);
    expect(body).not.toContain("body_chunks");
    expect(body).not.toContain(first.token);
    expect(body).not.toContain("SELECT");
    expect(body.length).toBeLessThan(512);
    expect(failed.headers.get("Content-Security-Policy")).toContain("sandbox;");
  });
});
