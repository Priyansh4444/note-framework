import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Parameter } from "../src/kit/Parameter";

export function mountParameterFixture() {
  const root = document.createElement("main");
  root.id = "parameter-fixture";
  root.className = "nk-note";
  root.style.cssText =
    "position:absolute;inset:0 auto auto 20px;width:calc(100% - 40px);max-width:630px;background:var(--bg);padding:20px 0";
  document.body.replaceChildren(root);
  const [value, setValue] = createSignal(0.4);
  const [disabled, setDisabled] = createSignal(false);
  const [max, setMax] = createSignal(1);
  const [step, setStep] = createSignal(0.01);
  const [signed, setSigned] = createSignal(-12.5);
  const [updates, setUpdates] = createSignal(0);
  const dispose = render(
    () => (
      <>
        <section data-parameter="main">
          <Parameter
            label="Mix amount"
            value={value()}
            min={0}
            max={max()}
            step={step()}
            disabled={disabled()}
            onInput={(next) => {
              setValue(next);
              setUpdates((n) => n + 1);
            }}
          />
          <output data-value>{value()}</output>
          <output data-updates>{updates()}</output>
        </section>
        <section data-parameter="signed" style="margin-top:24px">
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
        <section data-parameter="degenerate" style="margin-top:24px">
          <Parameter
            label="Single value"
            value={5}
            min={5}
            max={5}
            step={0.25}
            onInput={() => {}}
          />
        </section>
      </>
    ),
    root,
  );
  Object.assign(window, { parameterFixture: { setValue, setDisabled, setMax, setStep, dispose } });
}
