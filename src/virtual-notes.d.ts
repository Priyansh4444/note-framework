declare module "virtual:notes" {
  import type { Component } from "solid-js";
  /** Set when the build publishes a single note (VITE_PUBLISH_NOTE). */
  export const only: string | null;
  export const notes: {
    slug: string;
    title: string;
    nav: string;
    home: boolean;
    component: Component;
  }[];
}

declare module "virtual:single-note" {
  import type { Component } from "solid-js";
  const Note: Component;
  export default Note;
}
