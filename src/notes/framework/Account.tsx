import { batch, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { usePageHead } from "../../kit/note";
import { DisclosureSummary } from "../../kit/parts";
import { Masthead, Footer } from "./index";
import { UploadForm } from "./UploadForm";
import {
  accountRequest,
  AccountError,
  parseAccount,
  parseGrant,
  parseNotes,
  type Account,
} from "./account-api";
import "./account.css";

type Identity =
  | { phase: "loading" }
  | { phase: "signed-out" }
  | { phase: "ready"; account: Account }
  | { phase: "error" };
type NotePage = ReturnType<typeof parseNotes>;
type Task = { phase: "idle" } | { phase: "busy"; label: string };
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;

export default function AccountPage() {
  usePageHead(
    "Your notes — Note Framework",
    "Sign in, connect your agent, and publish visual notes.",
  );
  const [identity, setIdentity] = createSignal<Identity>({ phase: "loading" });
  const [task, setTask] = createSignal<Task>({ phase: "idle" });
  const [message, setMessage] = createSignal("");
  const [name, setName] = createSignal("");
  const [backupName, setBackupName] = createSignal("Backup passkey");
  const [notes, setNotes] = createSignal<NotePage>({ items: [], nextCursor: null });
  const [grant, setGrant] = createSignal<ReturnType<typeof parseGrant>>();
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const approvalId = new URLSearchParams(location.search).get("request");
  const validApproval = approvalId !== null && /^[0-9a-f]{32}$/.test(approvalId);
  const busy = () => task().phase === "busy";
  const account = () => {
    const current = identity();
    return current.phase === "ready" ? current.account : undefined;
  };
  const request = (path: string, init: RequestInit = {}) =>
    accountRequest(path, { ...init, signal: controller.signal });
  const post = (path: string, body: unknown = {}) =>
    request(path, { method: "POST", body: JSON.stringify(body) });

  async function loadNotes(cursor?: string) {
    const page = parseNotes(
      await request(`/api/drafts?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    );
    setNotes(
      cursor ? { items: [...notes().items, ...page.items], nextCursor: page.nextCursor } : page,
    );
  }
  async function loadAccount() {
    try {
      const current = parseAccount(await request("/api/account"));
      const firstPage = parseNotes(await request("/api/drafts?limit=20"));
      batch(() => {
        setNotes(firstPage);
        setIdentity({ phase: "ready", account: current });
      });
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) {
        setNotes({ items: [], nextCursor: null });
        setIdentity({ phase: "signed-out" });
      } else throw error;
    }
  }
  async function loadGrant() {
    if (validApproval) setGrant(parseGrant(await request(`/api/agent-grants/${approvalId}`)));
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busy()) return;
    setTask({ phase: "busy", label });
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof AccountError && error.status === 401) {
        setIdentity({ phase: "signed-out" });
        setNotes({ items: [], nextCursor: null });
      }
      setMessage(
        error instanceof Error && error.name === "NotAllowedError"
          ? "The passkey request was cancelled. You can try again."
          : error instanceof Error && error.name === "InvalidStateError"
            ? "This device already has a passkey. Use a different device or password manager for a backup."
            : error instanceof AccountError
              ? error.message
              : "That did not complete. If you already created a passkey, choose Sign in to recover your account.",
      );
    } finally {
      setTask({ phase: "idle" });
    }
  }
  onMount(() => {
    void run("Loading your notes…", async () => {
      try {
        await loadAccount();
        await loadGrant();
      } catch (error) {
        if (identity().phase === "loading") setIdentity({ phase: "error" });
        throw error;
      }
    });
  });

  async function register(backup = false) {
    const base = backup ? "/auth/passkeys" : "/auth/register";
    const options = await post(`${base}/options`, {
      label: backup ? backupName().trim() || "Backup passkey" : name().trim() || "My notes",
    });
    const response = await startRegistration({
      optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
    });
    await post(`${base}/verify`, { response });
    await loadAccount();
    setMessage(backup ? "Backup passkey added." : "Your account is ready.");
  }
  async function signIn() {
    const options = await post("/auth/login/options");
    const response = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    });
    await post("/auth/login/verify", { response });
    await loadAccount();
  }
  async function decide(decision: "approve" | "deny") {
    await post(`/api/agent-grants/${approvalId}/decision`, { decision });
    await loadGrant();
    await loadAccount();
  }
  return (
    <main class="fw-page fw-account">
      <Masthead here="account" />
      <div class="account-column">
        <header class="account-heading">
          <p class="fw-eyebrow">Your space</p>
          <h1>{validApproval ? "Connect your agent." : "Make an idea shareable."}</h1>
          <p class="fw-dek">
            Create a note with your agent. Check it, publish it, and keep improving the same link.
          </p>
        </header>
        <Show when={validApproval && grant()}>
          {(current) => (
            <section class="account-approval" aria-labelledby="approval-heading">
              <p class="fw-eyebrow">Agent request</p>
              <h2 id="approval-heading">{current().label}</h2>
              <p>Check that this fingerprint matches the one shown by your agent.</p>
              <output class="account-fingerprint">{current().fingerprint}</output>
              <Show
                when={current().state === "pending"}
                fallback={
                  <p role="status">
                    {current().state === "approved"
                      ? "Connected. Return to your agent; it can now publish your notes."
                      : "This request is closed. Start a new login from your agent."}
                  </p>
                }
              >
                <Show
                  when={account()}
                  fallback={
                    <p>
                      Sign in below to approve this request. Signing in alone does not connect the
                      agent.
                    </p>
                  }
                >
                  <p>
                    This agent can publish and update notes in your account. You can disconnect it
                    below.
                  </p>
                  <div class="account-actions">
                    <button
                      class="fw-button fw-button-primary"
                      disabled={busy()}
                      onClick={() => void run("Connecting…", () => decide("approve"))}
                    >
                      Connect agent
                    </button>
                    <button
                      class="fw-button"
                      disabled={busy()}
                      onClick={() => void run("Declining…", () => decide("deny"))}
                    >
                      Decline
                    </button>
                  </div>
                </Show>
              </Show>
            </section>
          )}
        </Show>
        <Switch>
          <Match when={identity().phase === "loading"}>
            <p role="status">Loading your notes…</p>
          </Match>
          <Match when={identity().phase === "error"}>
            <button
              class="fw-button"
              disabled={busy()}
              onClick={() => void run("Loading…", loadAccount)}
            >
              Try again
            </button>
          </Match>
          <Match when={identity().phase === "signed-out"}>
            <section class="account-signin" aria-labelledby="signin-heading">
              <h2 id="signin-heading">Your device is your key.</h2>
              <p>Use a passkey from your device or password manager. No password or email setup.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("Creating your account…", () => register());
                }}
              >
                <label for="account-name">Name for your notes</label>
                <input
                  id="account-name"
                  value={name()}
                  maxLength={64}
                  autocomplete="nickname"
                  placeholder="My notes"
                  disabled={busy()}
                  onInput={(event) => setName(event.currentTarget.value)}
                />
                <div class="account-actions">
                  <button type="submit" class="fw-button fw-button-primary" disabled={busy()}>
                    Create an account
                  </button>
                  <button
                    type="button"
                    class="fw-button"
                    disabled={busy()}
                    onClick={() => void run("Signing in…", signIn)}
                  >
                    Sign in with a passkey
                  </button>
                </div>
              </form>
              <p class="account-hint">
                Already have an account? Choose Sign in. Passkeys belong to this website’s address.
              </p>
            </section>
          </Match>
          <Match when={account()}>
            <section class="account-section" aria-labelledby="notes-heading">
              <div class="account-section-heading">
                <h2 id="notes-heading">Your notes</h2>
                <span class="account-hint">{account()?.label}</span>
              </div>
              <Show
                when={notes().items.length}
                fallback={
                  <p>
                    No published notes yet. Start with the <a href="/docs">guide</a>, or upload a
                    note below.
                  </p>
                }
              >
                <ul class="account-list">
                  <For each={notes().items}>
                    {(note) => (
                      <li>
                        <a href={`/d/${note.id}`}>{note.title}</a>
                        <span class="account-hint">
                          v{note.version} · {new Date(note.updatedAt).toLocaleDateString()}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={notes().nextCursor}>
                {(cursor) => (
                  <button
                    class="fw-button"
                    disabled={busy()}
                    onClick={() => void run("Loading notes…", () => loadNotes(cursor()))}
                  >
                    More notes
                  </button>
                )}
              </Show>
              <p class="account-hint">
                {bytes(account()?.usedBytes ?? 0)} of {bytes(account()?.quotaBytes ?? 0)} used. Each
                update keeps its previous versions.
              </p>
            </section>
            <section class="account-section" aria-labelledby="publish-heading">
              <h2 id="publish-heading">Publish a note.</h2>
              <p>
                Your agent can publish directly after you connect it. You can also upload its
                self-contained HTML here.
              </p>
              <UploadForm session onSaved={() => void run("Refreshing notes…", loadAccount)} />
            </section>
            <section class="account-section" aria-labelledby="agents-heading">
              <h2 id="agents-heading">Connected agents</h2>
              <p>Ask your agent to run this once, then open its approval link.</p>
              <pre class="account-command">
                <code>{`bun run share login --server ${location.origin}`}</code>
              </pre>
              <Show
                when={account()?.agents.length}
                fallback={<p class="account-hint">No agents connected yet.</p>}
              >
                <ul class="account-list">
                  <For each={account()?.agents}>
                    {(agent) => (
                      <li>
                        <span>{agent.label}</span>
                        <button
                          class="account-text-button"
                          disabled={busy()}
                          onClick={() =>
                            void run("Disconnecting…", async () => {
                              await request(`/api/agents/${agent.keyId}`, { method: "DELETE" });
                              await loadAccount();
                            })
                          }
                        >
                          Disconnect<span class="account-sr-only"> {agent.label}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>
            <section class="account-section" aria-labelledby="keys-heading">
              <h2 id="keys-heading">Keep a spare key.</h2>
              <p>
                Add another passkey before changing devices. There is no email or password recovery
                if you lose every passkey.
              </p>
              <ul class="account-list">
                <For each={account()?.passkeys}>
                  {(key) => (
                    <li>
                      <span>{key.label}</span>
                      <button
                        class="account-text-button"
                        disabled={busy() || (account()?.passkeys.length ?? 0) <= 1}
                        onClick={() =>
                          void run("Removing passkey…", async () => {
                            await request(`/api/passkeys/${encodeURIComponent(key.id)}`, {
                              method: "DELETE",
                            });
                            await loadAccount();
                          })
                        }
                      >
                        Remove<span class="account-sr-only"> {key.label}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("Adding a passkey…", () => register(true));
                }}
              >
                <label for="backup-name">Passkey name</label>
                <input
                  id="backup-name"
                  value={backupName()}
                  maxLength={64}
                  disabled={busy()}
                  onInput={(event) => setBackupName(event.currentTarget.value)}
                />
                <button type="submit" class="fw-button" disabled={busy()}>
                  Add a backup passkey
                </button>
              </form>
              <button
                class="account-text-button account-signout"
                disabled={busy()}
                onClick={() =>
                  void run("Signing out…", async () => {
                    await post("/api/logout");
                    setIdentity({ phase: "signed-out" });
                    setNotes({ items: [], nextCursor: null });
                  })
                }
              >
                Sign out
              </button>
            </section>
          </Match>
        </Switch>
        <p class="account-status" role="status" aria-live="polite">
          {busy()
            ? (() => {
                const current = task();
                return current.phase === "busy" ? current.label : "";
              })()
            : message()}
        </p>
        <details class="account-details">
          <DisclosureSummary>What gets published?</DisclosureSummary>
          <p>
            Notes are public to anyone with their link. Each HTML file is limited to 5 MiB and runs
            in an isolated viewer without network access, forms, or access to your account. Read and
            check your note before publishing.
          </p>
        </details>
      </div>
      <Footer />
    </main>
  );
}
