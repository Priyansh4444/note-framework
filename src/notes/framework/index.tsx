import { ArrowLabel, DisclosureSummary } from "../../kit/parts";
import { createSignal, Show, type Component } from "solid-js";
import { usePageHead } from "../../kit/note";
import "./framework.css";
import { UploadForm } from "./UploadForm";
import { Docs } from "./Docs";
import { HeroCurve } from "./home/HeroCurve";
import { Specimens } from "./home/Specimens";

import { EXAMPLE } from "./home/links";

export const Masthead: Component<{ here?: "home" | "guide" | "studies" | "account" }> = (props) => (
  <header class="fw-masthead">
    <a href="/" class="fw-wordmark" aria-current={props.here === "home" ? "page" : undefined}>
      Note Framework<span aria-hidden="true">.</span>
    </a>
    <nav aria-label="Framework">
      <a href={EXAMPLE}>Example</a>
      <a href="/docs" aria-current={props.here === "guide" ? "page" : undefined}>
        Guide
      </a>
      {import.meta.env.VITE_FRAMEWORK_PUBLIC === "1" && (
        <a href="/account" aria-current={props.here === "account" ? "page" : undefined}>
          Your notes
        </a>
      )}
      {import.meta.env.VITE_FRAMEWORK_PREVIEW === "1" && (
        <a href="/studies" aria-current={props.here === "studies" ? "page" : undefined}>
          Studies
        </a>
      )}
      <a href="/llms.txt">
        <ArrowLabel>For agents</ArrowLabel>
      </a>
      <a class="fw-masthead-cta" href="/starter.zip" download="note-framework-starter.zip">
        <ArrowLabel direction="down">Starter</ArrowLabel>
      </a>
    </nav>
  </header>
);

export const Footer: Component = () => (
  <footer class="fw-footer">
    <a href="/" class="fw-wordmark">
      Note Framework<span aria-hidden="true">.</span>
    </a>
    <nav aria-label="Footer">
      <a href={EXAMPLE}>Example note</a>
      <a href="/docs">Guide</a>
      <a href="/llms.txt">Agent instructions</a>
      <a href="/starter.zip" download="note-framework-starter.zip">
        Starter ZIP
      </a>
      <a href="/starter.sha256">Checksums</a>
    </nav>
  </footer>
);

const FrameworkHome: Component = () => {
  if (location.pathname === "/docs") return <Docs />;
  usePageHead(
    "Note Framework — notes you can play with",
    "A kit for short visual explanations: figures the reader can operate, terms explained in place, and a link you can share.",
  );
  const [copied, setCopied] = createSignal(false);
  const prompt = () =>
    `Use ${location.origin}/llms.txt to create a compact, source-checked visual note about [topic] for [audience]. Explain terms, verify the diagrams, and give me the published link.`;
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      document.querySelector<HTMLTextAreaElement>("#agent-prompt")?.select();
    }
  };
  return (
    <main class="fw-page fw-home">
      <Masthead here="home" />
      <section class="fw-hero" aria-labelledby="fw-title">
        <div class="fw-hero-text enter">
          <p class="fw-eyebrow">A kit for visual explanations</p>
          <h1 id="fw-title">
            Notes you can
            <br />
            play with.
          </h1>
          <p class="fw-dek">
            Give an agent one link. It writes a short, sourced note with figures your reader can
            drag, play and check. You get a page you can share.
          </p>
          <div class="fw-actions">
            <a
              class="fw-button fw-button-primary"
              href="/starter.zip"
              download="note-framework-starter.zip"
            >
              <ArrowLabel direction="down">Download the starter</ArrowLabel>
            </a>
            <a class="fw-button" href={EXAMPLE}>
              <ArrowLabel direction="right">Read the example</ArrowLabel>
            </a>
          </div>
          <p class="fw-small">
            SolidJS · TypeScript · KaTeX · local fonts. Your files, your hosting.
          </p>
        </div>
        <HeroCurve />
      </section>

      <section class="fw-section fw-start" aria-labelledby="start-title">
        <div class="fw-section-head">
          <p class="fw-eyebrow">01 · Ask</p>
          <h2 id="start-title">Start with one sentence.</h2>
          <p>
            Paste this into your coding agent and fill in the brackets. The instructions it fetches
            are under 300 words; the starter brings the rest.
          </p>
        </div>
        <div class="fw-prompt">
          <label class="fw-prompt-label" for="agent-prompt">
            Prompt
          </label>
          <textarea id="agent-prompt" rows="3" readOnly value={prompt()} />
          <button type="button" class="fw-button" onClick={copyPrompt} aria-live="polite">
            {copied() ? "Copied ✓" : "Copy prompt"}
          </button>
        </div>
        <ol class="fw-steps">
          <li>
            <span>01</span>
            <h3>Ask</h3>
            <p>
              Name a topic and a reader. The agent downloads the starter and its authoring guide.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>Check</h3>
            <p>
              It sources claims, tests the math, and audits every figure at phone and desktop
              widths.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>Share</h3>
            <p>
              One command publishes a self-contained page. Updates keep the link; each version keeps
              its own.
            </p>
          </li>
        </ol>
      </section>

      <section class="fw-section" aria-labelledby="parts-title">
        <div class="fw-section-head">
          <p class="fw-eyebrow">02 · Build</p>
          <h2 id="parts-title">Made from a few honest parts.</h2>
          <p>
            These are the real components, running on this page. A note combines them around one
            question at a time.
          </p>
        </div>
        <Specimens />
      </section>

      <section class="fw-section fw-principles-section" aria-labelledby="shape-title">
        <div class="fw-section-head">
          <p class="fw-eyebrow">03 · Read</p>
          <h2 id="shape-title">Short by default. Complete underneath.</h2>
        </div>
        <div class="fw-principles">
          <div>
            <h3>A picture, a reason, a key fact.</h3>
            <p>
              Each chapter answers one question. Proofs and edge cases fold away beneath it, so
              nothing is lost.
            </p>
          </div>
          <div>
            <h3>Motion that explains.</h3>
            <p>
              Every intermediate frame is a true state of the model, so pausing halfway shows
              something real.
            </p>
          </div>
          <div>
            <h3>Quiet on every screen.</h3>
            <p>
              An ink-black page, serif type and labels measured at their real size on a 320px phone.
            </p>
          </div>
        </div>
        {import.meta.env.VITE_FRAMEWORK_PREVIEW === "1" && (
          <p class="fw-small">
            More examples: <a href="/notes/shared-service">one service, many windows</a>, or{" "}
            <a href="/notes/inside-svg">a picture you can take apart</a>. Try{" "}
            <a href="/notes/spring-workshop">a spring you can feel</a>, or{" "}
            <a href="/studies">browse the motion studies</a>.
          </p>
        )}
      </section>

      <section id="share" class="fw-section fw-share" aria-labelledby="share-title">
        <div class="fw-section-head">
          <p class="fw-eyebrow">04 · Share</p>
          <h2 id="share-title">Send a link that keeps working.</h2>
          <p>
            The hosted service stores each version of a single HTML file. Your link always shows the
            latest; earlier versions keep permanent links.{" "}
            {import.meta.env.VITE_FRAMEWORK_PUBLIC === "1"
              ? "Sign in once, connect your agent, and publish. Anyone with a link can read."
              : "Publishing is by invitation; anyone with a link can read."}
          </p>
        </div>
        <pre class="fw-command">
          <code>
            <span class="fw-prompt-sign">$</span> bun run note:share my-topic{"\n"}
            <span class="fw-dim">published v3 → {location.origin}/d/…</span>
          </code>
        </pre>
        <Show when={import.meta.env.VITE_FRAMEWORK_PUBLIC === "1"}>
          <p>
            <a class="fw-button fw-button-primary" href="/account">
              Create your account
            </a>
          </p>
        </Show>
        <details class="fw-upload-details">
          <DisclosureSummary>Upload an HTML file from the browser</DisclosureSummary>
          <Show
            when={import.meta.env.VITE_FRAMEWORK_PUBLIC !== "1"}
            fallback={
              <p>
                <a href="/account">Sign in to upload your note.</a> No invitation needed.
              </p>
            }
          >
            <Show
              when={import.meta.env.VITE_FRAMEWORK_PREVIEW !== "1"}
              fallback={
                <p class="fw-small">
                  Uploads use the hosted publishing service.{" "}
                  <a href="https://note-framework-share.pronsh.workers.dev/#share">
                    Open the upload form ↗
                  </a>
                </p>
              }
            >
              <UploadForm />
            </Show>
          </Show>
        </details>
        <p class="fw-small">
          Prefer your own Cloudflare account? <code>bun run note:publish my-topic</code> needs no
          invitation. See the <a href="/docs#publish">guide</a>.
        </p>
      </section>
      <Footer />
    </main>
  );
};
export default FrameworkHome;
