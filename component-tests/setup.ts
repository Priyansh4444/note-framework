import { afterEach, beforeEach, expect } from "vitest";
import { page } from "vitest/browser";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/commit-mono/400.css";
import "../src/post/post.css";
import "../src/post/theme.css";
import "../src/kit/kit.css";
import "../src/kit/motion.css";
import "./surface.css";
import { installSpringVars } from "../src/post/scene/springs";
import { cleanup } from "./mount";

installSpringVars();
const errors: string[] = [];
const recordError = (event: ErrorEvent) => errors.push(event.message);
const recordRejection = (event: PromiseRejectionEvent) =>
  errors.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
beforeEach(async () => {
  errors.length = 0;
  window.addEventListener("error", recordError);
  window.addEventListener("unhandledrejection", recordRejection);
  await page.viewport(1280, 900);
});
afterEach(() => {
  cleanup();
  window.removeEventListener("error", recordError);
  window.removeEventListener("unhandledrejection", recordRejection);
  expect(document.querySelectorAll(".component-test-surface")).toHaveLength(0);
  expect(errors).toEqual([]);
});
