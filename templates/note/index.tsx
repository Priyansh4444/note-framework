import selectionCode from "./examples/selection.ts?code";
import { DisclosureSummary, Check, CodeBlock } from "../../kit";
import { note } from "./chapters";
import { FillFigure } from "./figures/FillFigure";
import { T } from "./glossary";
import meta from "./note.json";
import "./note.css";

const { Page, Chapter, Cite } = note;

export default function Note() {
  return (
    <Page
      meta={meta}
      date="__DATE__"
      read="3 min read"
      kicker="A visual note"
      dek={<>See one example. Understand the rule. Try it yourself.</>}
      howTo={false}
    >
      <p>
        An explanation gets easier when you can point to the thing that changes. Here, nine letters
        occupy sixteen numbered places. Follow one selection, then check whether you can explain it.
      </p>
      <Chapter id="picture">
        <p>
          A <T k="slot">slot</T> is one place for an item. Its <T k="index">index</T> is the place's
          number, starting at zero. The seventh letter therefore lives in slot 6{" "}
          <Cite k="indexing" />.
        </p>
        <FillFigure n={1} />
        <p>The outline selects a position. The letter inside it is the value stored there.</p>
      </Chapter>
      <Chapter id="why">
        <p>
          Replacing G with a different letter would change the value, but not the slot's number.
          That distinction is the <T k="invariant">invariant</T>: a fact the example keeps true
          after every step.
        </p>
        <CodeBlock artifact={selectionCode} />
        <Check q="Which item is in slot 6, and why isn't it F?">
          <p>G. A is in slot 0, so F is in slot 5 and G is in slot 6.</p>
        </Check>
        <details class="starter-reasoning">
          <DisclosureSummary>How the picture stays consistent</DisclosureSummary>
          <p>
            All sixteen slots exist throughout the animation. One scene clock controls their fill
            and the selection outline. Playing, pausing, or choosing a step changes their
            attributes; it never replaces the diagram.
          </p>
        </details>
      </Chapter>
    </Page>
  );
}
