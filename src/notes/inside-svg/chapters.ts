import { defineNote } from "../../kit";
export const note = defineNote({
  slug: "inside-svg",
  chapters: [
    {
      id: "layers",
      title: "Pull the picture apart",
      question: "What is the picture made of?",
    },
    {
      id: "order",
      title: "Change what covers the sun",
      question: "Which shape gets the last word?",
      from: ["svg"],
    },
    {
      id: "window",
      title: "Move the window",
      question: "Hidden, or gone?",
      from: ["clip"],
    },
    {
      id: "path",
      title: "Read the path",
      question: "What does an outline actually say?",
      from: ["pathData", "lab"],
    },
  ],
  sources: {
    pathData: {
      title: "d attribute",
      who: "MDN",
      short: "path data",
      url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/d",
      why: "What each path command draws, and how it continues from the current point.",
    },
    lab: {
      title: "Interaction Lab",
      who: "AI for UI",
      short: "AI for UI",
      url: "https://aiforui.dev/lab",
      why: "The idea of reading a bell's path through a draggable slit. This bell and code are original.",
    },
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
