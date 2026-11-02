import { For } from "solid-js";
import { ArrowLabel } from "../../kit/parts";
import { usePageHead } from "../../kit/note";
import { Footer, Masthead } from "./index";
import "./studies.css";
import { studies } from "./study-registry";

export default function Studies() {
  usePageHead(
    "Motion studies — Note Framework",
    "Five different ways to make a picture answer your hand: Hairline, mechanical reach, morphing, ink and a spring instrument.",
  );
  return (
    <main class="fw-page fw-studies">
      <Masthead here="studies" />
      <header class="study-intro">
        <p class="fw-eyebrow">Try a mechanism</p>
        <h1>Five studies in motion.</h1>
        <p class="fw-dek">
          Five small experiences: a folio tray, a mechanical arm, a changing shape, ink on paper,
          and a spring. Open one and see what stays connected as you move it.
        </p>
        <p>
          <a class="study-open" href="/docs#patterns">
            <ArrowLabel>Use the patterns in a note</ArrowLabel>
          </a>
        </p>
      </header>
      <div class="study-grid">
        <For each={studies}>
          {(study, index) => (
            <article class="study-card" data-study={study.id}>
              <div class="study-card-body">
                <p class="study-kicker">
                  <span>{String(index() + 1).padStart(2, "0")}</span>
                  {study.label}
                </p>
                <h2>{study.title}</h2>
                <p>{study.text}</p>
                <a class="study-open" href={study.href}>
                  <ArrowLabel>{study.action}</ArrowLabel>
                </a>
                <a class="study-credit" href={study.source}>
                  {study.credit} ↗
                </a>
              </div>
              <a class="study-poster" href={study.href} tabindex="-1" aria-hidden="true">
                <img
                  src={`/studies/previews/${study.id}.webp`}
                  width="720"
                  height="450"
                  alt=""
                  loading={index() > 1 ? "lazy" : "eager"}
                />
              </a>
            </article>
          )}
        </For>
      </div>
      <p class="study-colophon">
        Each study is independently drawn and coded. Hairline uses its original engine and creation
        workflow; the other motion studies reinterpret the linked references.
      </p>
      <Footer />
    </main>
  );
}
