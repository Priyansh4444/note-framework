import casteljauCode from "./examples/de-casteljau.ts?code";
import lerpDiff from "./examples/lerp.diff?diff";
import { ArrowLabel, DisclosureSummary, Check, CodeBlock, Equation, Steps, Tex } from "../../kit";
import { note } from "./chapters";
import { T } from "./glossary";
import { Mix } from "./figures/Mix";
import { Construction } from "./figures/Construction";
import { Weights } from "./figures/Weights";
import { Flatten } from "./figures/Flatten";
import { Patterns } from "./figures/Patterns";
import meta from "./note.json";
import "./demo.css";

const { Page, Chapter, Cite } = note;

const frameworkOrigin =
  import.meta.env.VITE_FRAMEWORK_PREVIEW === "1"
    ? ""
    : "https://note-framework-share.pronsh.workers.dev";

export default function Demo() {
  return (
    <>
      <nav class="bz-example-nav" aria-label="Framework">
        <a href={`${frameworkOrigin}/`}>← Note Framework</a>
        <a href={`${frameworkOrigin}/docs`}>
          <ArrowLabel>Build a note like this</ArrowLabel>
        </a>
      </nav>
      <Page
        meta={meta}
        date="2026-10-22"
        kicker="An example note"
        howTo={false}
        dek={<>Drag a dot. Bend the line. You already know enough to begin.</>}
      >
        <section class="bz-first-try" aria-label="Try drawing a curve">
          <Construction />
          <p class="bz-first-fact">
            The first and last dots hold the ends. The two in the middle bend the line.
          </p>
          <Check q="Can you make the curve straight?">
            <p>
              Choose Straight, or arrange the four dots along one line. The line follows the shape
              you give it.
            </p>
          </Check>
        </section>
        <Chapter id="mix">
          <p>
            It starts with one small move: choose a spot between two ends. Slide the white dot below
            and watch the two pieces change.
          </p>
          <Mix />
          <details class="bz-deeper">
            <DisclosureSummary>What is the rule behind this move?</DisclosureSummary>
            <p>
              Take two points, <Tex tex="A" /> and <Tex tex="B" />. Choose a number <Tex tex="t" />{" "}
              from 0 to 1. <T k="lerp">Linear interpolation</T> puts a point <Tex tex="t" /> of the
              way from <Tex tex="A" /> to <Tex tex="B" />.
            </p>
            <Equation tex="p(t)=(1-t)\,A+t\,B" label="Linear interpolation">
              At t = 0 the point is A; at t = 1 it is B.
            </Equation>
            <p>
              The weight of <Tex tex="A" /> is <Tex tex="1-t" />; the weight of <Tex tex="B" /> is{" "}
              <Tex tex="t" />. Both stay between zero and one and add up to one. That makes{" "}
              <Tex tex="p" /> a <T k="convex" />: a weighted average with nonnegative weights that
              sum to one. Such an average can never leave the segment. Everything below is this one
              operation, repeated.
            </p>
            <Check q="At t = 0.25, which end is p closer to, and what are the weights?">
              <p>
                A. Its weight is 0.75 and B’s is 0.25, so p sits a quarter of the way from A to B.
              </p>
            </Check>
          </details>
        </Chapter>

        <Chapter id="nest">
          <p>
            The grey guide lines repeat that same move. Four dots make three new dots, then two,
            then one. As that last dot moves, it leaves the smooth line you drew above.
          </p>
          <p>
            Press <em>See how it works</em> on the first picture to watch those steps.
          </p>
          <details class="bz-deeper">
            <DisclosureSummary>Meet Bézier curves and see the full recipe</DisclosureSummary>
            <p>
              Give the same idea four <T k="control">control points</T> instead of two:{" "}
              <Tex tex="P_0" /> to <Tex tex="P_3" />. Mix each edge of the polygon they form, using
              one <Tex tex="t" /> throughout. That gives three points. Mix their two edges to get
              two points, then mix those to get one point, <Tex tex="B(t)" />. This repeated mixing
              is <T k="casteljau">de Casteljau’s algorithm</T> <Cite k="pomax" />.
            </p>
            <p>
              As <Tex tex="t" /> runs from 0 to 1, <Tex tex="B(t)" /> traces a cubic Bézier curve.
              At <Tex tex="t=0" /> every mix lands on <Tex tex="P_0" />, and at <Tex tex="t=1" />{" "}
              every mix lands on <Tex tex="P_3" />, so the curve starts and ends on those points.
              The inner points steer it: the curve leaves <Tex tex="P_0" /> heading toward{" "}
              <Tex tex="P_1" /> and arrives at <Tex tex="P_3" /> from the direction of{" "}
              <Tex tex="P_2" />.
            </p>
            <details>
              <DisclosureSummary>Why the curve leaves P₀ toward P₁</DisclosureSummary>
              <p>
                Use the weighted form derived in the next chapter and differentiate it. Only the
                first two weights have a nonzero slope at <Tex tex="t=0" />:
              </p>
              <Steps
                label="Start tangent"
                rows={[
                  [
                    "B'(t)",
                    "-3(1-t)^2P_0+\\bigl(3(1-t)^2-6t(1-t)\\bigr)P_1+\\bigl(6t(1-t)-3t^2\\bigr)P_2+3t^2P_3",
                    <>Differentiate each weight.</>,
                  ],
                  ["B'(0)", "3(P_1-P_0)", <>Set t = 0; the last two terms vanish.</>],
                ]}
              />
              <p>
                So the velocity at the start points from <Tex tex="P_0" /> to <Tex tex="P_1" />,
                with three times that edge’s length. By symmetry, <Tex tex="B'(1)=3(P_3-P_2)" />.
                When <Tex tex="P_1=P_0" />, this first derivative is zero and the direction comes
                from higher derivatives instead.
              </p>
            </details>
            <Check q="Drag P₁ onto P₀ and P₂ onto P₃. What does the curve become?">
              <p>
                The straight segment from P₀ to P₃. Every weight now lands on one of those two
                points, and the weights still add up to one. The speed is uneven, though: B(½) is
                the midpoint, but B(¼) is only 0.15625 of the way along, not 0.25.
              </p>
            </Check>
          </details>
        </Chapter>

        <Chapter id="weights">
          <p>
            Each coloured dot has a different amount of influence. Near the start, the first dot
            matters most. Near the finish, the last one does.
          </p>
          <details class="bz-deeper">
            <DisclosureSummary>Explore how much each dot matters</DisclosureSummary>
            <p>
              Unroll the nesting and each curve point becomes one weighted sum of the four control
              points. The weights are the <T k="bernstein">Bernstein polynomials</T> of degree three{" "}
              <Cite k="bezier" />:
            </p>
            <Equation
              tex="B(t)=(1-t)^3P_0+3t(1-t)^2P_1+3t^2(1-t)P_2+t^3P_3"
              phone="\begin{aligned}B(t)={}&(1-t)^3P_0+3t(1-t)^2P_1\\&+3t^2(1-t)P_2+t^3P_3\end{aligned}"
              label="Bernstein form of a cubic"
            >
              The same point as the nested mixing, for every t.
            </Equation>
            <Weights />
            <p>
              Each weight is a product of <Tex tex="t" />, <Tex tex="1-t" /> and a positive count,
              so none is negative on <Tex tex="[0,1]" />. Together they expand{" "}
              <Tex tex="\bigl((1-t)+t\bigr)^3=1" />. So <Tex tex="B(t)" /> is a convex combination
              of the control points, and it always lies in their <T k="hull" />. The weights depend
              only on <Tex tex="t" />: drag a control point and the chart stays still while the
              picture moves.
            </p>
            <details>
              <DisclosureSummary>Why nested mixing gives these weights</DisclosureSummary>
              <p>
                Follow a path down the construction from a control point to <Tex tex="B(t)" />. It
                takes three mixes. Each step to the right-hand parent multiplies by <Tex tex="t" />;
                each step to the left-hand parent multiplies by <Tex tex="1-t" />. Paths from{" "}
                <Tex tex="P_i" /> take <Tex tex="i" /> steps of one kind and <Tex tex="3-i" /> of
                the other, and there are <Tex tex="\binom{3}{i}" /> of them. Summing the paths gives{" "}
                <Tex tex="\binom{3}{i}t^i(1-t)^{3-i}" />.
              </p>
              <p>
                This page’s tests check the identity numerically at 201 values of <Tex tex="t" />{" "}
                for four control polygons, together with the hull property along two of them.
              </p>
            </details>
            <Check q="At t = ½, which points pull hardest, and by how much?">
              <p>
                P₁ and P₂, each with weight 3/8. P₀ and P₃ each get 1/8, so B(½) = (P₀ + 3P₁ + 3P₂ +
                P₃)/8.
              </p>
            </Check>
            <Check q="Can P₁ ever carry half the weight?">
              <p>No. Its weight 3t(1 − t)² is largest at t = 1/3, where it equals 4/9 ≈ 0.444.</p>
            </Check>
          </details>
        </Chapter>

        <Chapter id="code">
          <p>
            The computer keeps making the same small mix between neighbouring dots until only one is
            left. That is the whole recipe.
          </p>
          <details class="bz-deeper">
            <DisclosureSummary>See the code and its numerical details</DisclosureSummary>
            <p>
              Every figure on this page calls this function. Each pass of the loop turns a row of
              points into a row one shorter, exactly as in the construction above.
            </p>
            <CodeBlock artifact={casteljauCode} />
            <p>
              A curve with <Tex tex="n+1" /> control points takes <Tex tex="n(n+1)/2" /> mixes per
              point: six for a cubic.
            </p>
            <p>
              Floating point adds one trap. The common form <Tex tex="a+(b-a)t" /> need not return{" "}
              <Tex tex="b" /> at <Tex tex="t=1" /> <Cite k="p0811" />. With <Tex tex="a=0.1" /> and{" "}
              <Tex tex="b=0.45" />, it returns 0.44999999999999996. A curve computed that way can
              end a hair away from its last control point, so a closed outline may fail to close.
              This change fixes it:
            </p>
            <CodeBlock artifact={lerpDiff} />
            <p>
              The exact form has its own cost: for some <Tex tex="a" /> and <Tex tex="b" /> with the
              same sign, it is not monotonic in <Tex tex="t" /> <Cite k="interpolation" />. P0811,
              the proposal behind C++20’s <code>std::lerp</code>, treats exactness and monotonicity
              as separate requirements. Here, exact endpoints matter more.
            </p>
            <Check q="Why does (1 − t)a + tb return exactly b at t = 1?">
              <p>
                Every step is exact: 1 − 1 is 0, 0 · a is 0 for any finite a, 1 · b is b, and 0 + b
                is b. No operation has anything to round.
              </p>
            </Check>
          </details>
        </Chapter>

        <Chapter id="flatten">
          <p>
            A computer can also imitate the curve with little straight pieces. Add more pieces and
            see how closely the orange line follows the curve.
          </p>
          <Flatten />
          <details class="bz-deeper">
            <DisclosureSummary>Why do more pieces make a closer fit?</DisclosureSummary>
            <p>
              Screens, plotters and cutters draw straight lines, so renderers{" "}
              <T k="flatten">flatten</T> curves first. The simplest way uses <em>uniform chords</em>
              : straight segments joining the curve points at{" "}
              <Tex tex="t=0,\tfrac1n,\tfrac2n,\dots,1" />.
            </p>
            <p>
              For the starting curve, going from 8 to 16 segments shrinks the largest gap from 2.95
              to 0.75 units. Doubling <Tex tex="n" /> cuts the gap by about four, so the log–log
              chart falls along a line of slope −2. Twenty segments keep this curve within half a
              unit. Drag a control point in any figure, and the chart updates for your curve.
            </p>
            <details>
              <DisclosureSummary>Why the gap shrinks as 1/n²</DisclosureSummary>
              <p>
                On each piece of parameter length <Tex tex="h=1/n" />, the chord is the linear
                interpolant of <Tex tex="B" /> in <Tex tex="t" />. The standard interpolation bound{" "}
                <Cite k="interpolation" /> gives:
              </p>
              <Equation
                tex="\lVert B(t)-L(t)\rVert\le\frac{h^2}{8}\max_{s}\lVert B''(s)\rVert"
                label="Chord error bound"
              >
                The scalar bound holds for each coordinate. For the Euclidean length, write the
                error as an integral of B″ against a nonpositive kernel whose total weight is at
                most h²/8.
              </Equation>
              <p>
                For a cubic, <Tex tex="B''" /> is linear in <Tex tex="t" />, so its largest length
                occurs at an end: <Tex tex="6\lVert P_0-2P_1+P_2\rVert" /> or{" "}
                <Tex tex="6\lVert P_1-2P_2+P_3\rVert" />. Halving <Tex tex="h" /> quarters the
                bound. Solving <Tex tex="h^2M/8\le\tfrac12" /> gives the segment count in the
                readout.
              </p>
              <p>
                The gap is measured between points with the same parameter, so it is at least the
                distance from the curve to the polyline. Production renderers usually space segments
                adaptively, putting more where the curve bends; uniform chords keep this example
                simple.
              </p>
            </details>
            <Check q="Place the four control points evenly along a straight line. How many segments do you need?">
              <p>
                One. Then P₀ − 2P₁ + P₂ = 0 and P₁ − 2P₂ + P₃ = 0, so B″ = 0: the curve is the
                segment itself, traversed at constant speed.
              </p>
            </Check>
          </details>
        </Chapter>
        <Chapter id="patterns">
          <p>
            The same small mix can do more than move one dot. Use it to carry an outline into a new
            shape, separate a drawing into layers, or move a brush along a curve.
          </p>
          <Patterns />
        </Chapter>
        <aside class="bz-authoring">
          <p class="bz-authoring-k">Behind this note</p>
          <h2>Make an idea feel this simple.</h2>
          <p>
            Start with something your reader can try. Give it a picture, then a short reason. Keep
            the deeper explanation within reach.
          </p>
          <a href={`${frameworkOrigin}/docs#write`}>
            <ArrowLabel direction="right">Make your first note</ArrowLabel>
          </a>
        </aside>
      </Page>
    </>
  );
}
