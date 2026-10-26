import { createHash, randomBytes } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "./browser-test";

const origin = process.env.PUBLIC_TEST_URL;
test.skip(
  !origin,
  "Set PUBLIC_TEST_URL to the real local/public Worker to test passkey publishing.",
);
test.use({ baseURL: origin });

async function authenticator(page: Page, context: BrowserContext) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const added = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, id: added.authenticatorId };
}

async function signUp(page: Page, name: string) {
  await page.goto(`${origin}/account`);
  await page.getByLabel("Name for your notes").fill(name);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
}

async function account(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/account");
    if (!response.ok) throw new Error(`Account request failed: ${response.status}`);
    return response.json() as Promise<{
      publisherId: string;
      passkeys: { id: string; label: string }[];
      agents: { keyId: string; label: string }[];
    }>;
  });
}

async function noOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    background: getComputedStyle(document.body).backgroundColor,
    commandFont: document.querySelector(".account-command code")
      ? parseFloat(getComputedStyle(document.querySelector(".account-command code")!).fontSize)
      : null,
    controls: [...document.querySelectorAll(".account-column input, .account-column pre")].map(
      (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      },
    ),
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.width);
  expect(geometry.body).toBeLessThanOrEqual(geometry.width);
  expect(geometry.background).toBe("rgb(5, 5, 5)");
  if (geometry.commandFont !== null) expect(geometry.commandFont).toBeGreaterThanOrEqual(12);
  for (const control of geometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(geometry.width + 1);
  }
}

test("public app routes preserve their URL without the asset HTML redirect loop", async ({
  page,
}) => {
  for (const path of ["/account", "/notes/framework-demo", "/"]) {
    const response = await page.goto(`${origin}${path}`);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(page.locator('a[href="/account"]').first()).toBeVisible();
  await expect(page.getByLabel("Publishing token", { exact: true })).toHaveCount(0);
});

test("real passkey account supports backup enrollment, removal, logout and signature login", async ({
  page,
  context,
}, testInfo) => {
  const primary = await authenticator(page, context);
  await signUp(page, "Passkey reader");
  const original = await account(page);
  expect(original.passkeys).toHaveLength(1);
  const keys = page.getByRole("region", { name: "Keep a spare key." });
  await expect(keys.getByRole("button", { name: /^Remove/ })).toBeDisabled();
  const originalSession = (await context.cookies()).find(
    (cookie) => cookie.name === "__Host-nf_session",
  );
  expect(originalSession).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("nf_session");
  await primary.cdp.send("WebAuthn.setAutomaticPresenceSimulation", {
    authenticatorId: primary.id,
    enabled: false,
  });
  const backup = await primary.cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.getByLabel("Passkey name", { exact: true }).fill("Spare key");
  await page.getByRole("button", { name: "Add a backup passkey", exact: true }).click();
  await expect(keys.getByRole("button", { name: "Remove Spare key", exact: true })).toBeVisible();
  expect((await account(page)).passkeys).toHaveLength(2);
  await keys
    .getByRole("listitem")
    .filter({ hasText: "Spare key" })
    .getByRole("button", { name: /^Remove/ })
    .click();
  await expect(keys.getByRole("button", { name: "Remove Spare key", exact: true })).toHaveCount(0);
  expect((await account(page)).passkeys).toHaveLength(1);
  await expect(keys.getByRole("button", { name: /^Remove/ })).toBeDisabled();
  await primary.cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId: backup.authenticatorId,
  });
  await primary.cdp.send("WebAuthn.setAutomaticPresenceSimulation", {
    authenticatorId: primary.id,
    enabled: true,
  });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`account-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with a passkey", exact: true }),
  ).toBeVisible();
  const oldSessionStatus = await context.request.get(`${origin}/api/me`, {
    headers: { Authorization: `Bearer ${originalSession!.value}` },
  });
  expect(oldSessionStatus.status()).toBe(401);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.getByRole("button", { name: "Sign in with a passkey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your notes", exact: true })).toBeVisible();
  expect((await account(page)).publisherId).toBe(original.publisherId);
});

test("browser publishing verifies exact bytes, preserves versions and separates authors", async ({
  page,
  context,
  browser,
}) => {
  await authenticator(page, context);
  await signUp(page, "Note author");
  const original = Buffer.from(
    '\uFEFF<!doctype html>\r\n<meta charset="utf-8"><h1>A note about curves</h1>\r\n<p>π → ∞</p>\r\n',
  );
  await page
    .getByLabel("Self-contained HTML · up to 5 MiB")
    .setInputFiles({ name: "curves.html", mimeType: "text/html", buffer: original });
  await page.getByLabel("Title", { exact: true }).fill("A note about curves");
  await page.getByRole("button", { name: "Publish HTML", exact: true }).click();
  const link = page.getByRole("link", { name: /Open share link/ });
  await expect(link).toBeVisible();
  const path = await link.getAttribute("href");
  expect(path).toMatch(/\/d\/[0-9a-f]{32}$/);
  const id = path!.split("/").at(-1)!;
  await expect(page.getByRole("link", { name: "A note about curves", exact: true })).toBeVisible();
  const raw = await context.request.get(`${origin}/raw/${id}/v/1`);
  expect(raw.status()).toBe(200);
  expect(await raw.body()).toEqual(original);
  expect(raw.headers()["content-security-policy"]).toContain("sandbox");
  await page.getByRole("button", { name: "Save a new version", exact: true }).click();
  await expect(page.getByRole("link", { name: "This version", exact: true })).toHaveAttribute(
    "href",
    `${origin}/d/${id}/v/2`,
  );
  expect(await (await context.request.get(`${origin}/raw/${id}/v/1`)).body()).toEqual(original);

  const otherContext = await browser.newContext({ colorScheme: "dark" });
  const otherPage = await otherContext.newPage();
  const errors: string[] = [];
  otherPage.on("pageerror", (error) => errors.push(error.message));
  try {
    await authenticator(otherPage, otherContext);
    await signUp(otherPage, "Another author");
    await expect(
      otherPage.getByRole("link", { name: "A note about curves", exact: true }),
    ).toHaveCount(0);
    expect((await otherContext.request.get(`${origin}/api/drafts/${id}`)).status()).toBe(404);
    const visible = await otherContext.request.get(`${origin}/d/${id}/v/1`);
    expect(visible.status()).toBe(200);
    const viewer = await visible.text();
    expect(viewer).toContain('sandbox="allow-scripts"');
    expect(viewer).not.toContain("allow-same-origin");

    // Another tab can change the browser identity before this page refreshes.
    // Delay the real new-owner listing to catch mixed identity/list rendering.
    await context.addCookies(await otherContext.cookies());
    let releaseListing = () => {};
    let listingArrived = () => {};
    const held = new Promise<void>((resolve) => {
      releaseListing = resolve;
    });
    const arrived = new Promise<void>((resolve) => {
      listingArrived = resolve;
    });
    await page.route("**/api/drafts?limit=20", async (route) => {
      const response = await route.fetch();
      listingArrived();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page.getByLabel("Passkey name", { exact: true }).fill("Switched session key");
      await page.getByRole("button", { name: "Add a backup passkey", exact: true }).click();
      await arrived;
      await expect(page.locator(".account-section-heading .account-hint")).toHaveText(
        "Note author",
      );
      releaseListing();
      await expect(page.locator(".account-section-heading .account-hint")).toHaveText(
        "Another author",
      );
      await expect(
        page.getByRole("link", { name: "A note about curves", exact: true }),
      ).toHaveCount(0);
    } finally {
      releaseListing();
      await page.unroute("**/api/drafts?limit=20");
    }
    expect(errors).toEqual([]);
  } finally {
    await otherContext.close();
  }
});

test("agent approval binds the visible fingerprint and disconnection permanently removes publishing", async ({
  page,
  context,
}, testInfo) => {
  await authenticator(page, context);
  await signUp(page, "Agent owner");
  const keyId = randomBytes(16).toString("hex");
  const token = `nf_pub_${keyId}.${randomBytes(32).toString("base64url")}`;
  const pollSecret = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256")
    .update("note-framework/publisher/v1\0" + token)
    .digest("hex");
  const requestId = randomBytes(16).toString("hex");
  const start = await context.request.post(`${origin}/api/agent-grants`, {
    data: {
      requestId,
      keyId,
      tokenHash,
      pollHash: createHash("sha256")
        .update("note-framework/agent-poll/v1\0" + pollSecret)
        .digest("hex"),
      label: "My writing agent",
    },
  });
  expect(start.status()).toBe(200);
  const started = await start.json();
  expect(started.fingerprint.replaceAll(" ", "")).toBe(tokenHash.slice(0, 12));
  await page.goto(started.verificationUrl);
  await expect(page.getByRole("heading", { name: "My writing agent", exact: true })).toBeVisible();
  await expect(page.locator(".account-fingerprint")).toHaveText(started.fingerprint);
  expect(
    (
      await context.request.get(`${origin}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  await page.setViewportSize({ width: 390, height: 900 });
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("approve-agent-390.png"), fullPage: true });
  await page.getByRole("button", { name: "Connect agent", exact: true }).click();
  await expect(
    page.getByText("Connected. Return to your agent; it can now publish your notes.", {
      exact: true,
    }),
  ).toBeVisible();
  const approved = await context.request.post(`${origin}/api/agent-grants/${requestId}/poll`, {
    data: { pollSecret },
  });
  expect(approved.status()).toBe(200);
  expect(await approved.json()).toMatchObject({ state: "approved", keyId });
  const principal = await context.request.get(`${origin}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(principal.status()).toBe(200);
  expect((await principal.json()).publisherId).toBe((await account(page)).publisherId);
  const agents = page.getByRole("region", { name: "Connected agents" });
  await agents.getByRole("button", { name: "Disconnect My writing agent", exact: true }).click();
  await expect(agents.getByText("No agents connected yet.", { exact: true })).toBeVisible();
  expect(
    (
      await context.request.get(`${origin}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  const replay = await page.evaluate(
    async (requestId) =>
      (
        await fetch(`/api/agent-grants/${requestId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Note-Request": "1" },
          body: JSON.stringify({ decision: "approve" }),
        })
      ).status,
    requestId,
  );
  expect(replay).toBe(409);
});
