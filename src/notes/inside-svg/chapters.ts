import { defineNote } from "../../kit";
export const note = defineNote({
  slug: "inside-svg",
  chapters: [
    {
      id: "layers",
      title: "Pull the picture apart",
      question: "What is the picture made of?",
      takeaway: "Simple shapes combine into one drawing.",
    },
    {
      id: "order",
      title: "Change what covers the sun",
      question: "Which shape gets the last word?",
      takeaway: "Later shapes paint over earlier shapes.",
      from: ["svg"],
    },
    {
      id: "window",
      title: "Move the window",
      question: "Hidden, or gone?",
      takeaway: "Clipping limits paint without changing the shapes.",
      from: ["clip"],
    },
  ],
  sources: {
    svg: {
      title: "SVG 2 — Rendering Model",
      who: "W3C",
      short: "SVG 2",
      url: "https://www.w3.org/TR/SVG2/render.html",
      why: "The painter’s model and ordering of graphics in the rendering tree.",
    },
    clip: {
      title: "<clipPath>",
      who: "MDN",
      short: "clipPath",
      url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath",
      why: "Clipping restricts painted regions while leaving inherent geometry and bounding boxes intact.",
    },
  },
});
