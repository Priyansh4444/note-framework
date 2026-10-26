import { createSignal } from "solid-js";
import { Experiment, Parameter } from "../../kit";

export function Slider() {
  const [t, setT] = createSignal(0.25);
  const mixed = () => (1 - t()) * 20 + t() * 80;
  return (
    <Experiment
      question="Where does a mix of 20 and 80 land?"
      controls={
        <Parameter
          label={
            <>
              Mix amount <var>t</var>
            </>
          }
          value={t()}
          min={0}
          max={1}
          step={0.05}
          onInput={setT}
        />
      }
      caption="The readout and the slider read the same signal."
    >
      <output class="guide-readout" aria-live="polite">
        (1 − {t().toFixed(2)}) · 20
        {" + "}
        {t().toFixed(2)} · 80
        {" = "}
        <strong>{mixed().toFixed(1)}</strong>
      </output>
    </Experiment>
  );
}
