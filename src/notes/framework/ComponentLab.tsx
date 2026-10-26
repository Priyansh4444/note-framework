import { createSignal } from "solid-js";
import { DisclosureSummary, Check, Parameter } from "../../kit";
import "./component-lab.css";

/** Review fixtures render the actual kit and inherited page styles. Preview build only. */
export default function ComponentLab() {
  const [mix, setMix] = createSignal(0.4);
  const [signed, setSigned] = createSignal(-12.5);
  return (
    <main class="nk-note ui-review">
      <article>
        <header>
          <h1>Control review</h1>
          <p>Keyboard focus, wrapping and motion at real sizes.</p>
        </header>
        <section class="ui-case" data-case="range">
          <Parameter
            label="Mix amount"
            value={mix()}
            min={0}
            max={1}
            step={0.01}
            onInput={setMix}
          />
          <output data-case-value>{mix()}</output>
        </section>
        <section class="ui-case" data-case="long-range">
          <Parameter
            label="How far should this point move between its two endpoints?"
            value={signed()}
            min={-100}
            max={100}
            step={0.25}
            unit="ms"
            onInput={setSigned}
          />
        </section>
        <section class="ui-case" data-case="disabled-range">
          <Parameter
            label="A disabled control"
            value={0.5}
            min={0}
            max={1}
            step={0.01}
            onInput={() => {}}
            disabled
          />
        </section>
        <section class="ui-case" data-case="disclosure">
          <details>
            <DisclosureSummary>What is the rule behind this move?</DisclosureSummary>
            <p>The native disclosure opens with Enter, Space or a click.</p>
          </details>
        </section>
        <section class="ui-case" data-case="long-disclosure">
          <details>
            <DisclosureSummary>
              Why does this much longer explanation keep its marker beside the first line when the
              words wrap onto several lines?
            </DisclosureSummary>
            <p>The next lines belong to the same text column.</p>
          </details>
        </section>
        <section class="ui-case" data-case="check">
          <Check q="Does a long question keep its marker and label beside the first line when it wraps on a phone?">
            <p>All three boxes share the first line’s height.</p>
          </Check>
        </section>
      </article>
    </main>
  );
}
