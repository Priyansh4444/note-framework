import { NoteNav } from "../kit";

/** Local and public-site builds link within the site; a standalone export links to the public site. */
export const frameworkOrigin =
  import.meta.env.VITE_FRAMEWORK_PREVIEW === "1"
    ? ""
    : "https://note-framework-public.pronsh.workers.dev";

/** The header shared by the framework's example notes. */
export const ExampleNav = () => (
  <NoteNav
    home={{ href: `${frameworkOrigin}/`, label: "Note Framework" }}
    action={{ href: `${frameworkOrigin}/docs`, label: "Build a note like this" }}
  />
);
