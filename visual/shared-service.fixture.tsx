import { render } from "solid-js/web";
import { createScene } from "../src/kit";
import { ServiceExperiment } from "../src/notes/shared-service";
import { buildServiceTrace } from "../src/notes/shared-service/model";

declare global {
  interface Window {
    serviceFixture: { seek(ms: number): void; dispose(): void };
  }
}

/** The real note experiment with a deterministic test transport, never a second clock. */
export function mountServiceFixture() {
  const root = document.createElement("main");
  root.className = "nk-note note-shared-service";
  root.style.cssText = "width:min(760px,calc(100% - 40px));margin:20px auto;padding:0";
  document.body.replaceChildren(root);
  const dispose = render(() => {
    const scene = createScene(buildServiceTrace().beats);
    window.serviceFixture = {
      seek(ms) {
        scene.pause();
        scene.seek(ms);
      },
      dispose: () => dispose(),
    };
    return <ServiceExperiment scene={scene} />;
  }, root);
}
