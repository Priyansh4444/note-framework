# Publish notes in the public beta

Open [Your notes](https://note-framework-public.pronsh.workers.dev/account). Create an account with a passkey from your device or password manager. Returning authors choose **Sign in with a passkey**. Reading a note needs only its link.

Add a backup passkey on a different device or in another password manager. There is no email recovery. Passkeys belong to this hostname; a future move to a custom domain needs an explicit migration and re-enrollment, rather than silently changing the relying party ID.

## Connect an agent

Start from the downloaded starter, then run:

```sh
bun run share login --server https://note-framework-public.pronsh.workers.dev
bun run note:share my-topic
```

The login command prints an approval link and fingerprint. Open that link, sign in, compare the fingerprint, and select **Connect agent**. The agent creates its publishing secret locally; approval registers only its verifier. The browser never receives that secret. Disconnect an agent in Your notes to revoke it. Old invitation-file login remains supported.

Repeat an interrupted login or upload command unchanged. The private journals preserve its credential and publication operation. An expired or declined login requires `share login --new`. A version conflict requires review; the client does not silently overwrite newer work.

The account page also accepts one self-contained UTF-8 HTML file. It verifies the saved original before reporting success. CLI updates retain a stable link and immutable versions. Anyone with a link can read or download every retained version; there is no deletion command.

## Run the service locally

```sh
bun install
bun run visual:install
bun run public:build
bunx wrangler d1 migrations apply note-framework-public-beta --local --config wrangler.public.jsonc
bunx wrangler d1 execute note-framework-public-beta --local --config wrangler.public.jsonc --command 'UPDATE public_settings SET enabled=1 WHERE id=1'
bun run public:dev
```

Use exactly `http://localhost:3160`, including for passkeys. The public Worker validates the canonical origin. Run its browser tests in another terminal:

```sh
PUBLIC_TEST_URL=http://localhost:3160 UI_TEST_URL=http://localhost:3160 bunx playwright test visual/public-account.visual.ts
```

These tests use a Chromium virtual authenticator against the built app, Worker runtime, and D1. Cryptographic verification is real; the authenticator is simulated. Physical devices, Safari, and Firefox need separate verification.

## Deploy a separate installation

The checked-in D1 ID is a placeholder; this repository does not configure access to the hosted beta. For your own installation, create a D1 database and replace its name/ID, Worker name, and canonical HTTPS origin in `wrangler.public.jsonc`. Adjust the explicit target check in `scripts/public-deploy.ts` to match your installation. Never reuse another installation's database ID.

`bun run public:deploy` runs quality gates, browser component tests and the public build, applies migrations to the new database, enables the platform quota, and deploys that Worker. Run the real account browser tests locally before deployment and against HTTPS afterward. Cloudflare credentials are operator credentials; authors do not need them to publish notes.

## Bounds and authority

The beta allows 1,000 accounts, 32 MiB retained bodies and 1,000 versions per account, and 1 GiB/10,000 versions across the service. Files are limited to 5 MiB. Account limits are eight passkeys, eight live sessions, sixteen active agents, and sixty-four lifetime agent registrations. Oldest browser sessions are retired when a verified sign-in needs a slot. Expired ceremonies, grants, rate buckets and browser keys are cleaned up; revoked agent keys remain revoked.

WebAuthn requires user verification and discoverable passkeys. One-use challenges are browser-bound and expire after ten minutes. Sessions last seven days in Secure, HttpOnly, SameSite cookies. Browser mutations require the exact Origin and a custom request header. Session expiry, ownership, revocation, version preconditions, and storage budgets are checked in the write transaction.

Uploaded HTML stays in the existing opaque sandbox with no account access, network, forms, or popups. Account HTML and uploaded HTML never share a DOM or a relaxed content policy. Authentication adds no external scripts or fonts.

Sources: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server), [browser API](https://simplewebauthn.dev/docs/packages/browser), and [Cloudflare static asset HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).
