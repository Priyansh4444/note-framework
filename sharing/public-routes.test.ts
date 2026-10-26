import { expect, test } from "bun:test";
import worker from "./public-worker";
import { utf8, type Env } from "./protocol";

const origin = "https://notes.example";
function environment(html = "<script>globalThis.shipped = true;</script>"): Env {
  return {
    PUBLIC_ORIGIN: origin,
    OWNER_TOKEN_SHA256: "",
    DB: {
      prepare() {
        throw new Error("Static routes must not access account storage");
      },
      async batch() {
        throw new Error("Static routes must not write account storage");
      },
    },
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        return new Response(path.endsWith(".webp") ? "preview" : html, {
          headers: {
            "Content-Type": path.endsWith(".webp") ? "image/webp" : "text/html",
            "Content-Encoding": "identity",
            "Content-Length": "1",
          },
        });
      },
    },
  };
}

test("owned study documents and preview images are reachable without account authority", async () => {
  const env = environment();
  for (const slug of ["hairline", "mechanical-arm", "morph", "ink"]) {
    const response = await worker.fetch(new Request(`${origin}/studies/${slug}/index.html`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("'sha256-");
  }
  for (const slug of ["hairline", "mechanical-arm", "morph", "ink", "anatomy"]) {
    const response = await worker.fetch(
      new Request(`${origin}/studies/previews/${slug}.webp`),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
  }
  expect((await worker.fetch(new Request(`${origin}/studies/private.txt`), env)).status).toBe(404);
});

test("only shipped inline study scripts receive exact CSP hashes; HEAD preserves the policy", async () => {
  const script = "globalThis.shipped = true;\n";
  const env = environment(
    `<script type="module">${script}</script><script src="/assets/external.js"></script>`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(script)));
  const hash = btoa(String.fromCharCode(...digest));
  const response = await worker.fetch(new Request(`${origin}/studies/morph/index.html`), env);
  const policy = response.headers.get("Content-Security-Policy")!;
  expect(policy).toContain(`script-src 'self' 'sha256-${hash}'`);
  expect(policy.match(/script-src[^;]+/)![0]).not.toContain("unsafe-inline");
  expect(policy).toContain("font-src 'self' data:");
  expect(response.headers.has("Content-Encoding")).toBe(false);
  expect(response.headers.has("Content-Length")).toBe(false);
  const head = await worker.fetch(
    new Request(`${origin}/studies/morph/index.html`, { method: "HEAD" }),
    env,
  );
  expect(head.headers.get("Content-Security-Policy")).toBe(policy);
  expect(await head.text()).toBe("");
  const account = await worker.fetch(new Request(`${origin}/account`), env);
  expect(account.headers.get("Content-Security-Policy")).not.toContain("sha256-");
});

test("resource MIME types and canonical page aliases remain native documents", async () => {
  const env = environment();
  for (const path of ["/llms.txt", "/starter.sha256", "/cli.ts", "/skill.md"]) {
    const response = await worker.fetch(new Request(origin + path), env);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  }
  for (const [path, target] of [
    ["/docs/?from=home", "/docs?from=home"],
    ["/studies/morph", "/studies/morph/index.html"],
    ["/account/", "/account"],
  ]) {
    const response = await worker.fetch(new Request(origin + path), env);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(target);
  }
});
