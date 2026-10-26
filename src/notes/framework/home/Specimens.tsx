import { EXAMPLE } from "./links";
import { createSignal } from "solid-js";
import {
  Check,
  createScene,
  DiagramViewer,
  Equation,
  Experiment,
  Parameter,
  Tex,
  defineNote,
} from "../../../kit";
import { mix } from "../../framework-demo/examples/de-casteljau";

// A one-chapter manifest, only so the glossary specimen is the real component.
const specimen = defineNote({
  slug: "framework-specimen",
  chapters: [{ id: "parts", title: "Parts", question: "", takeaway: "" }],
});
const { T } = specimen.glossary({
  invariant: {
    name: "Invariant",
    says: () => (
      <>
        A fact that stays true after every step. Here, B(t) stays inside the control points’ hull.
      </>
    ),
  },
});

const A = [40, 90] as const,
  B = [300, 30] as const;

function ParameterSpecimen() {
  const [t, setT] = createSignal(0.3);
  const p = () => mix(A, B, t());
  return (
    <>
      <Parameter
        label={
          <>
            Mix amount <var>t</var>
          </>
        }
        value={t()}
        min={0}
        max={1}
        step={0.01}
        onInput={setT}
      />
      <DiagramViewer
        viewBox={[20, 10, 300, 100]}
        label={`A point ${t().toFixed(2)} of the way along a segment.`}
      >
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} class="fw-spec-line" />
        <circle cx={p()[0]} cy={p()[1]} r="7" class="fw-spec-point" />
      </DiagramViewer>
    </>
  );
}

function SceneSpecimen() {
  const scene = createScene([{ label: "Play the sweep", ms: 2400 }]);
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const u = () => ease(scene.progress(0));
  const q = (s: number) => {
    const a = mix(A, [170, -10], s),
      b = mix([170, -10], B, s);
    return mix(a, b, s);
  };
  const path = () =>
    Array.from({ length: 41 }, (_, k) => q((u() * k) / 40))
      .map((v, k) => `${k ? "L" : "M"}${v[0].toFixed(1)} ${v[1].toFixed(1)}`)
      .join("");
  return (
    <Experiment
      scene={scene}
      question=""
      caption="Nothing moves until asked. Seek, pause and replay share one clock."
    >
      <DiagramViewer
        viewBox={[20, 0, 300, 110]}
        label="A quadratic curve traced by its moving point."
      >
        <path
          d={Array.from({ length: 41 }, (_, k) => q(k / 40))
            .map((v, k) => `${k ? "L" : "M"}${v[0].toFixed(1)} ${v[1].toFixed(1)}`)
            .join("")}
          class="fw-spec-ghost"
        />
        <path d={path()} class="fw-spec-curve" />
        <circle cx={q(u())[0]} cy={q(u())[1]} r="7" class="fw-spec-point" />
      </DiagramViewer>
    </Experiment>
  );
}

/** Real kit components, not pictures of them. */
export function Specimens() {
  return (
    <div class="fw-specimens nk-note">
      <article class="fw-spec">
        <header>
          <code>&lt;Parameter&gt;</code>
          <h3>Give the reader the variable.</h3>
        </header>
        <p>A native range input with an exact readout. Your signal owns the value.</p>
        <div class="fw-spec-live">
          <ParameterSpecimen />
        </div>
      </article>
      <article class="fw-spec">
        <header>
          <code>createScene</code>
          <h3>Move only when asked.</h3>
        </header>
        <p>
          Every frame is a function of one seekable clock, and reduced motion opens on the final
          frame.
        </p>
        <div class="fw-spec-live">
          <SceneSpecimen />
        </div>
      </article>
      <article class="fw-spec">
        <header>
          <code>&lt;T&gt;</code>
          <h3>Keep the words close.</h3>
        </header>
        <p>
          Define a term once. Readers hover, focus or tap for a reminder, and the glossary collects
          it.
        </p>
        <div class="fw-spec-live fw-spec-prose">
          <p>
            The curve keeps one <T k="invariant" /> while you drag: it never leaves the shape around
            its control points.
          </p>
        </div>
      </article>
      <article class="fw-spec">
        <header>
          <code>&lt;Equation&gt;</code>
          <h3>Typeset the math properly.</h3>
        </header>
        <p>
          Strict KaTeX with local fonts and MathML, plus a phone layout that never scrolls sideways.
        </p>
        <div class="fw-spec-live">
          <Equation tex="B(t)=\sum_{i=0}^{3}\binom{3}{i}t^i(1-t)^{3-i}P_i" />
        </div>
      </article>
      <article class="fw-spec fw-spec-wide">
        <header>
          <code>&lt;Check&gt;</code>
          <h3>Ask before you tell.</h3>
        </header>
        <p>
          A question with its reasoning folded underneath. Selecting the question’s text doesn’t
          open it.
        </p>
        <div class="fw-spec-live">
          <Check q={<>Can a Bézier curve leave the hull of its control points?</>}>
            <p>
              No. Each point is a weighted average with nonnegative weights summing to one, so it
              stays inside. The <a href={EXAMPLE}>example note</a> proves it and tests it at 201
              values of <Tex tex="t" />.
            </p>
          </Check>
        </div>
      </article>
    </div>
  );
}
