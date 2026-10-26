import { defineNote } from "../../kit";

export const note = defineNote({
  slug: "framework-demo",
  chapters: [
    {
      id: "mix",
      title: "Start with a straight line",
      question: "Can you put the dot halfway?",
      takeaway: "A mix picks a spot between two ends and never goes past either one.",
    },
    {
      id: "nest",
      title: "Repeat that small move",
      question: "How do straight lines make a curve?",
      takeaway: "Mix four dots into three, then two, then one. That last dot draws the curve.",
      from: ["pomax"],
    },
    {
      id: "weights",
      title: "See which dot matters",
      question: "Which part of the line does each dot change?",
      takeaway: "The dots have different amounts of influence along the curve.",
      from: ["bezier"],
    },
    {
      id: "code",
      title: "Follow a simple recipe",
      question: "What does the computer repeat?",
      takeaway: "The same little mix is repeated until one dot remains.",
      from: ["p0811"],
    },
    {
      id: "flatten",
      title: "Make it look smooth",
      question: "How close can straight pieces get?",
      takeaway: "Adding more straight pieces makes a closer fit to the curve.",
      from: ["interpolation"],
    },
    {
      id: "patterns",
      title: "Let the drawing change form",
      question: "What else can the same geometry do?",
      takeaway: "Keep the parts and their order. Then change how they are arranged or drawn.",
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
