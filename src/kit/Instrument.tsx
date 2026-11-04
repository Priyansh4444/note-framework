import { type JSX, type ParentProps, Show } from "solid-js";
import "./instrument.css";

/**
 * An instrument's anatomy, a phrase or a number each: its name and what to do, the picture,
 * then the model, its parameters and the live state. Put it inside an Experiment.
 */
export function Instrument(
  props: ParentProps<{
    name: string;
    hint: string;
    model?: JSX.Element;
    params?: JSX.Element;
    live?: JSX.Element;
  }>,
) {
  return (
    <div class="nk-instrument">
      <header class="nk-instrument-head">
        <span class="nk-instrument-name">{props.name}</span>
        <span>{props.hint}</span>
      </header>
      {props.children}
      <Show when={props.model || props.params || props.live}>
        <footer class="nk-instrument-foot">
          <Show when={props.model}>
            <p class="nk-instrument-model">{props.model}</p>
          </Show>
          <p class="nk-instrument-state">
            <span>{props.params}</span>
            <span data-instrument-live>{props.live}</span>
          </p>
        </footer>
      </Show>
    </div>
  );
}
