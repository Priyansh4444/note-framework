export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function accountRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Note-Request", "1");
  const response = await fetch(path, {
    ...init,
    redirect: "error",
    headers,
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Sign in to continue.",
      403: "This action is unavailable. You may have reached an account limit.",
      404: "This request is no longer available.",
      409: "This request changed. Refresh and try again.",
      410: "This request expired. Start again from your agent.",
      429: "Too many attempts. Please wait a little and try again.",
    };
    throw new AccountError(
      response.status,
      messages[response.status] ?? "The service could not complete this action. Please try again.",
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid service response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid service response.");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid service response.");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid service response.");
  return value;
}

export function parseAccount(value: unknown) {
  const row = record(value);
  return {
    publisherId: text(row.publisherId),
    label: text(row.label),
    usedBytes: number(row.usedBytes),
    quotaBytes: number(row.quotaBytes),
    passkeys: list(row.passkeys).map((value) => {
      const item = record(value);
      return { id: text(item.id), label: text(item.label), createdAt: number(item.createdAt) };
    }),
    agents: list(row.agents).map((value) => {
      const item = record(value);
      return {
        keyId: text(item.keyId),
        label: text(item.label),
        createdAt: number(item.createdAt),
      };
    }),
  };
}
export type Account = ReturnType<typeof parseAccount>;

export function parseNotes(value: unknown) {
  const row = record(value);
  return {
    items: list(row.items).map((value) => {
      const item = record(value);
      const id = text(item.id);
      if (!/^[0-9a-f]{32}$/.test(id)) throw new Error("Invalid note ID.");
      return {
        id,
        title: text(item.title),
        version: number(item.version),
        updatedAt: number(item.updatedAt),
      };
    }),
    nextCursor: row.nextCursor === null ? null : text(row.nextCursor),
  };
}
export function parseGrant(value: unknown) {
  const row = record(value);
  const state = row.state;
  if (!["pending", "approved", "denied", "expired"].includes(String(state)))
    throw new Error("Invalid approval state.");
  return {
    state: text(state),
    label: text(row.label),
    fingerprint: text(row.fingerprint),
    expiresAt: number(row.expiresAt),
  };
}
