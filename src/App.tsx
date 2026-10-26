import { type Component, For } from "solid-js";
import { A, Route, Router } from "@solidjs/router";
import { notes, only } from "virtual:notes";
import { TooltipLayer } from "./post/scene/tooltip";
import "./notes/navigation.css";

/**
 * Routes come from each note's `src/notes/<slug>/note.json` (see scripts/notes.ts):
 * `/notes/<slug>` for every note, and "/" for the one marked `home`.
 * A single-note build (`VITE_PUBLISH_NOTE=<slug>`) has only that note, no navigation,
 * and serves it at every path.
 */
const home = notes.find((n) => n.home) ?? notes[0];

const App: Component = () => (
  <Router
    root={(props) => (
      <>
        {!only && (
          <nav class="note-navigation" aria-label="Notes">
            <For each={notes}>
              {(n) => (
                <A
                  href={n === home ? "/" : `/notes/${n.slug}`}
                  end={n === home}
                  activeClass="current-note"
                >
                  {n.nav}
                </A>
              )}
            </For>
          </nav>
        )}
        {props.children}
        <TooltipLayer />
      </>
    )}
  >
    <Route path="/" component={home.component} />
    {notes.map((n) => (
      <Route path={`/notes/${n.slug}`} component={n.component} />
    ))}
    {only && <Route path="*" component={home.component} />}
  </Router>
);

export default App;
