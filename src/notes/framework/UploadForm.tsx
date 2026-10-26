import { Show, createSignal, onCleanup, type Component } from "solid-js";

type Receipt = { id: string; version: number; url: string; versionUrl: string };
type UploadState = { phase: "idle" | "uploading" | "saved" } | { phase: "error"; message: string };
const MAX_BYTES = 5 * 1024 * 1024;
const encodeTitle = (title: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(title)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export const UploadForm: Component<{ session?: boolean; onSaved?: () => void }> = (props) => {
  const [file, setFile] = createSignal<File>();
  const [title, setTitle] = createSignal("");
  const [token, setToken] = createSignal("");
  const [state, setState] = createSignal<UploadState>({ phase: "idle" });
  const [receipt, setReceipt] = createSignal<Receipt>();
  let id = "";
  let pending:
    | { bytes: ArrayBuffer; name: string; digest: string; key: string; version: number }
    | undefined;
  const [recovering, setRecovering] = createSignal(false);
  let abort: AbortController | undefined;
  onCleanup(() => abort?.abort());
  const busy = () => state().phase === "uploading";
  const error = () => {
    const s = state();
    return s.phase === "error" ? s.message : "";
  };

  const reset = () => {
    id = "";
    pending = undefined;
    setRecovering(false);
    setReceipt(undefined);
    setState({ phase: "idle" });
  };
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;
    const source = file(),
      name = title().trim() || source?.name.replace(/\.html?$/i, "") || "Untitled note";
    if (!source || !/\.html?$/i.test(source.name))
      return setState({ phase: "error", message: "Choose a self-contained HTML file." });
    if (!source.size || source.size > MAX_BYTES)
      return setState({ phase: "error", message: "Choose a file between 1 byte and 5 MiB." });
    if (!props.session && !token().trim())
      return setState({ phase: "error", message: "Enter your invited publisher token." });
    if (
      new TextEncoder().encode(name).length > 256 ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(name)
    )
      return setState({
        phase: "error",
        message: "Use a single-line title, up to 256 UTF-8 bytes.",
      });
    setState({ phase: "uploading" });
    try {
      if (!pending) {
        const bytes = await source.arrayBuffer();
        try {
          new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch {
          throw new Error("This file is not valid UTF-8 HTML.");
        }
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        pending = {
          bytes,
          name,
          digest,
          key: crypto.randomUUID(),
          version: (receipt()?.version ?? 0) + 1,
        };
      }
      setRecovering(true);
      id ||= crypto.randomUUID().replaceAll("-", "");
      abort = new AbortController();
      const response = await fetch(`/api/drafts/${id}`, {
        method: "PUT",
        redirect: "error",
        signal: abort.signal,
        headers: {
          ...(props.session
            ? { "X-Note-Request": "1" }
            : { Authorization: `Bearer ${token().trim()}` }),
          "Content-Type": "text/html; charset=utf-8",
          "Idempotency-Key": pending.key,
          "If-Match": `"${pending.version - 1}"`,
          "X-Note-Title": encodeTitle(pending.name),
        },
        body: pending.bytes,
      });
      if (!response.ok) {
        if ([400, 403, 404, 409, 412, 413, 415, 422, 428].includes(response.status)) {
          pending = undefined;
          setRecovering(false);
          if (!receipt()) id = "";
        }
        const message =
          response.status === 401
            ? props.session
              ? "Your session expired. Sign in again before retrying."
              : "That publishing token was not accepted."
            : response.status === 412
              ? "A newer version exists. Review it with the CLI before replacing it."
              : response.status === 413
                ? "The file exceeds the upload limit."
                : response.status === 404
                  ? "This note is unavailable to that publisher. Start a new note if you changed tokens."
                  : response.status === 403
                    ? "The publisher's storage allowance is full. Contact the host owner."
                    : "The upload did not complete. Retry with the same file; the service will not duplicate a saved version.";
        throw new Error(message);
      }
      const saved = (await response.json()) as Record<string, unknown>;
      if (
        !saved ||
        saved.id !== id ||
        saved.version !== pending.version ||
        saved.sha256 !== pending.digest ||
        saved.bytes !== pending.bytes.byteLength ||
        saved.url !== `${location.origin}/d/${id}` ||
        saved.versionUrl !== `${location.origin}/d/${id}/v/${pending.version}` ||
        saved.downloadUrl !== `${location.origin}/raw/${id}/v/${pending.version}`
      )
        throw new Error(
          "The service returned an invalid receipt. Retry to recover the original upload.",
        );
      const downloaded = await fetch(saved.downloadUrl as string, {
        redirect: "error",
        signal: abort.signal,
      });
      if (!downloaded.ok || !downloaded.body)
        throw new Error("The saved file could not be verified. Retry the original upload.");
      // HTTP compression can remove Content-Length. Check bounded decoded bytes,
      // the same bytes the browser originally uploaded, rather than that header.
      const original = new Uint8Array(pending.bytes.byteLength);
      const reader = downloaded.body.getReader();
      let received = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (received + value.length > original.length) {
          await reader.cancel();
          throw new Error("The saved file could not be verified. Retry the original upload.");
        }
        original.set(value, received);
        received += value.length;
      }
      if (received !== original.length)
        throw new Error("The saved file could not be verified. Retry the original upload.");
      const originalHash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", original)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (original.byteLength !== pending.bytes.byteLength || originalHash !== pending.digest)
        throw new Error("The saved file could not be verified. Retry the original upload.");
      setReceipt(saved as Receipt);
      pending = undefined;
      setRecovering(false);
      setState({ phase: "saved" });
      props.onSaved?.();
    } catch (cause) {
      setState({
        phase: "error",
        message:
          cause instanceof TypeError
            ? "Could not reach the service. Check your connection, then retry the same file."
            : cause instanceof Error
              ? cause.message
              : "The upload did not complete.",
      });
    }
  };
  return (
    <form class="framework-upload" onSubmit={submit}>
      <label class="framework-field-label" for="upload-file">
        Self-contained HTML · up to 5 MiB
      </label>
      <input
        id="upload-file"
        type="file"
        accept=".html,.htm,text/html"
        disabled={busy() || recovering()}
        onChange={(e) => {
          const next = e.currentTarget.files?.[0];
          setFile(next);
          if (!title()) setTitle(next?.name.replace(/\.html?$/i, "") ?? "");
        }}
      />
      <label class="framework-field-label" for="upload-title">
        Title
      </label>
      <input
        id="upload-title"
        value={title()}
        disabled={busy() || recovering()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        autocomplete="off"
      />
      <Show when={!props.session}>
        <label class="framework-field-label" for="upload-token">
          Publishing token
        </label>
        <input
          id="upload-token"
          type="password"
          value={token()}
          disabled={busy()}
          onInput={(e) => setToken(e.currentTarget.value)}
          autocomplete="off"
          spellcheck={false}
          aria-describedby="upload-token-note"
        />
        <p id="upload-token-note" class="framework-footnote">
          Kept only in this page's memory. For regular use, configure the CLI once.
        </p>
      </Show>
      <div class="framework-upload-actions">
        <button type="submit" disabled={busy()}>
          {busy()
            ? "Publishing…"
            : recovering()
              ? "Retry original upload"
              : receipt()
                ? "Save a new version"
                : "Publish HTML"}
        </button>
        <Show when={receipt()}>
          <button type="button" disabled={busy()} onClick={reset}>
            Start a new note
          </button>
        </Show>
      </div>
      <p class="framework-upload-status" role="status">
        <Show when={busy()}>Saving the page and its version…</Show>
        <Show when={error()}>
          <span class="framework-upload-error">{error()}</span>
        </Show>
        <Show when={receipt()}>
          {(saved) => (
            <span>
              Version {saved().version} saved. <a href={saved().url}>Open share link ↗</a> ·{" "}
              <a href={saved().versionUrl}>This version</a>
            </span>
          )}
        </Show>
      </p>
    </form>
  );
};
