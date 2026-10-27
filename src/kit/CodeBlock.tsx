import { createEffect, createSignal, Show, onCleanup, onMount } from "solid-js";
import "./code-block.css";
import { tip } from "../post/scene/tooltip";
import { mountCodeMorph } from "./code-morph";
import { DisclosureSummary } from "./disclosure";
import type { CodeMorphPlan, CodeSide } from "./code-morph-plan";

declare const compiledCode: unique symbol;

type CompiledBlock<K extends "code" | "diff"> = Readonly<{
  readonly [compiledCode]: true;
  kind: K;
  filename: string;
  language: string;
  /** Exact imported text, including patch markers and original line endings. */
  source: string;
  /** Trusted build output; authors obtain this only through ?code / ?diff. */
  prerenderedHTML: string;
}>;

export type CodeArtifact =
  | CompiledBlock<"code">
  | (CompiledBlock<"diff"> &
      Readonly<{
        /** Trusted build output for the explicit side-by-side view. */
        splitPrerenderedHTML: string;
        morph: CodeMorphPlan;
      }>);
export type CodeBlockProps = { artifact: CodeArtifact };

/** Static Pierre markup; no highlighter or worker enters the reader bundle. */
export function CodeBlock(props: CodeBlockProps) {
  let host!: HTMLDivElement;
  let shadow: ShadowRoot | undefined;
  let mounted: ReturnType<typeof mountCodeMorph> | undefined;
  const [side, setSide] = createSignal<CodeSide>("before");
  let inspector!: HTMLDivElement;
  let tools!: HTMLDetailsElement;
  let inspectorShadow: ShadowRoot | undefined;
  const [flash, setFlash] = createSignal(false);
  let flashReset: ReturnType<typeof setTimeout> | undefined;
  let motion = false;
  let updateOverflow = () => {};
  const [view, setView] = createSignal<"unified" | "split">("unified");
  const [scrollable, setScrollable] = createSignal(false);
  const [copied, setCopied] = createSignal<"" | "Copied" | "Selected">("");
  const name = () => props.artifact.filename.split("/").at(-1) ?? props.artifact.filename;
  onMount(() => {
    shadow = host.attachShadow({ mode: "open" });
    inspectorShadow = inspector.attachShadow({ mode: "open" });
    createEffect(() => {
      inspectorShadow!.innerHTML =
        props.artifact.kind === "diff" && view() === "split"
          ? props.artifact.splitPrerenderedHTML
          : props.artifact.prerenderedHTML;
      for (const gutter of inspectorShadow!.querySelectorAll("[data-gutter]"))
        gutter.setAttribute("aria-hidden", "true");
      updateOverflow();
    });
    let overflowFrame = 0;
    const measureOverflow = () => {
      overflowFrame = 0;
      const listing = (tools.open ? inspectorShadow : shadow)?.querySelector("pre");
      setScrollable(!!listing && listing.scrollWidth > listing.clientWidth + 1);
    };
    // The hint changes ancestor height. Write it before the next observation
    // cycle, rather than invalidating already-delivered ancestor measurements.
    updateOverflow = () => {
      if (!overflowFrame) overflowFrame = requestAnimationFrame(measureOverflow);
    };
    const observer = new ResizeObserver(updateOverflow);
    onCleanup(() => {
      observer.disconnect();
      cancelAnimationFrame(overflowFrame);
    });
    let mountedArtifact: CodeArtifact | undefined;
    let mode = "";
    onCleanup(() => mounted?.dispose());
    createEffect(() => {
      const artifact = props.artifact;
      const nextMode = artifact.kind === "diff" ? "morph" : "source";
      if (artifact !== mountedArtifact || mode !== nextMode) {
        mounted?.dispose();
        mounted = undefined;
        shadow!.replaceChildren();
        if (artifact.kind === "diff" && nextMode === "morph")
          mounted = mountCodeMorph(shadow!, artifact.morph, host, updateOverflow);
        else shadow!.innerHTML = artifact.prerenderedHTML;
        mountedArtifact = artifact;
        mode = nextMode;
      }
      mounted?.show(side(), motion);
      motion = false;
      for (const gutter of shadow!.querySelectorAll("[data-gutter]"))
        gutter.setAttribute("aria-hidden", "true");
      observer.disconnect();
      observer.observe(host);
      observer.observe(inspector);
      const inspectedListing = inspectorShadow?.querySelector("pre");
      if (inspectedListing) observer.observe(inspectedListing);
      const listing = shadow!.querySelector("pre");
      if (listing) observer.observe(listing);
      updateOverflow();
    });
  });

  // An opaque sandbox may refuse the async clipboard. The fallback copy event carries the
  // exact imported text (patch headers included); if even that is blocked, the code stays selected.
  let reset: ReturnType<typeof setTimeout> | undefined;
  const say = (state: "Copied" | "Selected") => {
    clearTimeout(reset);
    setCopied(state);
    reset = setTimeout(() => setCopied(""), 1600);
  };
  onCleanup(() => {
    clearTimeout(reset);
    clearTimeout(flashReset);
  });
  const copy = async () => {
    const text = props.artifact.source;
    try {
      await navigator.clipboard.writeText(text);
      return say("Copied");
    } catch {}
    mounted?.settle();
    const target = (tools.open ? inspectorShadow : shadow)?.querySelector("pre");
    const selection = getSelection();
    if (!target || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    let exact = false;
    const onCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
      exact = true;
    };
    document.addEventListener("copy", onCopy);
    try {
      exact = document.execCommand("copy") && exact;
    } catch {
      exact = false;
    } finally {
      document.removeEventListener("copy", onCopy);
    }
    say(exact ? "Copied" : "Selected");
  };

  const choose = (next: CodeSide, animate = true) => {
    motion = animate;
    setSide(next);
    clearTimeout(flashReset);
    if (next === "after" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFlash(true);
      flashReset = setTimeout(() => setFlash(false), 1100);
    } else setFlash(false);
  };
  const scroll = (event: KeyboardEvent, root: ShadowRoot | undefined) => {
    const listing = root?.querySelector("pre");
    if (
      !listing ||
      listing.scrollWidth <= listing.clientWidth ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    )
      return;
    event.preventDefault();
    listing.scrollLeft += event.key === "ArrowRight" ? 80 : -80;
  };
  return (
    <div class="nk-code-example">
      <figure
        class="nk-code-block"
        data-kind={props.artifact.kind}
        data-current-version={props.artifact.kind === "diff" ? side() : undefined}
        aria-label={name()}
      >
        <figcaption class="nk-code-block-header">
          <span class="nk-code-block-title">{name()}</span>
        </figcaption>
        <Show when={props.artifact.kind === "diff"}>
          <button
            type="button"
            class="nk-code-block-switch"
            {...tip(() =>
              side() === "before" ? "Before · click for After" : "After · click for Before",
            )}
            aria-label={`Show the ${side() === "before" ? "after" : "before"} version of the code`}
            aria-pressed={side() === "after"}
            data-flash={flash() ? "" : undefined}
            onClick={(event) => choose(side() === "before" ? "after" : "before", event.detail > 0)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 1 15 5 8 9 1 5ZM1 7l7 4 7-4v2l-7 4-7-4Zm0 3 7 4 7-4v2l-7 4-7-4Z"
              />
            </svg>
          </button>
        </Show>
        <div
          ref={host}
          class="nk-code-block-render"
          tabIndex={0}
          role="region"
          aria-label={`${name()} ${props.artifact.kind === "diff" ? `${side()} source excerpts` : "source"}`}
          onKeyDown={(event) => scroll(event, shadow)}
        />
      </figure>
      <details ref={tools} class="nk-code-source-tools" onToggle={updateOverflow}>
        <DisclosureSummary>Source tools</DisclosureSummary>
        <div class="nk-code-source-actions">
          <Show when={props.artifact.kind === "diff"}>
            <p class="nk-code-source-notice">
              Changed excerpts from the original patch. Unchanged source outside its hunks is
              omitted; these excerpts are not a complete file.
            </p>
            <div class="nk-code-block-views" role="group" aria-label="Code version">
              <button
                type="button"
                aria-pressed={side() === "before"}
                onClick={(event) => choose("before", event.detail > 0)}
              >
                Before
              </button>
              <button
                type="button"
                aria-pressed={side() === "after"}
                onClick={(event) => choose("after", event.detail > 0)}
              >
                After
              </button>
            </div>
            <div class="nk-code-block-views" role="group" aria-label="Diff view">
              <button
                type="button"
                aria-label="Show unified diff"
                aria-pressed={view() === "unified"}
                onClick={() => setView("unified")}
              >
                Unified
              </button>
              <button
                type="button"
                aria-label="Show split diff"
                aria-pressed={view() === "split"}
                onClick={() => setView("split")}
              >
                Split
              </button>
            </div>
          </Show>
          <button
            type="button"
            class="nk-code-block-copy"
            onClick={copy}
            aria-label={`Copy ${props.artifact.kind === "diff" ? "patch" : "source"}`}
          >
            {copied() || "Copy"}
          </button>
        </div>
        <span class="nk-code-block-status" role="status">
          {copied()}
        </span>
        <Show when={scrollable()}>
          <p class="nk-code-block-scroll-hint">Scroll horizontally to read →</p>
        </Show>
        <div
          ref={inspector}
          class="nk-code-inspector-render"
          tabIndex={0}
          role="region"
          aria-label={`${name()} ${props.artifact.kind === "diff" ? `${view()} patch` : "original source"}`}
          onKeyDown={(event) => scroll(event, inspectorShadow)}
        />
      </details>
    </div>
  );
}
