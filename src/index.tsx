/* @refresh reload */
import { render } from "solid-js/web";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/commit-mono/400.css";
import "./kit/base.css";
import "./kit/theme.css";
import App from "./App";
import { installSpringVars } from "./kit/scene/springs";

installSpringVars();

const root = document.getElementById("app");

if (!root) throw new Error("Root element #app not found");

render(() => <App />, root);
