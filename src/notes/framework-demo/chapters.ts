import { defineNote } from "../../kit";

export const note = defineNote({
  slug: "framework-demo",
  chapters: [
    {
      id: "mix",
      title: "Start with a straight line",
      question: "Can you put the dot halfway?",
    },
    {
      id: "nest",
      title: "Repeat that small move",
      question: "How do straight lines make a curve?",
    },
    {
      id: "weights",
      title: "See which dot matters",
      question: "Which part of the line does each dot change?",
    },
    {
      id: "code",
      title: "Follow a simple recipe",
      question: "What does the computer repeat?",
    },
    {
      id: "flatten",
      title: "Make it look smooth",
      question: "How close can straight pieces get?",
    },
    {
      id: "forms",
      title: "Change the view",
      question: "Can you follow one strip as it moves?",
    },
  ],
  sources: {
    pomax: {
      title: "A Primer on Bézier Curves",
      who: "Pomax",
      short: "Pomax",
      url: "https://pomax.github.io/bezierinfo/",
      why: "De Casteljau’s algorithm, the hull property and flattening, with interactive examples.",
    },
    bezier: {
      title: "Bézier curve",
      who: "Wikipedia",
      short: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/B%C3%A9zier_curve",
      why: "The Bernstein form, endpoint interpolation and the convex-hull property.",
    },
    p0811: {
      title: "P0811R3: Well-behaved interpolation for numbers and pointers",
      who: "S. Davis Herring",
      short: "P0811",
      url: "https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p0811r3.html",
      why: "Why a + t(b − a) need not return b at t = 1, and the requirements for a careful lerp.",
    },
    interpolation: {
      title: "Linear interpolation",
      who: "Wikipedia",
      short: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Linear_interpolation",
      why: "The h²/8 · max|f″| bound on linear interpolation error, and the exact and imprecise lerp forms.",
    },
  },
});
