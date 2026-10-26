import type { JSX } from "solid-js";
import { render } from "solid-js/web";

const roots = new Set<() => void>();

/** Each test owns its mounted Solid roots; teardown disposes before removing their DOM. */
export function mount(component: () => JSX.Element) {
  const container = document.createElement("section");
  container.className = "component-test-surface";
  document.body.append(container);
  const dispose = render(component, container);
  const unmount = () => {
    if (!roots.delete(unmount)) return;
    dispose();
    container.remove();
  };
  roots.add(unmount);
  return { container, unmount };
}

export function cleanup() {
  for (const unmount of roots) unmount();
}

export async function painted() {
  await document.fonts.ready;
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
