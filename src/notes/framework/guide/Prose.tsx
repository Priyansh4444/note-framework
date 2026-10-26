import { Check, Equation, defineNote } from "../../../kit";

const note = defineNote({
  slug: "mix-example",
  chapters: [
    {
      id: "mix",
      title: "Mix two points",
      question: "Where does a weighted average land?",
      takeaway: "The weights add to one.",
    },
  ],
  sources: {
    pomax: {
      title: "A Primer on Bézier Curves",
      short: "Pomax",
      url: "https://pomax.github.io/bezierinfo/",
    },
  },
});
const { Cite } = note;
const { T } = note.glossary({
  lerp: {
    name: "Linear interpolation",
    says: () => <>A weighted average of two endpoints.</>,
    home: "mix",
  },
});

export function Prose() {
  return (
    <div class="nk-note note-mix-example">
      <p>
        <T k="lerp">Linear interpolation</T> is a weighted average: for distinct A and B and 0 ≤ t ≤
        1, it gives the point t of the way from A to B <Cite k="pomax" />.
      </p>
      <Equation tex="p(t)=(1-t)\,A+t\,B" label="Linear interpolation" />
      <Check q="At t = 0.25, which end is p closer to?">
        <p>A. Its weight is 0.75 and B’s is 0.25.</p>
      </Check>
    </div>
  );
}
