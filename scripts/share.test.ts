import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { credentialHash, normalizeServer } from "./share";

const CLIENT = join(import.meta.dir, "share.ts");
const PUBLISHER_ID = "a".repeat(32),
  KEY_ID = "b".repeat(32);
const OWNER = `nf_owner_${Buffer.alloc(32, 7).toString("base64url")}`;
const TOKEN = `nf_pub_${KEY_ID}.${Buffer.alloc(32, 9).toString("base64url")}`;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const sha = (body: Uint8Array | string) => createHash("sha256").update(body).digest("hex");
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "nf-share-test-"));
  chmodSync(root, 0o700);
  const cwd = join(root, "project"),
    config = join(root, "private"),
    handoff = join(root, "handoff");
  mkdirSync(cwd);
  mkdirSync(handoff, { mode: 0o700 });
  writeFileSync(join(cwd, "package.json"), "{}");
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  function spawn(args: string[], stdin = "") {
    return Bun.spawn([process.execPath, CLIENT, ...args], {
      cwd,
      env: { ...process.env, NOTE_FRAMEWORK_CONFIG_DIR: config },
      stdin: new Blob([stdin]),
      stdout: "pipe",
      stderr: "pipe",
    });
  }
  async function result(child: ReturnType<typeof spawn>) {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  return {
    root,
    cwd,
    config,
    handoff,
    spawn,
    result,
    run: (args: string[], stdin = "") => result(spawn(args, stdin)),
    html: (body: Uint8Array | string, name = "note.html") => {
      const file = join(cwd, name);
      writeFileSync(file, body);
      return file;
    },
  };
}
type Sandbox = ReturnType<typeof sandbox>;
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
function service() {
  const versions = new Map<string, Uint8Array[]>();
  const receipts = new Map<string, { fingerprint: string; receipt: Receipt }>();
  const calls: {
    id: string;
    operation: string;
    body: Uint8Array;
    title: string;
    expected: string | null;
    authorization: string | null;
  }[] = [];
  const registrations: { path: string; value: Record<string, unknown> }[] = [];
  const keys = new Map<string, { hash: string; publisher: string; revoked: boolean }>();
  keys.set(KEY_ID, { hash: credentialHash(TOKEN), publisher: PUBLISHER_ID, revoked: false });
  let failPut = false,
    corruptRaw = false,
    redirectMe = false,
    holdPut: Promise<void> | undefined;
  let onPut: (() => void) | undefined;
  const error = (status: number, code: string) =>
    Response.json({ error: { code, message: `untrusted ${TOKEN}` } }, { status });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url),
        path = url.pathname;
      const auth = request.headers.get("authorization");
      const token = auth?.replace(/^Bearer /, "");
      const key = token?.match(/^nf_pub_([0-9a-f]{32})\./)?.[1];
      const record = key ? keys.get(key) : undefined;
      const publisher =
        record && !record.revoked && record.hash === credentialHash(token!)
          ? record.publisher
          : undefined;
      if (path === "/api/me") {
        if (redirectMe) return Response.redirect("http://127.0.0.1:1/capture");
        if (token === OWNER) return error(401, "unauthorized");
        if (!publisher) return error(401, "unauthorized");
        return Response.json({
          publisherId: publisher,
          keyId: key,
          label: "Test",
          maxBytes: 5242880,
          quotaBytes: 99_000_000,
          usedBytes: 0,
        });
      }
      if (path.startsWith("/api/admin/")) {
        if (token !== OWNER) return error(403, "forbidden");
        const [, , , , publisherId, , keyId] = path.split("/");
        if (request.method === "DELETE") {
          const old = keys.get(keyId!);
          if (old) old.revoked = true;
          return new Response(null, { status: 204 });
        }
        const value = (await request.json()) as Record<string, unknown>;
        registrations.push({ path, value });
        const old = keys.get(keyId!);
        if (old?.revoked)
          return Response.json({
            publisherId,
            keyId,
            label: value.label,
            quotaBytes: value.quotaBytes ?? 134217728,
            revoked: true,
          });
        if (old && old.hash !== value.tokenHash) return error(409, "key_conflict");
        keys.set(keyId!, {
          hash: String(value.tokenHash),
          publisher: publisherId!,
          revoked: false,
        });
        return Response.json(
          {
            publisherId,
            keyId,
            label: value.label,
            quotaBytes: value.quotaBytes ?? 134217728,
            revoked: false,
          },
          { status: old ? 200 : 201 },
        );
      }
      const rawMatch = /^\/raw\/([0-9a-f]{32})\/v\/(\d+)$/.exec(path);
      if (rawMatch) {
        if (auth) throw new Error("public download received credentials");
        const bytes = versions.get(rawMatch[1]!)?.[Number(rawMatch[2]) - 1];
        return bytes
          ? new Response(corruptRaw ? "corrupt" : Buffer.from(bytes))
          : error(404, "not_found");
      }
      if (!publisher) return error(401, "unauthorized");
      if (path === "/api/drafts")
        return Response.json({
          items: [...versions].map(([id, bodies]) => ({
            id,
            title: "Note",
            version: bodies.length,
            etag: `"${bodies.length}"`,
            url: server.url.origin + `/d/${id}`,
            versionUrl: server.url.origin + `/d/${id}/v/${bodies.length}`,
            updatedAt: "2026-01-01",
          })),
          nextCursor: null,
        });
      const id = /^\/api\/drafts\/([0-9a-f]{32})$/.exec(path)?.[1];
      if (!id || request.method !== "PUT") return error(404, "not_found");
      const body = new Uint8Array(await request.arrayBuffer());
      const operation = request.headers.get("idempotency-key")!;
      const title = request.headers.get("x-note-title")!;
      const expected = request.headers.get("if-match");
      calls.push({ id, operation, body, title, expected, authorization: auth });
      onPut?.();
      if (holdPut) await holdPut;
      if (failPut) return error(503, TOKEN);
      const fingerprint = sha(body) + title + expected + id;
      const previous = receipts.get(operation);
      if (previous)
        return previous.fingerprint === fingerprint
          ? Response.json(previous.receipt)
          : error(409, "idempotency_conflict");
      const bodies = versions.get(id) ?? [];
      if (expected !== `"${bodies.length}"`) return error(412, "stale_version");
      bodies.push(body);
      versions.set(id, bodies);
      const version = bodies.length,
        origin = server.url.origin;
      const receipt = {
        id,
        version,
        etag: `"${version}"`,
        sha256: sha(body),
        bytes: body.length,
        url: `${origin}/d/${id}`,
        versionUrl: `${origin}/d/${id}/v/${version}`,
        contentUrl: `${origin}/content/${id}/v/${version}`,
        downloadUrl: `${origin}/raw/${id}/v/${version}`,
      };
      receipts.set(operation, { fingerprint, receipt });
      return Response.json({ ...receipt, untrusted: TOKEN }, { status: 201 });
    },
  });
  cleanups.push(() => server.stop(true));
  return {
    server,
    origin: server.url.origin,
    versions,
    receipts,
    calls,
    registrations,
    keys,
    set failPut(value: boolean) {
      failPut = value;
    },
    set corruptRaw(value: boolean) {
      corruptRaw = value;
    },
    set redirectMe(value: boolean) {
      redirectMe = value;
    },
    set holdPut(value: Promise<void> | undefined) {
      holdPut = value;
    },
    set onPut(value: (() => void) | undefined) {
      onPut = value;
    },
  };
}
async function login(box: Sandbox, origin: string, token = TOKEN) {
  if (token === OWNER) {
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `import {saveOwnerProfile} from ${JSON.stringify(CLIENT)}; saveOwnerProfile(${JSON.stringify(origin)}, await Bun.stdin.text(), {local:true});`,
      ],
      {
        cwd: box.cwd,
        env: { ...process.env, NOTE_FRAMEWORK_CONFIG_DIR: box.config },
        stdin: new Blob([token]),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(0);
    return;
  }
  const result = await box.run(
    ["login", "--server", origin, "--local", "--token-stdin"],
    token + "\n",
  );
  expect(result).toEqual({ code: 0, stdout: "Logged in.\n", stderr: "" });
}
async function upload(box: Sandbox, extra: string[] = []) {
  return box.run(["upload", "note.html", "--local", "--json", ...extra]);
}
async function until(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition timed out");
    await Bun.sleep(10);
  }
}

describe("standalone share subprocess", () => {
  test("auth is origin scoped, redirects fail closed, and private profiles never leak", async () => {
    const box = sandbox(),
      one = service(),
      two = service();
    await login(box, one.origin);
    expect(statSync(box.config).mode & 0o777).toBe(0o700);
    expect(statSync(join(box.config, "profiles.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(box.config, "state.sqlite")).mode & 0o777).toBe(0o600);
    expect((await box.run(["list", "--local", "--server", two.origin])).stderr).toContain(
      "publisher_login_required",
    );
    expect((await box.run(["list"])).stderr).toContain("invalid_server");
    two.redirectMe = true;
    const redirected = await box.run(
      ["login", "--server", two.origin, "--local", "--token-stdin"],
      TOKEN,
    );
    expect(redirected.code).toBe(1);
    expect(redirected.stderr).not.toContain(TOKEN);
    const profiles = JSON.parse(readFileSync(join(box.config, "profiles.json"), "utf8"));
    expect(profiles.profiles[two.origin]).toBeUndefined();
    const invalid = await box.run(
      ["login", "--server", one.origin, "--local", "--token-stdin"],
      OWNER.replace("nf_owner_", "bad_"),
    );
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).not.toContain("bad_");
  });

  test("byte preservation, stable versions, explicit stale conflict, new identity and concise output", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    const bytes = Buffer.concat([
      Buffer.from([239, 187, 191]),
      Buffer.from("<title>A &amp; 🧪</title>\r\n\0é𐐀"),
    ]);
    box.html(bytes);
    const firstResult = await upload(box);
    expect(firstResult.code).toBe(0);
    expect(firstResult.stdout).not.toContain(TOKEN);
    const first = JSON.parse(firstResult.stdout) as Receipt;
    expect(first.sha256).toBe(sha(bytes));
    expect(first.bytes).toBe(bytes.length);
    expect(api.calls[0]!.body).toEqual(new Uint8Array(bytes));
    expect(Buffer.from(api.calls[0]!.title, "base64url").toString()).toBe("A & 🧪");
    box.html("<title>Second</title>changed");
    const second = JSON.parse((await upload(box)).stdout) as Receipt;
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(api.calls[1]!.expected).toBe('"1"');
    const stale = await upload(box, ["--id", first.id, "--expect", "0"]);
    expect(stale.stderr).toContain("stale_version");
    expect(stale.stdout).toBe("");
    const third = await box.run(["upload", "note.html", "--local"]);
    expect(third.stdout).toBe(first.url + "\n");
    expect(third.code).toBe(0);
    const fresh = JSON.parse((await upload(box, ["--new"])).stdout) as Receipt;
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.version).toBe(1);
    expect((await box.run(["list", "--local", "--json"])).code).toBe(0);
    for (const filename of readdirSync(box.config)) {
      if (filename.startsWith("state.sqlite"))
        expect(readFileSync(join(box.config, filename)).includes(Buffer.from(TOKEN))).toBe(false);
    }
  });

  test("failed response and failed public verification retry exact durable operation before changed input", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html("<title>Original</title>first");
    api.failPut = true;
    const failed = await upload(box);
    expect(failed.stderr).toBe("share: http_503\n");
    expect(failed.stderr).not.toContain(TOKEN);
    const original = api.calls[0]!;
    box.html("changed input");
    api.failPut = false;
    api.corruptRaw = true;
    const corrupt = await upload(box, ["--new", "--title", "Changed"]);
    expect(corrupt.code).toBe(1);
    expect(corrupt.stdout).toBe("");
    expect(corrupt.stderr).toContain("download_verification_failed");
    api.corruptRaw = false;
    const recovered = JSON.parse((await upload(box)).stdout) as Receipt;
    expect(recovered.version).toBe(1);
    expect(api.calls).toHaveLength(3);
    for (const call of api.calls) {
      expect(call.operation).toBe(original.operation);
      expect(call.body).toEqual(original.body);
      expect(call.title).toBe(original.title);
      expect(call.expected).toBe('"0"');
    }
    expect(JSON.parse((await upload(box)).stdout).version).toBe(2);
  });

  test("killed client and concurrent subprocess recover the same operation without stale PID locks", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html("original");
    let release!: () => void;
    api.holdPut = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = box.spawn(["upload", "note.html", "--local", "--json"]);
    await until(() => api.calls.length === 1);
    const pendingId = api.calls[0]!.operation;
    // Killing while the network transaction is open leaves the previously committed journal.
    first.kill("SIGKILL");
    await first.exited;
    box.html("different bytes");
    api.holdPut = undefined;
    release();
    const recoveredResult = await upload(box);
    expect(recoveredResult.code).toBe(0);
    expect(api.calls[1]!.operation).toBe(pendingId);
    expect(api.calls[1]!.body).toEqual(api.calls[0]!.body);
    expect(api.versions.size).toBe(1);
    // A separate live process waits for the SQLite write lock rather than computing a new operation.
    let releaseSecond!: () => void;
    api.holdPut = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const a = box.spawn(["upload", "note.html", "--local", "--json"]);
    await until(() => api.calls.length === 3);
    const b = box.spawn(["upload", "note.html", "--local", "--json"]);
    await Bun.sleep(100);
    expect(api.calls).toHaveLength(3);
    api.holdPut = undefined;
    releaseSecond();
    const [ar, br] = await Promise.all([box.result(a), box.result(b)]);
    expect(ar.code).toBe(0);
    expect(br.code).toBe(0);
    expect(JSON.parse(ar.stdout).id).toBe(JSON.parse(br.stdout).id);
    expect(api.versions.size).toBe(1);
  }, 15000);

  test("owner and publisher roles stay separate; bundle survives registration failure; rotation and revoke", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin, OWNER);
    box.html("hello");
    expect((await upload(box)).stderr).toContain("publisher_login_required");
    const ownerLogin = await box.run(
      ["login", "--local", "--server", api.origin, "--token-stdin"],
      OWNER,
    );
    expect(ownerLogin.stderr).toContain("owner_bootstrap_required");
    expect(ownerLogin.stdout).toBe("");
    const bundleFile = join(box.handoff, "publisher.json");
    const created = await box.run([
      "key",
      "create",
      "--local",
      "--name",
      "Invite",
      "--out",
      bundleFile,
      "--quota",
      "10000",
    ]);
    expect(created.code).toBe(0);
    const bundle = JSON.parse(readFileSync(bundleFile, "utf8"));
    expect(bundle.publisherId).toMatch(/^[0-9a-f]{32}$/);
    expect(bundle.keyId).toMatch(/^[0-9a-f]{32}$/);
    expect(bundle.token).toMatch(/^nf_pub_[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
    expect(created.stdout + created.stderr).not.toContain(bundle.token);
    expect(statSync(bundleFile).mode & 0o777).toBe(0o600);
    expect(api.registrations[0]!.value).toEqual({
      label: "Invite",
      quotaBytes: 10000,
      tokenHash: sha(`note-framework/publisher/v1\0${bundle.token}`),
    });
    expect((await box.run(["key", "register", bundleFile, "--local"])).code).toBe(0);
    expect((await box.run(["login", "--credential-file", bundleFile, "--local"])).code).toBe(0);
    const first = JSON.parse((await upload(box)).stdout) as Receipt;
    const rotatedFile = join(box.handoff, "rotated.json");
    expect(
      (
        await box.run([
          "key",
          "create",
          "--local",
          "--name",
          "Rotation",
          "--publisher",
          bundle.publisherId,
          "--out",
          rotatedFile,
        ])
      ).code,
    ).toBe(0);
    expect((await box.run(["login", "--credential-file", rotatedFile, "--local"])).code).toBe(0);
    const second = JSON.parse((await upload(box)).stdout) as Receipt;
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    const rotated = JSON.parse(readFileSync(rotatedFile, "utf8"));
    expect(
      (
        await box.run([
          "key",
          "revoke",
          "--local",
          "--publisher",
          bundle.publisherId,
          "--key",
          rotated.keyId,
        ])
      ).code,
    ).toBe(0);
    expect((await box.run(["key", "register", rotatedFile, "--local"])).stderr).toContain(
      "key_revoked",
    );
    expect((await upload(box)).stderr).toContain("unauthorized");
    const offlineFile = join(box.handoff, "offline.json");
    api.server.stop(true);
    const offline = await box.run([
      "key",
      "create",
      "--local",
      "--name",
      "Offline",
      "--out",
      offlineFile,
    ]);
    expect(offline.code).toBe(1);
    expect(existsSync(offlineFile)).toBe(true);
    const offlineToken = JSON.parse(readFileSync(offlineFile, "utf8")).token;
    expect(offline.stderr + offline.stdout).not.toContain(offlineToken);
  });

  test("untrusted files, credentials and servers are rejected without uploads or project secrets", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html("valid");
    symlinkSync(join(box.cwd, "note.html"), join(box.cwd, "link.html"));
    mkdirSync(join(box.cwd, "directory"));
    for (const file of ["link.html", "directory", "https://example.com/note.html"])
      expect((await box.run(["upload", file, "--local"])).code).toBe(1);
    box.html(Buffer.from([0xff]));
    expect((await upload(box)).stderr).toContain("invalid_utf8");
    box.html(Buffer.alloc(5_242_881));
    expect((await upload(box)).stderr).toContain("file_too_large");
    box.html("valid");
    expect((await upload(box, ["--title", "🧪".repeat(65)])).stderr).toContain("invalid_title");
    expect(api.calls).toHaveLength(0);
    const source = join(box.handoff, "credential.json");
    writeFileSync(
      source,
      JSON.stringify({
        server: api.origin,
        token: TOKEN,
        publisherId: PUBLISHER_ID,
        keyId: KEY_ID,
        label: "Test",
      }),
      { mode: 0o644 },
    );
    expect((await box.run(["login", "--local", "--credential-file", source])).stderr).toContain(
      "unsafe_private_file",
    );
    chmodSync(source, 0o600);
    symlinkSync(source, join(box.handoff, "symlink.json"));
    expect(
      (await box.run(["login", "--local", "--credential-file", join(box.handoff, "symlink.json")]))
        .stderr,
    ).toContain("unsafe_private_path");
    const projectCredential = join(box.cwd, "credential.json");
    writeFileSync(projectCredential, readFileSync(source), { mode: 0o600 });
    expect(
      (await box.run(["login", "--local", "--credential-file", projectCredential])).stderr,
    ).toContain("credential_inside_project");
    chmodSync(box.handoff, 0o755);
    expect((await box.run(["login", "--local", "--credential-file", source])).stderr).toContain(
      "unsafe_private_file",
    );
    chmodSync(box.handoff, 0o700);
    chmodSync(join(box.config, "profiles.json"), 0o644);
    expect((await box.run(["list", "--local"])).stderr).toContain("unsafe_private_file");
    chmodSync(join(box.config, "profiles.json"), 0o600);
    await login(box, api.origin, OWNER);
    const leaked = await box.run([
      "key",
      "create",
      "--local",
      "--name",
      "No",
      "--out",
      join(box.cwd, "secret.json"),
    ]);
    expect(leaked.stderr).toContain("credential_inside_project");
    expect(existsSync(join(box.cwd, "secret.json"))).toBe(false);
    for (const input of [
      "http://example.com",
      "http://127.0.0.1",
      "https://u:p@host",
      "https://host/path",
      "https://host/x/..",
      "https://host?q=x",
      "https://host#x",
      "https://host?",
      "https://host/#",
      "https://host\\evil",
    ])
      expect(() => normalizeServer(input)).toThrow();
    expect(normalizeServer("https://EXAMPLE.com:443/")).toBe("https://example.com");
    expect(normalizeServer("http://[::1]:1234/", true)).toBe("http://[::1]:1234");
  });

  test("bootstrap helper and copied standalone client require no repository modules", async () => {
    const box = sandbox();
    const copied = join(box.cwd, "share.ts");
    writeFileSync(copied, readFileSync(CLIENT));
    const bootstrap = Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { saveOwnerProfile, credentialHash } from ${JSON.stringify(copied)}; const token = await Bun.stdin.text(); saveOwnerProfile('https://example.com', token); console.log(credentialHash(token));`,
      ],
      {
        cwd: box.cwd,
        env: { ...process.env, NOTE_FRAMEWORK_CONFIG_DIR: box.config },
        stdin: new Blob([OWNER]),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(bootstrap.stdout).text(),
      new Response(bootstrap.stderr).text(),
      bootstrap.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(sha(`note-framework/owner/v1\0${OWNER}`));
    const profiles = JSON.parse(readFileSync(join(box.config, "profiles.json"), "utf8"));
    expect(profiles.profiles["https://example.com"]).toEqual({ owner: OWNER });
    const importedConfig = join(box.root, "never-created");
    const imported = Bun.spawn(
      [process.execPath, "-e", `await import(${JSON.stringify(copied)})`],
      {
        cwd: box.cwd,
        env: { ...process.env, NOTE_FRAMEWORK_CONFIG_DIR: importedConfig },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await imported.exited).toBe(0);
    expect(existsSync(importedConfig)).toBe(false);
  });

  test("exact maximum byte count succeeds, larger file fails before PUT", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html(Buffer.alloc(5_242_880, 0x61));
    const maximum = await upload(box);
    expect(maximum.code).toBe(0);
    expect(JSON.parse(maximum.stdout).bytes).toBe(5_242_880);
    box.html(Buffer.alloc(5_242_881, 0x61));
    expect((await upload(box)).stderr).toContain("file_too_large");
    expect(api.calls).toHaveLength(1);
  });

  test("titles reject all server control characters and bound inferred Unicode titles", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html("<title>Title</title>");
    for (const title of [
      "line\nfeed",
      "tab\tstop",
      "delete\x7f",
      "control\x85",
      "line\u2028separator",
      "paragraph\u2029separator",
    ]) {
      const result = await upload(box, ["--title", title]);
      expect(result.stderr).toContain("invalid_title");
      expect(result.stdout).toBe("");
    }
    expect(api.calls).toHaveLength(0);
    box.html("<title>" + "🧪".repeat(100_000) + "</title>");
    const result = await upload(box);
    expect(result.code).toBe(0);
    expect(Buffer.from(api.calls[0]!.title, "base64url").toString()).toBe("🧪".repeat(64));
  });

  test("lost commit response replays original receipt after another writer advances head, without rebase", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    box.html("first");
    api.corruptRaw = true;
    expect((await upload(box)).code).toBe(1);
    const id = api.calls[0]!.id;
    const external = await fetch(`${api.origin}/api/drafts/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "text/html; charset=utf-8",
        "If-Match": '"1"',
        "Idempotency-Key": "external-operation-1234",
        "X-Note-Title": Buffer.from("Peer").toString("base64url"),
      },
      body: "peer version",
    });
    expect(external.status).toBe(201);
    api.corruptRaw = false;
    box.html("my changed input");
    const recovered = JSON.parse((await upload(box)).stdout) as Receipt;
    expect(recovered.version).toBe(1);
    expect(recovered.sha256).toBe(sha("first"));
    expect((await upload(box)).stderr).toContain("stale_version");
    const explicit = JSON.parse(
      (await upload(box, ["--id", id, "--expect", "2"])).stdout,
    ) as Receipt;
    expect(explicit.version).toBe(3);
  });

  test("note resolves project cwd, exports only when needed, and uses source identity across rebuilds", async () => {
    const box = sandbox(),
      api = service();
    await login(box, api.origin);
    mkdirSync(join(box.cwd, "src", "notes", "example"), { recursive: true });
    writeFileSync(
      join(box.cwd, "package.json"),
      JSON.stringify({ scripts: { "note:html": "bun export.ts" } }),
    );
    writeFileSync(
      join(box.cwd, "export.ts"),
      `import {mkdirSync,writeFileSync} from 'node:fs'; mkdirSync('dist-example-single',{recursive:true}); writeFileSync('dist-example-single/index.html','<title>Example</title>'+Date.now()); console.log('build noisy');`,
    );
    const first = await box.run(["note", "example", "--local", "--json"]);
    expect(first.code).toBe(0);
    const receipt = JSON.parse(first.stdout) as Receipt;
    expect(first.stdout).not.toContain("build noisy");
    rmSync(join(box.cwd, "dist-example-single"), { recursive: true });
    const second = JSON.parse(
      (await box.run(["note", "example", "--local", "--json"])).stdout,
    ) as Receipt;
    expect(second.id).toBe(receipt.id);
    expect(second.version).toBe(2);
    const db = new Database(join(box.config, "state.sqlite"), { readonly: true });
    const publication = db.query<{ source: string }, []>("SELECT source FROM publications").get();
    db.close();
    expect(publication!.source).toBe(join(box.cwd, "src", "notes", "example"));
    api.failPut = true;
    expect((await box.run(["note", "example", "--local"])).code).toBe(1);
    writeFileSync(join(box.cwd, "export.ts"), "process.exit(1)");
    api.failPut = false;
    expect((await box.run(["note", "example", "--local"])).code).toBe(0);
  });
});
