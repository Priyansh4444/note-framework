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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { credentialHash } from "./share";

const client = join(import.meta.dir, "share.ts");
const publisherId = "a".repeat(32);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Pending = {
  requestId: string;
  keyId: string;
  token: string;
  pollSecret: string;
  expiresAt: number | null;
  state: string;
  createdAt: number;
};
type Start = {
  requestId: string;
  keyId: string;
  tokenHash: string;
  pollHash: string;
  label: string;
};
type Grant = { start: Start; expiresAt: number; approved: boolean; polls: number };

async function until(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error("CLI fixture did not reach the expected request");
    await Bun.sleep(10);
  }
}
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "nf-login-test-"));
  chmodSync(root, 0o700);
  const cwd = join(root, "project"),
    config = join(root, "private");
  mkdirSync(cwd);
  writeFileSync(join(cwd, "package.json"), "{}");
  const children = new Set<ReturnType<typeof Bun.spawn>>();
  cleanups.push(() => {
    for (const child of children) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  });
  function spawn(args: string[]) {
    const child = Bun.spawn([process.execPath, client, ...args], {
      cwd,
      env: { ...process.env, NOTE_FRAMEWORK_CONFIG_DIR: config },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    children.add(child);
    return child;
  }
  async function result(child: ReturnType<typeof spawn>) {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    children.delete(child);
    return { stdout, stderr, code };
  }
  const journalPath = (origin: string) => join(config, `login-${hash(origin)}.sqlite`);
  function pending(origin: string): Pending | null {
    const db = new Database(journalPath(origin), { readonly: true });
    try {
      const row = db
        .query<{ record: string }, []>("SELECT record FROM pending_login WHERE id=1")
        .get();
      return row ? JSON.parse(row.record) : null;
    } finally {
      db.close();
    }
  }
  return {
    root,
    config,
    spawn,
    result,
    pending,
    journalPath,
    run: (args: string[]) => result(spawn(args)),
  };
}
function service() {
  const starts: Start[] = [],
    pollTimes: number[] = [];
  const grants = new Map<string, Grant>();
  let mode: "approve" | "two-polls" | "pending" | "denied" | "expired" = "approve";
  let loseInit = false,
    loseApproval = false;
  let corruptStart: "verificationUrl" | "fingerprint" | "expiresAt" | undefined;
  let corruptApproval: "keyId" | "publisherId" | undefined;
  let holdPoll: Promise<void> | undefined;
  let onStart: (() => void) | undefined;
  const error = (status: number) =>
    Response.json(
      {
        error: {
          code: status === 401 ? "unauthorized" : "unavailable",
          message: "Do not echo this response",
        },
      },
      { status },
    );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (path === "/api/me") {
        const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
        const keyId = /^nf_pub_([0-9a-f]{32})\./.exec(token)?.[1];
        const grant = [...grants.values()].find(
          (grant) =>
            grant.approved &&
            grant.start.keyId === keyId &&
            grant.start.tokenHash === credentialHash(token),
        );
        return grant
          ? Response.json({
              publisherId,
              keyId,
              label: "Author",
              maxBytes: 5242880,
              quotaBytes: 33554432,
              usedBytes: 0,
            })
          : error(401);
      }
      if (path === "/api/agent-grants") {
        expect(request.method).toBe("POST");
        expect(request.headers.get("Authorization")).toBeNull();
        const value = (await request.json()) as Start;
        starts.push(value);
        const previous = grants.get(value.requestId);
        if (previous) expect(value).toEqual(previous.start);
        const grant = previous ?? {
          start: value,
          expiresAt: Date.now() + 600000,
          approved: false,
          polls: 0,
        };
        grants.set(value.requestId, grant);
        onStart?.();
        if (loseInit) {
          loseInit = false;
          return error(503);
        }
        const receipt: Record<string, unknown> = {
          requestId: value.requestId,
          verificationUrl: `${server.url.origin}/agent/approve?request=${value.requestId}`,
          expiresAt: grant.expiresAt,
          fingerprint: value.tokenHash.slice(0, 12).match(/.{3}/g)!.join(" "),
        };
        if (corruptStart === "verificationUrl")
          receipt.verificationUrl = "https://attacker.example/approve";
        if (corruptStart === "fingerprint") receipt.fingerprint = "000 000 000 000";
        if (corruptStart === "expiresAt") receipt.expiresAt = Date.now() + 3600000;
        return Response.json(receipt);
      }
      const match = /^\/api\/agent-grants\/([0-9a-f]{32})\/poll$/.exec(path);
      if (match) {
        const grant = grants.get(match[1]!);
        if (!grant) return error(404);
        const value = (await request.json()) as { pollSecret: string };
        expect(hash("note-framework/agent-poll/v1\0" + value.pollSecret)).toBe(
          grant.start.pollHash,
        );
        expect(request.headers.get("Authorization")).toBeNull();
        pollTimes.push(Date.now());
        grant.polls++;
        const pollMode = mode;
        if (holdPoll) await holdPoll;
        const state =
          pollMode === "approve" || (pollMode === "two-polls" && grant.polls > 1)
            ? "approved"
            : pollMode === "two-polls"
              ? "pending"
              : pollMode;
        if (state === "approved") grant.approved = true;
        if (loseApproval && grant.approved) {
          loseApproval = false;
          return error(503);
        }
        return Response.json({
          state,
          expiresAt: grant.expiresAt,
          ...(grant.approved
            ? {
                publisherId: corruptApproval === "publisherId" ? "c".repeat(32) : publisherId,
                keyId: corruptApproval === "keyId" ? "d".repeat(32) : grant.start.keyId,
              }
            : {}),
        });
      }
      return error(404);
    },
  });
  cleanups.push(() => server.stop(true));
  return {
    origin: server.url.origin,
    starts,
    grants,
    pollTimes,
    set mode(value: typeof mode) {
      mode = value;
    },
    set loseInit(value: boolean) {
      loseInit = value;
    },
    set loseApproval(value: boolean) {
      loseApproval = value;
    },
    set corruptStart(value: typeof corruptStart) {
      corruptStart = value;
    },
    set corruptApproval(value: typeof corruptApproval) {
      corruptApproval = value;
    },
    set holdPoll(value: typeof holdPoll) {
      holdPoll = value;
    },
    set onStart(value: typeof onStart) {
      onStart = value;
    },
  };
}
const loginArgs = (origin: string, extra: string[] = []) => [
  "login",
  "--local",
  "--server",
  origin,
  ...extra,
];

describe("public agent login subprocess", () => {
  test("journals before the first grant, polls no faster than two seconds and saves a verified private profile", async () => {
    const box = sandbox(),
      api = service();
    api.mode = "two-polls";
    let durable: Pending | null = null;
    api.onStart = () => {
      durable = box.pending(api.origin);
    };
    const result = await box.run(loginArgs(api.origin, ["--name", "My coding agent"]));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const pending = durable as Pending | null;
    expect(pending).not.toBeNull();
    if (!pending) throw new Error("No committed journal");
    expect(api.starts[0]!.tokenHash).toBe(credentialHash(pending.token));
    expect(api.starts[0]!.requestId).toBe(pending.requestId);
    expect(result.stdout).toContain(`/agent/approve?request=${pending.requestId}`);
    expect(result.stdout).toContain(
      api.starts[0]!.tokenHash.slice(0, 12).match(/.{3}/g)!.join(" "),
    );
    expect(result.stdout).toEndWith("Logged in.\n");
    expect(result.stdout + result.stderr).not.toContain(pending.token);
    expect(result.stdout + result.stderr).not.toContain(pending.pollSecret);
    expect(api.pollTimes[1]! - api.pollTimes[0]!).toBeGreaterThanOrEqual(1900);
    expect(box.pending(api.origin)).toBeNull();
    const profiles = JSON.parse(readFileSync(join(box.config, "profiles.json"), "utf8"));
    expect(profiles.profiles[api.origin].publisher).toBe(pending.token);
    expect(profiles.defaultServer).toBe(api.origin);
    expect(statSync(box.config).mode & 0o777).toBe(0o700);
    for (const name of readdirSync(box.config))
      expect(statSync(join(box.config, name)).mode & 0o777).toBe(0o600);
    expect((await box.run(["login", "--local"])).code).toBe(0);
    expect(api.starts).toHaveLength(1);
  }, 10000);

  test("lost initialization response retries the exact private binding, and changed labels need an explicit new attempt", async () => {
    const box = sandbox(),
      api = service();
    api.loseInit = true;
    const failed = await box.run(loginArgs(api.origin, ["--name", "Original"]));
    expect(failed.stderr).toBe("share: unavailable\n");
    const pending = box.pending(api.origin)!;
    expect(pending.requestId).toBe(api.starts[0]!.requestId);
    expect(existsSync(join(box.config, "profiles.json"))).toBe(false);
    expect((await box.run(loginArgs(api.origin, ["--name", "Changed"]))).stderr).toContain(
      "pending_login_exists",
    );
    const recovered = await box.run(loginArgs(api.origin));
    expect(recovered.code).toBe(0);
    expect(api.starts).toHaveLength(2);
    expect(api.starts[1]).toEqual(api.starts[0]);
    expect(recovered.stdout + failed.stderr).not.toContain(pending.token);
    expect(recovered.stdout + failed.stderr).not.toContain(pending.pollSecret);
  });

  test("lost approved poll response recovers through the local credential without another grant", async () => {
    const box = sandbox(),
      api = service();
    api.loseApproval = true;
    const failed = await box.run(loginArgs(api.origin));
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("unavailable");
    const original = box.pending(api.origin)!;
    const recovered = await box.run(loginArgs(api.origin));
    expect(recovered).toEqual({ code: 0, stdout: "Logged in.\n", stderr: "" });
    expect(api.starts).toHaveLength(1);
    expect(api.pollTimes).toHaveLength(1);
    expect(
      JSON.parse(readFileSync(join(box.config, "profiles.json"), "utf8")).profiles[api.origin]
        .publisher,
    ).toBe(original.token);
  });

  test("killed pending process releases its origin lock and resumes the same key and grant", async () => {
    const box = sandbox(),
      api = service();
    api.mode = "pending";
    let release!: () => void;
    api.holdPoll = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = box.spawn(loginArgs(api.origin));
    await until(() => api.pollTimes.length === 1);
    const original = box.pending(api.origin)!;
    const competing = box.spawn(loginArgs(api.origin));
    first.kill("SIGKILL");
    await box.result(first);
    api.mode = "approve";
    api.holdPoll = undefined;
    release();
    const resumed = await box.result(competing);
    expect(resumed.code).toBe(0);
    expect(api.starts).toHaveLength(2);
    expect(api.starts[1]).toEqual(api.starts[0]);
    expect(api.starts[1]!.keyId).toBe(original.keyId);
    expect(box.pending(api.origin)).toBeNull();
  }, 10000);

  test("a competing live login cannot overwrite the pending key", async () => {
    const box = sandbox(),
      api = service();
    let release!: () => void;
    api.holdPoll = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = box.spawn(loginArgs(api.origin));
    await until(() => api.pollTimes.length === 1);
    const original = box.pending(api.origin)!;
    const competing = box.run(loginArgs(api.origin, ["--new"]));
    const result = await Promise.race([
      competing,
      Bun.sleep(4000).then(() => ({
        code: -1,
        stdout: "",
        stderr: "Login did not reject its occupied lock",
      })),
    ]);
    api.holdPoll = undefined;
    release();
    await box.result(first);
    await competing;
    expect(result.stderr).toBe("share: login_in_progress\n");
    expect(result.code).toBe(1);
    expect(api.starts).toHaveLength(1);
    expect(api.starts[0]!.keyId).toBe(original.keyId);
  }, 10000);

  for (const terminal of ["denied", "expired"] as const) {
    test(`${terminal} is durable and requires --new before replacing the credential`, async () => {
      const box = sandbox(),
        api = service();
      api.mode = terminal;
      expect((await box.run(loginArgs(api.origin))).stderr).toContain(`login_${terminal}`);
      const original = box.pending(api.origin)!;
      expect(original.state).toBe(terminal);
      expect((await box.run(loginArgs(api.origin))).stderr).toContain(`login_${terminal}`);
      expect(api.starts).toHaveLength(1);
      api.mode = "approve";
      expect((await box.run(loginArgs(api.origin, ["--new"]))).code).toBe(0);
      expect(api.starts[1]!.keyId).not.toBe(original.keyId);
      expect(api.starts[1]!.requestId).not.toBe(original.requestId);
    });
  }

  for (const corrupt of ["verificationUrl", "fingerprint", "expiresAt"] as const) {
    test(`rejects a malformed ${corrupt} instead of printing an untrusted approval link`, async () => {
      const box = sandbox(),
        api = service();
      api.corruptStart = corrupt;
      const result = await box.run(loginArgs(api.origin));
      expect(result.code).toBe(1);
      expect(result.stderr).toBe("share: invalid_response\n");
      expect(result.stdout).toBe("");
      expect(api.pollTimes).toHaveLength(0);
      expect(box.pending(api.origin)).not.toBeNull();
      expect(existsSync(join(box.config, "profiles.json"))).toBe(false);
    });
  }

  for (const corrupt of ["keyId", "publisherId"] as const) {
    test(`checks approved ${corrupt} against the locally held credential before saving`, async () => {
      const box = sandbox(),
        api = service();
      api.corruptApproval = corrupt;
      const result = await box.run(loginArgs(api.origin));
      expect(result.code).toBe(1);
      expect(result.stderr).toBe("share: identity_mismatch\n");
      const pending = box.pending(api.origin)!;
      expect(result.stdout + result.stderr).not.toContain(pending.token);
      expect(result.stdout + result.stderr).not.toContain(pending.pollSecret);
      expect(existsSync(join(box.config, "profiles.json"))).toBe(false);
    });
  }
});
