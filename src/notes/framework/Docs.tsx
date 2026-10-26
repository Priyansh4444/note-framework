import { createSignal, For, Match, Switch, onMount, onCleanup, type Component } from "solid-js";
import { ArrowLabel, DisclosureSummary, CodeBlock, usePageHead } from "../../kit";
import { Footer, Masthead } from "./index";
import { EXAMPLE } from "./home/links";
import { Prose } from "./guide/Prose";
import { Slider } from "./Slider";
import { Sweep } from "./Sweep";
import { Pattern } from "./Pattern";
import patternSource from "./Pattern.tsx?code";
import proseSource from "./guide/Prose.tsx?code";
import sliderSource from "./Slider.tsx?code";
import sweepSource from "./Sweep.tsx?code";
import startCommands from "./guide/start.sh?code";
import checkCommands from "./guide/check.sh?code";
import publishCommands from "./guide/publish.sh?code";
import shareCommands from "./guide/share.sh?code";
import uploadCommands from "./guide/upload.sh?code";
import "./guide.css";

const sections = [
  { id: "start", title: "Pick a question" },
  { id: "write", title: "Make your first note" },
  { id: "publish", title: "Check it and share" },
] as const;

const firstPrompt = (
  origin: string,
) => `Help me make a short visual note about how straight lines can make a smooth curve.

Read ${origin}/llms.txt and follow the instructions in the starter folder. Explain it to someone new to the topic. Use one simple picture the reader can change, define unfamiliar words, and include a small question they can try answering.

Keep the page focused on this one question. Check the explanation and show me a local preview before we share it.`;

export const Docs: Component = () => {
  usePageHead(
    "Make your first note",
    "Pick a small question, ask your agent to make a visual note, then check it and share.",
  );
  let root!: HTMLElement;
  // A link to an advanced example should reveal the disclosure around it.
  const openLinkedSection = () => {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || !root.contains(target)) return;
    for (let at: HTMLElement | null = target; at && root.contains(at); at = at.parentElement) {
      if (at instanceof HTMLDetailsElement) at.open = true;
    }
    target.scrollIntoView({ block: "start" });
  };
  onMount(() => {
    openLinkedSection();
    window.addEventListener("hashchange", openLinkedSection);
    onCleanup(() => window.removeEventListener("hashchange", openLinkedSection));
  });
  const [prompt, setPrompt] = createSignal(firstPrompt(location.origin));
  const [copyStatus, setCopyStatus] = createSignal("");
  const copyPrompt = async () => {
    const text = prompt();
    try {
      await navigator.clipboard.writeText(text);
      if (prompt() === text) setCopyStatus("Copied. Paste it into your agent to begin.");
    } catch {
      setCopyStatus("Select the prompt and copy it to paste into your agent.");
    }
  };
  return (
    <main ref={root} class="fw-page fw-guide">
      <Masthead here="guide" />
      <div class="fw-guide-layout">
        <nav class="fw-guide-toc" aria-label="On this page">
          <p class="fw-guide-label">The guide</p>
          <ol>
            <For each={sections}>
              {(section, index) => (
                <li>
                  <a href={`#${section.id}`}>
                    <span>{String(index() + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              )}
            </For>
          </ol>
        </nav>

        <article class="fw-guide-body">
          <header class="fw-guide-header enter">
            <p class="fw-eyebrow">A small guide</p>
            <h1>Make your first note.</h1>
            <p class="fw-dek">
              Start with one small question. Your agent can help turn it into a page someone can
              read, try, and understand.
            </p>
            <p class="fw-guide-links">
              <a href={EXAMPLE}>
                <ArrowLabel direction="right">Read the example</ArrowLabel>
              </a>
              <a href="/llms.txt">
                <ArrowLabel>Instructions for agents</ArrowLabel>
              </a>
            </p>
          </header>

          <For each={sections}>
            {(section) => (
              <section
                id={section.id}
                class="fw-guide-section"
                aria-labelledby={`guide-${section.id}-title`}
              >
                <h2 id={`guide-${section.id}-title`}>{section.title}.</h2>
                <Switch>
                  <Match when={section.id === "start"}>
                    <p>
                      Choose something you could explain to a friend in a few minutes. For example:{" "}
                      <em>How can straight lines make a curve?</em> One picture and something your
                      reader can move are enough to begin.
                    </p>
                    <p>
                      Take a look at <a href={EXAMPLE}>the example note</a> to see what a small,
                      finished page can feel like.
                      {import.meta.env.VITE_FRAMEWORK_PREVIEW === "1" && (
                        <>
                          {" "}
                          You can also <a href="/notes/inside-svg">take a picture apart</a> or watch{" "}
                          <a href="/notes/shared-service">four windows share one service</a>, or try{" "}
                          <a href="/notes/spring-workshop">a spring you can feel</a>. The{" "}
                          <a href="/studies">motion studies</a> explore four more directions.
                        </>
                      )}
                    </p>
                  </Match>
                  <Match when={section.id === "write"}>
                    <p>
                      <a href="/starter.zip" download="note-framework-starter.zip">
                        Download the starting files
                      </a>{" "}
                      and unzip them into a new folder. They include a working note. Open that
                      folder with your coding agent, then give it the prompt below. Change the
                      question to one you care about.
                    </p>
                    <div class="fw-guide-prompt">
                      <label for="first-note-prompt">Your prompt</label>
                      <textarea
                        id="first-note-prompt"
                        rows={9}
                        value={prompt()}
                        onInput={(event) => {
                          setPrompt(event.currentTarget.value);
                          setCopyStatus("");
                        }}
                      />
                      <div class="fw-guide-prompt-actions">
                        <button class="fw-button" type="button" onClick={copyPrompt}>
                          Copy prompt
                        </button>
                        <span role="status">{copyStatus()}</span>
                      </div>
                    </div>
                    <p class="fw-guide-aside">
                      The prompt points to <a href="/llms.txt">the instructions for your agent</a>.
                      Paste it into your agent, then ask to see the page in a local preview.
                    </p>
                  </Match>
                  <Match when={section.id === "publish"}>
                    <p>
                      Read the preview as if the topic were new to you. Before sharing, check three
                      things:
                    </p>
                    <ul class="fw-guide-checklist">
                      <li>Does it answer your question, with unfamiliar words explained?</li>
                      <li>Does the picture help, and does changing it do what you expect?</li>
                      <li>
                        Are the explanation and sources correct, and is the page readable on your
                        phone?
                      </li>
                    </ul>
                    <p>
                      Ask your agent to help publish from your own account. Check the finished link
                      before sending it to a friend. The publishing steps are in “Edit the files
                      yourself” below.
                    </p>
                  </Match>
                </Switch>
              </section>
            )}
          </For>

          <details id="developer-guide" class="fw-guide-details fw-guide-developer">
            <DisclosureSummary>Edit the files yourself</DisclosureSummary>
            <div>
              <section
                id="developer-start"
                class="fw-guide-section"
                aria-labelledby="developer-start-title"
              >
                <h2 id="developer-start-title">Start.</h2>
                <p>
                  Download the{" "}
                  <a href="/starter.zip" download="note-framework-starter.zip">
                    starter ZIP
                  </a>
                  , unzip it into a new folder, and install <a href="https://bun.sh">Bun</a>. The
                  starter includes a working note and an authoring guide for your agent. Create your
                  own note and open the local preview:
                </p>
                <details class="fw-guide-details">
                  <DisclosureSummary>Show setup commands</DisclosureSummary>
                  <div>
                    <CodeBlock artifact={startCommands} />
                  </div>
                </details>
                <p class="fw-guide-aside">
                  Edit <code>src/notes/my-topic/index.tsx</code> and visit{" "}
                  <code>/notes/my-topic</code>. Keep the source files; the starter is an independent
                  project.
                </p>
              </section>

              <section
                id="developer-write"
                class="fw-guide-section"
                aria-labelledby="developer-write-title"
              >
                <h2 id="developer-write-title">Write.</h2>
                <p>
                  Give each chapter one question. Define terms where they first appear, cite the
                  source, and put the reason beside the equation. Use a <code>Check</code> to let
                  the reader predict before opening the answer.
                </p>
                <div class="fw-guide-example">
                  <div class="fw-guide-result">
                    <p class="fw-guide-label">Live result · focus the term, open the check</p>
                    <Prose />
                  </div>
                  <details class="fw-guide-details fw-guide-source">
                    <DisclosureSummary>Show the source</DisclosureSummary>
                    <div>
                      <p class="fw-guide-label">Source · a complete component</p>
                      <CodeBlock artifact={proseSource} />
                    </div>
                  </details>
                </div>
                <p class="fw-guide-aside">
                  This example includes its own note manifest and glossary. In a full note, keep
                  those in your chapter registry and use its <code>Page</code> and{" "}
                  <code>Chapter</code> components. Save the sample at{" "}
                  <code>src/notes/my-topic/Prose.tsx</code>; change its kit import to{" "}
                  <code>../../kit</code>, then import and render <code>&lt;Prose /&gt;</code>.
                </p>
              </section>

              <section
                id="interact"
                class="fw-guide-section"
                aria-labelledby="guide-interact-title"
              >
                <h2 id="guide-interact-title">Interact.</h2>
                <p>
                  Give the reader the variable. A Solid signal holds the value; the slider and the
                  calculation read it together. A static experiment needs no scene or custom CSS.
                </p>
                <div class="fw-guide-example">
                  <div class="fw-guide-result nk-note">
                    <p class="fw-guide-label">Live result · move the slider</p>
                    <Slider />
                  </div>
                  <details class="fw-guide-details fw-guide-source">
                    <DisclosureSummary>Show the source</DisclosureSummary>
                    <div>
                      <CodeBlock artifact={sliderSource} />
                    </div>
                  </details>
                </div>
                <p class="fw-guide-aside">
                  Save <code>Slider.tsx</code> beside your note’s <code>index.tsx</code>, import it,
                  and render <code>&lt;Slider /&gt;</code>. Its kit import already matches that
                  location.
                </p>
              </section>

              <section id="animate" class="fw-guide-section" aria-labelledby="guide-animate-title">
                <h2 id="guide-animate-title">Animate.</h2>
                <p>
                  Describe the explanation as beats of one clock. Derive the drawing from that clock
                  so pausing halfway still shows a true state. Keep the SVG nodes in place.
                </p>
                <div class="fw-guide-example">
                  <div class="fw-guide-result nk-note">
                    <p class="fw-guide-label">Live result · play, pause, replay</p>
                    <Sweep />
                  </div>
                  <details class="fw-guide-details fw-guide-source">
                    <DisclosureSummary>Show the source</DisclosureSummary>
                    <div>
                      <CodeBlock artifact={sweepSource} />
                    </div>
                  </details>
                </div>
                <p class="fw-guide-aside">
                  Save and render <code>&lt;Sweep /&gt;</code> the same way. Its line and point use
                  the kit’s diagram colours, so no extra CSS is required. <code>Experiment</code>{" "}
                  owns playback here: pass a scene to it or to <code>SceneFrame</code>, never both.
                  Reduced motion opens on the final frame.
                </p>
              </section>

              <section
                id="patterns"
                class="fw-guide-section"
                aria-labelledby="guide-patterns-title"
              >
                <h2 id="guide-patterns-title">Reuse a visual pattern.</h2>
                <p>
                  For a changing outline, start with a morph. For a drawing with several
                  contributions, separate its layers. For a brush treatment, give the ink helper
                  your sampled path. Each takes your geometry and handles interrupted motion.
                </p>
                <div class="fw-guide-example">
                  <div class="fw-guide-result">
                    <p class="fw-guide-label">Live result · change direction before it settles</p>
                    <Pattern />
                  </div>
                  <details class="fw-guide-details">
                    <DisclosureSummary>
                      Use the helpers and their authoring skills
                    </DisclosureSummary>
                    <div>
                      <p>
                        The starter includes <code>MorphFigure</code>, <code>LayerFigure</code>,{" "}
                        <code>InkFigure</code> and the seeded <code>brushStroke</code> helper in{" "}
                        <code>src/kit</code>. Ask your agent to use the matching local{" "}
                        <code>morph-figures</code>, <code>layer-figures</code> or{" "}
                        <code>ink-figures</code> skill. Save this component as{" "}
                        <code>Pattern.tsx</code> beside your note, then import and render{" "}
                        <code>&lt;Pattern /&gt;</code>. The layer and ink recipes are in{" "}
                        <code>src/kit/patterns/recipes.tsx</code>.
                      </p>
                      <CodeBlock artifact={patternSource} />
                    </div>
                  </details>
                </div>
                <p>
                  Try all three in <a href={`${EXAMPLE}#patterns`}>the example note</a>. The layers
                  and ink use the curve drawn earlier on that page.
                </p>
              </section>

              <section id="check" class="fw-guide-section" aria-labelledby="guide-check-title">
                <h2 id="guide-check-title">Check.</h2>
                <p>
                  Check the claim as carefully as the page. Verify sources and numerical examples,
                  then run the typecheck, tests, build and visual audit:
                </p>
                <details class="fw-guide-details">
                  <DisclosureSummary>Show check commands</DisclosureSummary>
                  <div>
                    <CodeBlock artifact={checkCommands} />
                  </div>
                </details>
                <p>
                  Review the audit’s screenshots at desktop and phone widths. Read first-use
                  definitions, open the reasoning, and pause animations between steps. The audit
                  measures layout and visibility; you still check whether the explanation is true.
                </p>
              </section>

              <section
                id="developer-publish"
                class="fw-guide-section"
                aria-labelledby="developer-publish-title"
              >
                <h2 id="developer-publish-title">Publish.</h2>
                <details id="publication-setup" class="fw-guide-details">
                  <DisclosureSummary>Publish from your own account</DisclosureSummary>
                  <div>
                    <p>
                      Use your own Cloudflare account, with no invitation required. Log in once,
                      then build, check and publish your note:
                    </p>
                    <CodeBlock artifact={publishCommands} />
                  </div>
                </details>

                <details class="fw-guide-details">
                  <DisclosureSummary>
                    Publish with an invitation to the hosted service
                  </DisclosureSummary>
                  <div>
                    <p>
                      The owner supplies a private publisher credential file. Store it outside the
                      project, with file permissions <code>0600</code> and directory permissions{" "}
                      <code>0700</code>. Log in once, then share:
                    </p>
                    <CodeBlock artifact={shareCommands} />
                    <p>
                      The share command builds one self-contained HTML file, publishes it, verifies
                      the downloaded bytes, and prints the link. Repeat it to update the same link.
                      Each version also has a permanent link. Reading needs only a link.
                    </p>
                    <p>
                      After a network interruption, repeat the same command. Its private retry
                      journal preserves the original operation and bytes; keep that journal. A
                      version conflict needs review: the client never silently replaces someone
                      else’s newer work.
                    </p>
                    <p>
                      Each publisher starts with a{" "}
                      {import.meta.env.VITE_FRAMEWORK_PUBLIC === "1" ? "32" : "128"} MiB allowance
                      across all versions and a limit of 1,000 retained versions.
                    </p>
                  </div>
                </details>

                <details class="fw-guide-details">
                  <DisclosureSummary>What a hosted HTML file can contain</DisclosureSummary>
                  <div>
                    <p>
                      Upload one valid UTF-8 HTML file, at most 5 MiB. Bundle scripts, styles, fonts
                      and images into that file. Relative attachments need another hosting route.
                    </p>
                    <p>
                      Hosted notes run in an isolated frame. Network requests, storage, forms,
                      popups and access to the surrounding page are blocked.
                    </p>
                    <p>
                      Anyone with the link can read the note and download its original HTML. This
                      service retains all versions and has no deletion command. Keep private
                      material and credentials out of your notes.
                    </p>
                  </div>
                </details>

                <details class="fw-guide-details">
                  <DisclosureSummary>
                    Bring an existing page or run your own service
                  </DisclosureSummary>
                  <div>
                    <p>
                      For an existing HTML page, use the <a href="/#share">upload form</a> or
                      download the{" "}
                      <a href="/cli.ts" download="cli.ts">
                        standalone Bun client
                      </a>
                      . Check the <a href="/starter.sha256">checksums</a> before running a
                      downloaded client.{" "}
                      {import.meta.env.VITE_FRAMEWORK_PUBLIC === "1" ? (
                        <>
                          <a href="/account">Create an account</a> with a passkey, then approve your
                          agent’s login link. Add a backup passkey in Your notes.
                        </>
                      ) : (
                        "Hosted uploads still require an invitation."
                      )}
                    </p>
                    <CodeBlock artifact={uploadCommands} />
                    <p>
                      To run your own upload service, use the framework repository’s{" "}
                      <code>sharing/</code> Worker, D1 migration and{" "}
                      <code>wrangler.sharing.jsonc</code>. Its README covers database setup,
                      owner-key bootstrap, invitations and verification. The portable starter
                      contains the authoring kit and client.
                    </p>
                  </div>
                </details>
              </section>
            </div>
          </details>
        </article>
      </div>
      <Footer />
    </main>
  );
};
