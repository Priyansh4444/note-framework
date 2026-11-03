/* A self-contained note has no site router or origin-dependent history. */
import { render } from "solid-js/web";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/commit-mono/400.css";
import "./kit/base.css";
import "./kit/theme.css";
import { TooltipLayer } from "./kit/scene/tooltip";
import { installSpringVars } from "./kit/scene/springs";
import Note from "virtual:single-note";

installSpringVars();
const root = document.getElementById("app");
if (!root) throw new Error("Missing note mount point");
render(
  () => (
    <>
      <Note />
      <TooltipLayer />
    </>
  ),
  root,
);
