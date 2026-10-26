import { createSignal, For } from "solid-js";
import { CodeBlock, DisclosureSummary } from "../../../kit";
import { PatternMorph } from "../examples/pattern-morph";
import { PatternLayers } from "../examples/pattern-layers";
import { PatternInk } from "../examples/pattern-ink";
import morphSource from "../examples/pattern-morph.tsx?code";
import layersSource from "../examples/pattern-layers.tsx?code";
import inkSource from "../examples/pattern-ink.tsx?code";
import { points } from "../bezier/store";
import "./patterns.css";

const choices = [
  {
    id: "morph",
    label: "Morph",
    source: morphSource,
    description:
      "Keep the same pieces while changing their destination. These strips come from the curve you edited above.",
  },
  {
    id: "layers",
    label: "Layers",
    source: layersSource,
    description:
      "Separate that same drawing into its handles, exact curve and straight chords. The face-on view shows what the lifted sheet adds.",
  },
  {
    id: "ink",
    label: "Ink",
    source: inkSource,
    description:
      "Use the same curve as a brush guide. Change how the marks follow it without changing the four control points.",
  },
] as const;
export function Patterns() {
  const [selected, setSelected] = createSignal<(typeof choices)[number]["id"]>("morph");
  const active = () => choices.find((choice) => choice.id === selected())!;
  return (
    <div class="bz-patterns">
      <div class="bz-pattern-tabs" role="tablist" aria-label="Drawing patterns">
        <For each={choices}>
          {(choice, index) => (
            <button
              type="button"
              role="tab"
              id={`pattern-tab-${choice.id}`}
              aria-controls={`pattern-panel-${choice.id}`}
              aria-selected={selected() === choice.id}
              tabIndex={selected() === choice.id ? 0 : -1}
              onClick={() => setSelected(choice.id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const i =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? choices.length - 1
                      : (index() + (event.key === "ArrowRight" ? 1 : choices.length - 1)) %
                        choices.length;
                setSelected(choices[i].id);
                document.getElementById(`pattern-tab-${choices[i].id}`)?.focus();
              }}
            >
              {choice.label}
            </button>
          )}
        </For>
      </div>
      <For each={choices}>
        {(choice) => (
          <section
            role="tabpanel"
            id={`pattern-panel-${choice.id}`}
            aria-labelledby={`pattern-tab-${choice.id}`}
            hidden={selected() !== choice.id}
            tabIndex="0"
          >
            <p>{choice.description}</p>
            {choice.id === "morph" ? (
              <PatternMorph points={points()} />
            ) : choice.id === "layers" ? (
              <PatternLayers points={points()} />
            ) : (
              <PatternInk points={points()} />
            )}
          </section>
        )}
      </For>
      <details class="bz-deeper bz-pattern-source">
        <DisclosureSummary>Source for {active().label}</DisclosureSummary>
        <p>
          This is the component rendered in the selected tab. It receives the page’s four control
          points; the starter includes the geometry functions and drawing helpers it imports.
        </p>
        <CodeBlock artifact={active().source} />
      </details>
    </div>
  );
}
