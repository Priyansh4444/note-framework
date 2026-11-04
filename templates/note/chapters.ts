import { defineNote } from "../../kit";

// Replace the example with your topic. Outline the questions before the prose.
export const note = defineNote({
  slug: "__SLUG__",
  sources: {
    indexing: {
      title: "Array.prototype.at()",
      who: "MDN Web Docs",
      short: "Zero-based indexing",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at",
      why: "The first item has index zero; a nonnegative integer selects that position.",
    },
  },
  chapters: [
    {
      id: "picture",
      title: "See the state",
      question: "Which place holds the seventh item?",
      from: ["indexing"],
    },
    {
      id: "why",
      title: "Keep the rule",
      question: "What must stay true when the drawing changes?",
    },
  ],
});
