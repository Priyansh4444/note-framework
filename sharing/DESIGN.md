# Hosted sharing: chosen contract

The original invitation-only upload contract below remains the publication authority. The separate public service adds passkey accounts and explicit agent approval in `public-auth.ts` and `public-worker.ts`; see [public beta setup](../docs/public-beta.md). Migration 0003 adds expiring credentials and disabled-by-default platform quotas. Only the separate public deployment enables those quotas. Both credential reads and publication transactions reject expired keys.

A single Cloudflare Worker serves the trusted ink-black UI and explicit upload/viewer routes. One dedicated D1 database owns publisher keys, draft identity, immutable numbered versions, body chunks, quota accounting, and durable idempotency receipts. Existing per-note Cloudflare publishing remains available.

## Synthesis

| Choice                           | Decision and reason                                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 chunked bodies                | Base: metadata and complete body commit in one transaction; no partial public head or orphan-object cleanup.                                                                                                                                             |
| R2 + Durable Object              | Rejected for this bounded service: extra resources, attempt reservations and cleanup/reconciliation lifecycle. Keep as a measured future storage alternative.                                                                                            |
| Identity UTF-8 chunks            | Graft from independent review: preserve valid UTF-8 bytes/BOM/line endings without gzip/base64 branches. Each chunk is at most 262,144 UTF-16 units, split only between code points, at most 786,432 UTF-8 bytes. At most 21 chunks cover a 5 MiB input. |
| One origin, opaque sandbox       | Uploaded HTML is isolated by both iframe and HTTP response sandbox, without allow-same-origin. A second content Worker is optional defense, not necessary for opaque origins. No uploaded HTML executes in the trusted page.                             |
| Locally generated publisher keys | Admin registers hashes and fixed IDs; no invitation-redemption state machine and no server-generated one-time secret recovery. Tokens are handed to invited people privately.                                                                            |

The independent judge chose D1 and agreed with removing codecs and invitation redemption. Full candidates and judgment are retained in local artifacts. This design must still pass real Worker/D1 boundary, concurrency and browser checks; the row-size arithmetic is not a runtime performance claim.

## API

Canonical IDs: 32 lowercase hexadecimal characters (random 128 bits); key IDs and publisher IDs use the same format. Version numbers are positive safe integers. Idempotency keys are random UUIDs (16–128 URL-safe characters accepted).

Publisher token: `nf_pub_<keyId>.<base64url-256-bit-secret>`.
Publisher verifier: SHA-256 of UTF-8 `note-framework/publisher/v1\0` + complete token.
Owner token: `nf_owner_<base64url-256-bit-secret>`.
Owner verifier: SHA-256 of UTF-8 `note-framework/owner/v1\0` + complete token, installed as `OWNER_TOKEN_SHA256` through Wrangler stdin.

- GET `/api/me`: `{publisherId,keyId,label,maxBytes,quotaBytes,usedBytes}`.
- GET `/api/drafts`: bounded own-only `{items:[{id,title,version,etag,url,versionUrl,updatedAt}],nextCursor}`.
- GET `/api/drafts/:id`: own metadata/receipt; foreign and missing both 404.
- PUT `/api/drafts/:id`: raw `text/html; charset=utf-8`, maximum 5,242,880 original bytes, fatal UTF-8 validation with BOM preserved. Required `Idempotency-Key`. Optional `X-Note-Title`: canonical base64url UTF-8, maximum 256 bytes, single line. New ID/no If-Match creates v1. `If-Match: "0"` is also accepted for explicit creation. An existing own draft requires `If-Match: "N"`; missing is 428, stale 412. Never silently rebase.
- Commit receipt: `{id,version,etag,sha256,bytes,url,versionUrl,contentUrl,downloadUrl}`. Commit 201; identical operation replay 200 with its original receipt even after newer versions. Conflicting operation key/body/title/precondition 409.
- GET `/d/:id`: resolve latest once, trusted viewer pinned to one version.
- GET `/d/:id/v/:N`: pinned trusted viewer.
- GET `/content/:id/v/:N`: original HTML with enforced sandbox CSP on direct visits too.
- GET `/raw/:id/v/:N`: exact original bytes, text/plain attachment, nosniff, sandbox CSP.
- PUT `/api/admin/publishers/:publisherId/keys/:keyId`: owner bearer; JSON `{label,tokenHash,quotaBytes?}`. Register a locally generated verifier. Initial registration creates publisher; later keys retain the same identity. Matching retry is idempotent; different hash conflicts. Revoked-key tombstones never reactivate by replay.
- DELETE same key path: owner bearer, idempotent permanent key revocation.
- GET `/healthz`: bounded health response.

No public draft index, cookies, credentialed CORS, arbitrary URL fetching, directory/archive uploads, uploaded server code or secret-bearing query parameters. Canonical `PUBLIC_ORIGIN` builds receipts; no caller-controlled Host-based output. Error JSON `{error:{code,message}}` is bounded and contains no bodies, keys or SQL. API responses use no-store.

## Atomicity

An always-inserting CHECK guard inside one D1 batch enforces active key/publisher, ownership, creation/update precondition and exact raw-byte quota. A zero-row conditional UPDATE is not a transaction failure. Versions, ordered chunks, head, usage and receipt all commit or all roll back. Receipt scope is publisher ID plus operation key, independent of key rotation. Fingerprint includes protocol, requested draft ID, expected version, title, byte count and original SHA-256. Authenticate before replay; replay before checking today's head.

Review hardening adds a separate 1,000-retained-version allowance per publisher, counted atomically with each committed version. Exact body-byte accounting remains unchanged; this also bounds tiny-upload metadata/index growth. Key revocations have permanent tombstones even before registration, preventing a saved but not-yet-registered invitation from being activated after revocation. Direct browser navigation to a content URL redirects to the trusted pinned viewer, since a standalone sandboxed document could otherwise navigate its own tab.

## Module ownership

- `sharing/worker.ts`, storage/auth/security helpers, `sharing/migrations/`, backend tests: one backend implementation owner.
- `scripts/share.ts`: private origin-scoped credentials, pending-byte journal, per-publication lock, uploads/login/key management and note export, owned by parent.
- `src/notes/framework/`: trusted Solid UI, owned by parent.
- `scripts/starter.ts` + `templates/starter/`: clean allowlisted export; parent integrates sharing client after backend contract is verified.
- `wrangler.sharing.jsonc`, setup/build/release scripts: parent controls actual provisioning/deployment. Create your own database; the checked-in database ID is a placeholder.

## Verification

Fresh starter install/check/tests/build; real single-file rendering in opaque frame; desktop/390/320px; hostile parent/storage/API/top-navigation attempts; original-byte hashes including BOM/NUL/BMP/astral and 5 MiB/+1 fixtures; two publishers; stale-writer race; identical retry race; middle-batch rollback; lost-response replay; revocation during upload; CLI crash recovery and private-file permissions. Source references: current Cloudflare D1 limits and batch API, HTML sandbox and Encoding Standard. Do not claim traffic capacity/free-tier guarantees from a passing smoke test.
