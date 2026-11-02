import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { CodeBlock } from "../src/kit/CodeBlock";
import patch from "../src/notes/framework-demo/examples/lerp.diff?diff";

export function mountCopyFixture() {
  const root = document.createElement("main");
  root.style.cssText = "max-width:680px;margin:0 auto;padding:20px;color:var(--text)";
  document.body.replaceChildren(root);
  const [shown, setShown] = createSignal(true);
  return render(
    () => (
      <>
        <button onClick={() => setShown(false)}>Remove source</button>
        <textarea aria-label="Other selection">Keep this selection</textarea>
        <Show when={shown()}>
          <CodeBlock artifact={patch} />
        </Show>
      </>
    ),
    root,
  );
}
