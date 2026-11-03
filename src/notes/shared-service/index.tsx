import { createMemo } from "solid-js";
import { createScene, Experiment, More, type Scene } from "../../kit";
import { ServiceFigure } from "./ServiceFigure";
import { buildServiceTrace, serviceAt, serviceCues } from "./model";
import { note } from "./chapters";
import { ExampleNav } from "../example-nav";
import meta from "./note.json";
import "./service.css";

const { Page, Chapter } = note;
export function ServiceExperiment(props: { scene?: Scene } = {}) {
  const trace = buildServiceTrace();
  const scene = props.scene ?? createScene(trace.beats);
  const frame = createMemo(() => serviceAt(trace, scene.t()));
  const cues = serviceCues(trace);
  return (
    <Experiment
      id="service-experiment"
      scene={scene}
      timeline="Service position"
      transportPosition="above"
      sound={cues}
      caption={
        <>
          <span class="ss-caption-event" data-service-caption>
            {frame().caption}
          </span>
        </>
      }
    >
      <ServiceFigure trace={trace} frame={frame()} />
    </Experiment>
  );
}

export default function SharedService() {
  return (
    <>
      <ExampleNav />
      <Page
        meta={meta}
        date="2026-10-24"
        kicker="An explanation you can play"
        howTo={false}
        references="compact"
        dek={<>Open another window. Keep the same work.</>}
      >
        <Chapter id="one-service">
          <p>
            A <strong>session</strong> is work kept by the service. Press Play to see which windows
            share it.
          </p>
          <ServiceExperiment />
          <p class="ss-result">A new window does not have to mean a new session.</p>
          <More summary="Why do some windows share a row?">
            <p>
              Terminal and Web share one session. Desktop and <code>review.ts</code> ask for
              different work, so each gets its own row in the same service. A{" "}
              <strong>subscriber</strong> is a window watching that session. Its reply goes only to
              those subscribers.
            </p>
            <p class="ss-attribution">
              This is an educational simulation inspired by the four-client example in Anomaly’s{" "}
              <a href="https://anoma.ly/notes/opencode-2-0/">OpenCode 2.0: The Service</a>. No
              server runs here; PID 48213 and the timings are illustrative.
            </p>
          </More>
        </Chapter>
      </Page>
    </>
  );
}
