import casteljauCode from "./examples/de-casteljau.ts?code";
import lerpDiff from "./examples/lerp.diff?diff";
import { Check, CodeBlock, Equation, More, Steps, Tex } from "../../kit";
import { note } from "./chapters";
import { T } from "./glossary";
import { CurveMorphExample, InkExample } from "../../kit/patterns/recipes";
import { points } from "./bezier/store";
import { sampleCurve } from "../../kit/patterns/recipe-model";
import { Mix } from "./figures/Mix";
import { Construction } from "./figures/Construction";
import { Weights } from "./figures/Weights";
import { Flatten, FlattenSummary } from "./figures/Flatten";
import { ExampleNav } from "../example-nav";
import meta from "./note.json";
import "./demo.css";

const { Page, Chapter, Cite } = note;

export default function Demo() {
  return (
    <>
      <ExampleNav />
      <Page
        meta={meta}
        date="2026-10-22"
        kicker="An example note"
        howTo={false}
        references="compact"
        dek={<>Four dots and one repeated move.</>}
      >
        <section class="bz-first-try" aria-label="Try drawing a curve">
          <Construction />
          <p class="bz-first-fact">The end dots hold the curve. The middle dots bend it.</p>
          <More summary="How is the white point made?">
            <p>
              A mix places a point partway between two neighbours. One shared fraction, t, turns
              four points into three, then two, then the white point.
            </p>
          </More>
          <Check q="Can you make the curve straight?">
            <p>Choose Straight, or line up all four dots.</p>
          </Check>
        </section>
        <Chapter id="mix">
          <p>Everything starts with one move: pick a spot between two ends. Drag the white dot.</p>
          <Mix />
          <p>
            With ends <Tex tex="A" /> and <Tex tex="B" /> and a fraction <Tex tex="t" /> from 0 to
            1, this move is <T k="lerp">linear interpolation</T>:
          </p>
          <Equation tex="p(t)=(1-t)\,A+t\,B" label="Linear interpolation">
            At t = 0 the point is A; at t = 1 it is B.
          </Equation>
          <p>
            The weights <Tex tex="1-t" /> and <Tex tex="t" /> are never negative and sum to one, so{" "}
            <Tex tex="p" /> stays on the segment. Everything below repeats this one move.
          </p>
          <More summary="Why weights like these keep the point inside">
            <p>
              A weighted average with nonnegative weights that sum to one is a <T k="convex" />.
              Each coordinate of <Tex tex="p" /> lies between the matching coordinates of{" "}
              <Tex tex="A" /> and <Tex tex="B" />, and <Tex tex="p" /> lies on the line through
              them, so it stays on the segment.
            </p>
          </More>
          <Check q="At t = 0.25, which end is p closer to, and what are the weights?">
            <p>A. Its weight is 0.75 and B’s is 0.25.</p>
          </Check>
        </Chapter>

        <Chapter id="nest">
          <p>
            Take four <T k="control">control points</T>, <Tex tex="P_0" /> to <Tex tex="P_3" />, and
            mix each neighbouring pair at one shared <Tex tex="t" />: four dots make three, then
            two, then one, <Tex tex="B(t)" />. As <Tex tex="t" /> runs from 0 to 1, that point
            traces the curve. This is <T k="casteljau">de Casteljau’s algorithm</T>{" "}
            <Cite k="pomax" />.
          </p>
          <p>
            Press Play in <a href="#construction">the first picture</a> to watch the rows slide
            together.
          </p>
          <p>
            At <Tex tex="t=0" /> every mix returns its left neighbour, so the curve starts at{" "}
            <Tex tex="P_0" />; at <Tex tex="t=1" />, its right, so it ends at <Tex tex="P_3" />. The
            middle points only steer: the curve leaves <Tex tex="P_0" /> toward <Tex tex="P_1" />{" "}
            and reaches <Tex tex="P_3" /> from the direction of <Tex tex="P_2" />.
          </p>
          <More summary="Why the curve leaves P₀ toward P₁">
            <p>
              Differentiate the weighted form from the next chapter. Only the first two weights have
              a nonzero slope at <Tex tex="t=0" />:
            </p>
            <Steps
              label="Start tangent"
              rows={[
                ["B'(t)", "-3(1-t)^2P_0"],
                ["", "+\\bigl(3(1-t)^2-6t(1-t)\\bigr)P_1"],
                ["", "+\\bigl(6t(1-t)-3t^2\\bigr)P_2+3t^2P_3", <>Differentiate each weight.</>],
                ["B'(0)", "3(P_1-P_0)", <>Set t = 0; the last two terms vanish.</>],
              ]}
            />
            <p>
              So the velocity at the start points from <Tex tex="P_0" /> to <Tex tex="P_1" />, with
              three times that edge’s length. By symmetry, <Tex tex="B'(1)=3(P_3-P_2)" />. When{" "}
              <Tex tex="P_1=P_0" />, this first derivative is zero and the direction comes from
              higher derivatives instead.
            </p>
          </More>
          <Check q="Drag P₁ onto P₀ and P₂ onto P₃. What does the curve become?">
            <p>
              The straight segment from P₀ to P₃, at uneven speed: B(½) is the midpoint, but B(¼) is
              only 0.15625 of the way along.
            </p>
          </Check>
        </Chapter>

        <Chapter id="weights">
          <p>
            Each dot has a share of the pull. Drag the grey grip under the chart to change{" "}
            <Tex tex="t" />.
          </p>
          <Weights />
          <p>
            Near the start, P₀ matters most; near the end, P₃. Drag a control point: the curve
            changes, these shares do not.
          </p>
          <More summary="The four weights, written out">
            <p>
              Unrolling the mixes gives the <T k="bernstein">Bernstein polynomials</T> of degree
              three <Cite k="bezier" />.
            </p>
            <Equation
              tex="B(t)=(1-t)^3P_0+3t(1-t)^2P_1+3t^2(1-t)P_2+t^3P_3"
              phone="\begin{aligned}B(t)={}&(1-t)^3P_0+3t(1-t)^2P_1\\&+3t^2(1-t)P_2+t^3P_3\end{aligned}"
              label="Bernstein form of a cubic"
            >
              The same point as the nested mixing, for every t.
            </Equation>

            <p>
              No weight is ever negative, and together they expand{" "}
              <Tex tex="\bigl((1-t)+t\bigr)^3=1" />. So <Tex tex="B(t)" /> is a convex combination
              of the control points, and the curve always lies in their <T k="hull" />.
            </p>
            <p>
              <strong>Can P₁ ever carry half the weight?</strong> No. Its weight 3t(1 − t)² is
              largest at t = 1/3, where it equals 4/9 ≈ 0.444.
            </p>
          </More>
          <More summary="Why nested mixing gives these weights">
            <p>
              Follow a path down the construction from a control point to <Tex tex="B(t)" />. It
              takes three mixes. Each step where the point is the right-hand parent multiplies by{" "}
              <Tex tex="t" />; each step where it is the left-hand parent multiplies by{" "}
              <Tex tex="1-t" />. Paths from <Tex tex="P_i" /> take <Tex tex="i" /> steps of one kind
              and <Tex tex="3-i" /> of the other, and there are <Tex tex="\binom{3}{i}" /> of them.
              Summing the paths gives <Tex tex="\binom{3}{i}t^i(1-t)^{3-i}" />.
            </p>
          </More>
          <Check q="At t = ½, which points pull hardest, and by how much?">
            <p>
              P₁ and P₂, each with weight 3/8. P₀ and P₃ each get 1/8, so B(½) = (P₀ + 3P₁ + 3P₂ +
              P₃)/8.
            </p>
          </Check>
        </Chapter>

        <Chapter id="code">
          <p>Mix neighbours until one point remains. Every row follows the same recipe.</p>
          <More summary="Read the working code">
            <p>
              The construction and straight-piece figures evaluate their curve with this file. Each
              pass turns a row of points into a row one shorter. The weight chart and visual
              treatments use the equivalent cubic polynomials.
            </p>
            <CodeBlock artifact={casteljauCode} />
            <p>
              Each pass makes one point fewer, so a cubic takes 3 + 2 + 1 = 6 mixes per point. With{" "}
              <Tex tex="n+1" /> control points that sum is <Tex tex="\tfrac12 n(n+1)" />.
            </p>
          </More>
          <More summary="See the one-line fix and what it gives up">
            <p>
              Floating point adds one trap. The common form <Tex tex="a+(b-a)t" /> need not return{" "}
              <Tex tex="b" /> at <Tex tex="t=1" /> <Cite k="p0811" />. With <Tex tex="a=0.1" /> and{" "}
              <Tex tex="b=0.45" />, it returns 0.44999999999999996, so a closed outline may fail to
              close.
            </p>
            <CodeBlock artifact={lerpDiff} initial="after" />
            <p>
              For some <Tex tex="a" /> and <Tex tex="b" /> with the same sign, the exact form is not
              monotonic in <Tex tex="t" /> <Cite k="interpolation" />. P0811, the proposal behind
              C++20’s <code>std::lerp</code>, treats exactness and monotonicity as separate
              requirements. Here, exact endpoints matter more.
            </p>
            <p>
              <strong>Why does (1 − t)a + tb return exactly b at t = 1?</strong> Every step is
              exact: 1 − 1 is 0, 0 · a is 0 for any finite a, 1 · b is b, and 0 + b is b. No
              operation has anything to round.
            </p>
          </More>
        </Chapter>

        <Chapter id="flatten">
          <p>
            <T k="flatten">Flattening</T> draws a curve with straight pieces. Press Play to split
            each piece.
          </p>
          <Flatten />
          <FlattenSummary />
          <More summary="Why the gap shrinks as 1/n²">
            <p>
              Screens, plotters and cutters draw straight lines, so renderers{" "}
              <T k="flatten">flatten</T> curves first. The simplest way picks <Tex tex="n+1" />{" "}
              evenly spaced values of <Tex tex="t" /> from 0 to 1 and joins their curve points.
            </p>
            <p>
              On each piece of parameter length <Tex tex="h=1/n" />, the <T k="chord">chord</T> is
              the linear interpolant of <Tex tex="B" /> in <Tex tex="t" />. The standard
              interpolation bound <Cite k="interpolation" /> gives:
            </p>
            <Equation
              tex="\lVert B(t)-L(t)\rVert\le\frac{h^2}{8}\max_{s}\lVert B''(s)\rVert"
              label="Chord error bound"
            >
              The scalar bound holds for each coordinate. For the Euclidean length, write the error
              as an integral of B″ against a nonpositive kernel whose total weight is at most h²/8.
            </Equation>
            <p>
              For a cubic, <Tex tex="B''" /> is linear in <Tex tex="t" />, so its largest length
              occurs at an end: <Tex tex="6\lVert P_0-2P_1+P_2\rVert" /> or{" "}
              <Tex tex="6\lVert P_1-2P_2+P_3\rVert" />. Halving <Tex tex="h" /> quarters the bound.
              Solving <Tex tex="h^2M/8\le\tfrac12" /> gives the segment count in the readout.
            </p>
            <p>
              The gap is measured between points with the same parameter, so it is at least the
              distance from the curve to the polyline. Production renderers usually space segments
              adaptively, putting more where the curve bends; uniform chords keep this example
              simple.
            </p>
          </More>
          <Check q="Place the four control points evenly along a straight line. How many segments do you need?">
            <p>
              One. Then P₀ − 2P₁ + P₂ = 0 and P₁ − 2P₂ + P₃ = 0, so B″ = 0: the curve is the segment
              itself, traversed at constant speed.
            </p>
          </Check>
        </Chapter>
        <Chapter id="forms">
          <p>
            Curve follows the Bézier path, Handles its control polygon, Straight its endpoints.
            Follow the blue strip as you switch.
          </p>
          <CurveMorphExample points={points()} />
          <p>
            Your edits carry through. In-between shapes are visual transitions, not Bézier
            calculations.
          </p>
          <More summary="What if the path were painted?">
            <p>
              These brush marks are built from the same edited curve. Changing the material moves
              the same seeded marks; their texture is a treatment, not a measurement of error.
            </p>
            <InkExample points={sampleCurve(points())} />
          </More>
        </Chapter>
      </Page>
    </>
  );
}
