import { afterEach, beforeEach, expect, test } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { decodeAttestationObject } from "@simplewebauthn/server/helpers";
import worker from "./public-worker";
import { TestDatabase } from "./public-testing";
import {
  base64url,
  decodeBase64url,
  utf8,
  PUBLISHER_HASH_DOMAIN,
  randomId,
  sha256,
  type Env,
} from "./protocol";

let db: TestDatabase,
  env: Env,
  server: ReturnType<typeof Bun.serve>,
  browser: Browser,
  context: BrowserContext,
  page: Page,
  authenticatorId: string;
const harness = `<!doctype html><meta charset="utf-8"><script src="/webauthn.js"></script><title>Passkey test</title>`;
beforeEach(async () => {
  db = new TestDatabase();
  await db.migrate();
  server = Bun.serve({
    hostname: "localhost",
    port: 0,
    fetch: (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/harness")
        return new Response(harness, { headers: { "Content-Type": "text/html" } });
      if (path === "/webauthn.js")
        return new Response(
          Bun.file(
            new URL(
              "../node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js",
              import.meta.url,
            ),
          ),
          { headers: { "Content-Type": "text/javascript" } },
        );
      return worker.fetch(request, env);
    },
  });
  env = {
    DB: db,
    PUBLIC_ORIGIN: `http://localhost:${server.port}`,
    OWNER_TOKEN_SHA256: "",
    ASSETS: { fetch: async () => new Response("static") },
  };
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  ({ authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  }));
  await page.goto(`${env.PUBLIC_ORIGIN}/harness`);
});
afterEach(async () => {
  await browser?.close();
  await server?.stop(true);
  db?.sqlite.close();
});
async function ceremony(kind: "register" | "login" | "passkeys", name = "Reader", verify = true) {
  return page.evaluate(
    async ({ kind, name, verify }) => {
      const post = async (path: string, value: unknown) =>
        fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Note-Request": "1" },
          body: JSON.stringify(value),
        });
      const optionsResponse = await post(`/auth/${kind}/options`, { label: name });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) return { status: optionsResponse.status, result: options };
      const client = (
        window as unknown as {
          SimpleWebAuthnBrowser: {
            startRegistration: (input: unknown) => Promise<unknown>;
            startAuthentication: (input: unknown) => Promise<unknown>;
          };
        }
      ).SimpleWebAuthnBrowser;
      const response = await (kind === "login"
        ? client.startAuthentication({ optionsJSON: options })
        : client.startRegistration({ optionsJSON: options }));
      if (!verify) return { status: 0, result: {}, response, options };
      const verified = await post(`/auth/${kind}/verify`, { response });
      return { status: verified.status, result: await verified.json(), response, options };
    },
    { kind, name, verify },
  );
}
async function request(path: string, method = "GET", value?: unknown) {
  return page.evaluate(
    async ({ path, method, value }) => {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", "X-Note-Request": "1" },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
      return { status: response.status, result: await response.json() };
    },
    { path, method, value },
  );
}
function count(table: string) {
  return (db.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

test("real discoverable passkey signup, logout and signature login", async () => {
  const signup = await ceremony("register");
  expect(signup.status).toBe(200);
  expect(signup.result).toEqual({ ok: true });
  expect(count("publishers")).toBe(1);
  expect(count("passkeys")).toBe(1);
  expect(count("auth_challenges")).toBe(0);
  const account = await request("/api/account");
  expect(account.status).toBe(200);
  expect(account.result.label).toBe("Reader");
  const cookies = await context.cookies();
  const auth = cookies.find((entry) => entry.name === "__Host-nf_session")!;
  expect(auth.httpOnly).toBe(true);
  expect(auth.secure).toBe(true);
  expect(auth.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("nf_session");
  expect((await request("/api/logout", "POST", {})).status).toBe(200);
  expect((await request("/api/account")).status).toBe(401);
  expect((await ceremony("login")).status).toBe(200);
  expect((await request("/api/account")).result.publisherId).toBe(account.result.publisherId);
  expect(count("publishers")).toBe(1);
});

test("backup enrollment and last-passkey deletion stay owned and atomic", async () => {
  expect((await ceremony("register")).status).toBe(200);
  const first = (await request("/api/account")).result.passkeys[0].id;
  expect((await request(`/api/passkeys/${first}`, "DELETE")).status).toBe(409);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  expect((await ceremony("passkeys", "Backup key")).status).toBe(200);
  const account = await request("/api/account");
  expect(account.result.passkeys).toHaveLength(2);
  expect((await request(`/api/passkeys/${first}`, "DELETE")).status).toBe(200);
  expect((await request("/api/account")).result.passkeys).toHaveLength(1);
});

test("ceremony replay and forged origin cannot create an account", async () => {
  const signup = await ceremony("register");
  expect(signup.status).toBe(200);
  expect(
    (await request("/auth/register/verify", "POST", { response: signup.response })).status,
  ).toBe(401);
  const response = await worker.fetch(
    new Request(`${env.PUBLIC_ORIGIN}/auth/register/options`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        "X-Note-Request": "1",
      },
      body: JSON.stringify({ label: "forged" }),
    }),
    env,
  );
  expect(response.status).toBe(403);
  expect(count("publishers")).toBe(1);
  const invalidBearer = await page.evaluate(
    async () => (await fetch("/api/me", { headers: { Authorization: "Bearer invalid" } })).status,
  );
  expect(invalidBearer).toBe(401);
});

test("agent approvals reveal no credential, recover and cannot resurrect revocation", async () => {
  await ceremony("register");
  const keyId = randomId(),
    token = `nf_pub_${keyId}.${base64url(crypto.getRandomValues(new Uint8Array(32)))}`,
    pollSecret = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const payload = {
    requestId: randomId(),
    keyId,
    tokenHash: await sha256(PUBLISHER_HASH_DOMAIN + token),
    pollHash: await sha256("note-framework/agent-poll/v1\0" + pollSecret),
    label: "Local agent",
  };
  const started = await request("/api/agent-grants", "POST", payload);
  expect(started.status).toBe(200);
  expect(started.result.verificationUrl).toBe(
    `${env.PUBLIC_ORIGIN}/agent/approve?request=${payload.requestId}`,
  );
  expect((await request("/api/agent-grants", "POST", payload)).result).toEqual(started.result);
  expect(
    (await request(`/api/agent-grants/${payload.requestId}/poll`, "POST", { pollSecret })).result
      .state,
  ).toBe("pending");
  expect(
    (
      await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(200);
  const poll = await request(`/api/agent-grants/${payload.requestId}/poll`, "POST", { pollSecret });
  expect(poll.result.state).toBe("approved");
  expect(poll.result.keyId).toBe(keyId);
  expect(JSON.stringify(poll.result)).not.toContain(token);
  expect(JSON.stringify(poll.result)).not.toContain(pollSecret);
  const me = await worker.fetch(
    new Request(`${env.PUBLIC_ORIGIN}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
    env,
  );
  expect(me.status).toBe(200);
  expect((await request(`/api/agents/${keyId}`, "DELETE")).status).toBe(200);
  expect(
    (
      await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await worker.fetch(
        new Request(`${env.PUBLIC_ORIGIN}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        env,
      )
    ).status,
  ).toBe(401);
});

test("expired session at transaction boundary cannot publish", async () => {
  await ceremony("register");
  const cookie = (await context.cookies()).find((entry) => entry.name === "__Host-nf_session")!;
  const keyId = /^nf_pub_([0-9a-f]{32})/.exec(cookie.value)![1]!;
  const draft = randomId();
  let triggered = false;
  db.beforeBatch = () => {
    if (triggered) return;
    triggered = true;
    db.sqlite.query("UPDATE api_keys SET expires_at=0 WHERE id=?").run(keyId);
  };
  const response = await worker.fetch(
    new Request(`${env.PUBLIC_ORIGIN}/api/drafts/${draft}`, {
      method: "PUT",
      headers: {
        Cookie: `${cookie.name}=${cookie.value}`,
        Origin: env.PUBLIC_ORIGIN,
        "X-Note-Request": "1",
        "Content-Type": "text/html; charset=utf-8",
        "Idempotency-Key": randomId(),
        "If-Match": '"0"',
      },
      body: "<h1>Never stored</h1>",
    }),
    env,
  );
  expect(response.status).toBe(401);
  expect(count("versions")).toBe(0);
  expect(count("drafts")).toBe(0);
});

test("global retained-body cap rolls back the complete upload", async () => {
  await ceremony("register");
  db.sqlite.exec("UPDATE public_settings SET max_bytes=1 WHERE id=1");
  const result = await page.evaluate(async (draft) => {
    const response = await fetch(`/api/drafts/${draft}`, {
      method: "PUT",
      headers: {
        "X-Note-Request": "1",
        "Content-Type": "text/html; charset=utf-8",
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": '"0"',
      },
      body: "<h1>too big</h1>",
    });
    return response.status;
  }, randomId());
  expect(result).toBe(429);
  expect(count("drafts")).toBe(0);
  expect(count("versions")).toBe(0);
  expect(count("body_chunks")).toBe(0);
});

test("real attestation rejects wrong origin, challenge, RP hash and absent user verification", async () => {
  const prepared = await ceremony("register", "Protected", false);
  const original = prepared.response as {
    response: { clientDataJSON: string; attestationObject: string };
  };
  const clientData = JSON.parse(
    new TextDecoder().decode(decodeBase64url(original.response.clientDataJSON)),
  );
  for (const change of [
    { origin: "https://evil.example" },
    { challenge: base64url(crypto.getRandomValues(new Uint8Array(32))) },
  ]) {
    const forged = structuredClone(original);
    forged.response.clientDataJSON = base64url(utf8(JSON.stringify({ ...clientData, ...change })));
    const result = await request("/auth/register/verify", "POST", { response: forged });
    expect(result.status).toBe(400);
    expect(result.result.error.code).toBe("passkey_invalid");
  }
  const attestation = decodeBase64url(original.response.attestationObject);
  const authData = decodeAttestationObject(attestation).get("authData");
  const start = attestation.findIndex((_value, index) =>
    authData.every((value, offset) => attestation[index + offset] === value),
  );
  expect(start).toBeGreaterThanOrEqual(0);
  for (const offset of [0, 32]) {
    const forged = structuredClone(original),
      modified = attestation.slice();
    modified[start + offset] = modified[start + offset]! ^ (offset === 32 ? 4 : 1);
    forged.response.attestationObject = base64url(modified);
    expect((await request("/auth/register/verify", "POST", { response: forged })).status).toBe(400);
  }
  expect(count("publishers")).toBe(0);
  expect((await request("/auth/register/verify", "POST", { response: original })).status).toBe(200);
});

test("assertion signature and user handle are checked against the stored credential", async () => {
  await ceremony("register");
  await request("/api/logout", "POST", {});
  const prepared = await ceremony("login", "Reader", false);
  const original = prepared.response as { response: { signature: string; userHandle: string } };
  const wrongHandle = structuredClone(original);
  wrongHandle.response.userHandle = base64url(utf8(randomId()));
  expect((await request("/auth/login/verify", "POST", { response: wrongHandle })).status).toBe(401);
  const wrongSignature = structuredClone(original),
    bytes = decodeBase64url(wrongSignature.response.signature);
  bytes[bytes.length - 1] = bytes.at(-1)! ^ 1;
  wrongSignature.response.signature = base64url(bytes);
  expect((await request("/auth/login/verify", "POST", { response: wrongSignature })).status).toBe(
    401,
  );
  expect((await request("/auth/login/verify", "POST", { response: original })).status).toBe(200);
  expect((await request("/auth/login/verify", "POST", { response: original })).status).toBe(401);
});

test("challenge cookies bind browsers and expiry blocks verified signatures", async () => {
  const prepared = await ceremony("register", "Reader", false);
  const cookie = (await context.cookies()).find((entry) => entry.name === "__Host-nf_challenge")!;
  await context.clearCookies();
  expect(
    (await request("/auth/register/verify", "POST", { response: prepared.response })).status,
  ).toBe(401);
  await context.addCookies([cookie]);
  db.sqlite.exec("UPDATE auth_challenges SET expires_at=0");
  expect(
    (await request("/auth/register/verify", "POST", { response: prepared.response })).status,
  ).toBe(401);
  expect(count("publishers")).toBe(0);
});

test("a competing account cannot acquire a completed grant or inspect another note", async () => {
  await ceremony("register", "First");
  const firstAccount = (await request("/api/account")).result.publisherId;
  const keyId = randomId(),
    pollSecret = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const payload = {
    requestId: randomId(),
    keyId,
    tokenHash: await sha256("first-agent"),
    pollHash: await sha256("note-framework/agent-poll/v1\0" + pollSecret),
    label: "First agent",
  };
  await request("/api/agent-grants", "POST", payload);
  await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", { decision: "approve" });
  const draftId = randomId();
  const published = await page.evaluate(async (draftId) => {
    const response = await fetch(`/api/drafts/${draftId}`, {
      method: "PUT",
      headers: {
        "X-Note-Request": "1",
        "Content-Type": "text/html; charset=utf-8",
        "Idempotency-Key": crypto.randomUUID(),
        "If-Match": '"0"',
      },
      body: "<h1>First account</h1>",
    });
    return response.status;
  }, draftId);
  expect(published).toBe(201);
  await request("/api/logout", "POST", {});
  await ceremony("register", "Second");
  expect((await request("/api/account")).result.publisherId).not.toBe(firstAccount);
  expect(
    (
      await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(409);
  expect((await request(`/api/agents/${keyId}`, "DELETE")).status).toBe(404);
  expect((await request(`/api/drafts/${draftId}`)).status).toBe(404);
  expect(
    await page.evaluate(async (draftId) => (await fetch(`/d/${draftId}`)).status, draftId),
  ).toBe(200);
});

test("rate and JSON size bounds do not grow state after rejection", async () => {
  const ip = await sha256("note-framework/auth-rate/v1\0local"),
    window = Math.floor(Date.now() / 600000);
  db.sqlite
    .query("INSERT INTO auth_rates(bucket,count,expires_at) VALUES (?,60,?)")
    .run(`ip:${ip}:${window}`, Date.now() + 600000);
  const options = await request("/auth/login/options", "POST", {});
  expect(options.status).toBe(429);
  expect(count("auth_challenges")).toBe(0);
  const tooLarge = await request("/auth/register/options", "POST", { label: "x".repeat(16384) });
  expect(tooLarge.status).toBe(413);
  expect(count("auth_challenges")).toBe(0);
});

test("ninth verified sign-in replaces only the oldest session atomically", async () => {
  await ceremony("register");
  const cookies = [(await context.cookies()).find((entry) => entry.name === "__Host-nf_session")!];
  for (let index = 0; index < 8; index++) {
    expect((await ceremony("login")).status).toBe(200);
    cookies.push((await context.cookies()).find((entry) => entry.name === "__Host-nf_session")!);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  expect(count("browser_sessions")).toBe(8);
  const check = async (value: string) =>
    (
      await worker.fetch(
        new Request(`${env.PUBLIC_ORIGIN}/api/account`, {
          headers: { Cookie: `__Host-nf_session=${value}` },
        }),
        env,
      )
    ).status;
  expect(await check(cookies[0]!.value)).toBe(401);
  for (const entry of cookies.slice(1)) expect(await check(entry.value)).toBe(200);
});

test("counter change after cryptographic verification fails the atomic login guard", async () => {
  await ceremony("register");
  const prepared = await ceremony("login", "Reader", false);
  let advanced = false;
  db.beforeBatch = () => {
    if (advanced) return;
    advanced = true;
    db.sqlite.exec("UPDATE passkeys SET counter=counter+1");
  };
  expect(
    (await request("/auth/login/verify", "POST", { response: prepared.response })).status,
  ).toBe(409);
  expect(count("browser_sessions")).toBe(1);
  expect(count("auth_challenges")).toBe(1);
});

test("expired backup sessions cannot enroll a new passkey during the commit race", async () => {
  await ceremony("register");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const prepared = await ceremony("passkeys", "Backup", false);
  db.beforeBatch = () => {
    db.sqlite.exec("UPDATE api_keys SET expires_at=0");
  };
  expect(
    (await request("/auth/passkeys/verify", "POST", { response: prepared.response })).status,
  ).toBe(409);
  expect(count("passkeys")).toBe(1);
});

test("account and ceremony caps leave no partially created identities", async () => {
  const prepared = await ceremony("register", "No capacity", false);
  db.sqlite
    .query(
      `WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n<1000) INSERT INTO publishers(id,label,quota_bytes,created_at) SELECT printf('%032x',n),'Fixture',0,0 FROM sequence`,
    )
    .run();
  expect(
    (await request("/auth/register/verify", "POST", { response: prepared.response })).status,
  ).toBe(409);
  expect(count("publishers")).toBe(1000);
  expect(count("passkeys")).toBe(0);
  expect(count("browser_sessions")).toBe(0);
  db.sqlite.exec("DELETE FROM auth_challenges");
  db.sqlite
    .query(
      `WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM sequence WHERE n<2000) INSERT INTO auth_challenges(id,challenge,kind,label,expires_at) SELECT printf('%064x',n),'fixture','login','',? FROM sequence`,
    )
    .run(Date.now() + 600000);
  expect((await request("/auth/login/options", "POST", {})).status).toBe(429);
  expect(count("auth_challenges")).toBe(2000);
});

test("agent metadata cap survives revocation while denial remains available", async () => {
  await ceremony("register");
  const publisherId = (await request("/api/account")).result.publisherId;
  db.sqlite.transaction(() => {
    for (let n = 1; n <= 64; n++) {
      const key = n.toString(16).padStart(32, "0");
      db.sqlite
        .query(
          "INSERT INTO api_keys(id,publisher_id,token_hash,revoked,created_at) VALUES (?,?,?,1,0)",
        )
        .run(key, publisherId, n.toString(16).padStart(64, "0"));
      db.sqlite
        .query("INSERT INTO agent_keys(key_id,publisher_id,label) VALUES (?,?,'Old agent')")
        .run(key, publisherId);
    }
  })();
  const keyId = randomId(),
    payload = {
      requestId: randomId(),
      keyId,
      tokenHash: await sha256("capped-agent"),
      pollHash: await sha256("capped-poll"),
      label: "Another agent",
    };
  await request("/api/agent-grants", "POST", payload);
  expect(
    (
      await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", {
        decision: "approve",
      })
    ).status,
  ).toBe(409);
  expect(count("agent_keys")).toBe(64);
  expect(
    (await request(`/api/agent-grants/${payload.requestId}/decision`, "POST", { decision: "deny" }))
      .status,
  ).toBe(200);
});
