import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Axes, DiagramViewer } from "../../kit";
import { response, stroke, type Pose } from "./model";

const WIDTH = 560,
  X1 = 536,
  Y1 = 12,
  SECONDS = 2;

/** The release the carriage is following, from the same exact solution that moves it. */
export function ResponseChart(props: { release: Pose; ratio: number; now?: number }) {
  // The same plot reads at about 130px tall at either width: squat on desktop, deeper on a phone.
  const media = matchMedia("(max-width: 600px)");
  const [phone, setPhone] = createSignal(media.matches);
  onMount(() => {
    const update = () => setPhone(media.matches);
    media.addEventListener("change", update);
    onCleanup(() => media.removeEventListener("change", update));
  });
  const height = () => (phone() ? 270 : 136);
  // Axis labels keep their screen size, so a phone's narrower plot needs a wider margin in units.
  const X0 = () => (phone() ? 112 : 56);
  const X = (seconds: number) => X0() + (seconds / SECONDS) * (X1 - X0());
  const Y0 = () => height() - 28;
  const Y = (mm: number) => (Y0() + Y1) / 2 - (mm / stroke) * ((Y0() - Y1) / 2);
  const path = () =>
    Array.from({ length: 161 }, (_, i) => {
      const seconds = (i / 160) * SECONDS;
      const { x } = response(props.release, seconds, props.ratio);
      return `${i ? "L" : "M"}${X(seconds).toFixed(2)} ${Y(x).toFixed(2)}`;
    }).join("");
  const onChart = () => (props.now !== undefined && props.now <= SECONDS ? props.now : undefined);
  return (
    <DiagramViewer
      viewBox={[0, 0, WIDTH, height()]}
      label={`Displacement against time for this release, at damping ratio ${props.ratio}.`}
    >
      <Axes
        x0={X0()}
        x1={X1}
        y0={Y0()}
        y1={Y1}
        x={[0, 0.5, 1, 1.5, 2].map((s) => ({ at: X(s), label: `${s}s` }))}
        y={[
          { at: Y(-stroke), label: `−${stroke}` },
          { at: Y(0), label: 0 },
          { at: Y(stroke), label: `${stroke} mm` },
        ]}
      />
      <line class="nk-axis" x1={X0()} x2={X1} y1={Y(0)} y2={Y(0)} />
      <path class="nk-curve nk-blue" data-response-curve d={path()} />
      <Show when={onChart()}>
        {(seconds) => (
          <circle
            class="nk-point nk-blue"
            data-response-now
            cx={X(seconds())}
            cy={Y(response(props.release, seconds(), props.ratio).x)}
          />
        )}
      </Show>
    </DiagramViewer>
  );
}
