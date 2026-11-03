import { More } from "../../kit";
import { DissectionExperiment, PaintOrderExperiment, ClippingExperiment } from "./Experiments";
import { note } from "./chapters";
import { ExampleNav } from "../example-nav";
import meta from "./note.json";
import "./svg.css";
const { Page, Chapter } = note;
export default function InsideSvg() {
  return (
    <>
      <ExampleNav />
      <Page
        meta={meta}
        date="2026-10-25"
        kicker="An explanation you can play"
        howTo={false}
        references="compact"
        dek={<>A sky, a circle, two hills, and a little window.</>}
      >
        <Chapter id="layers">
          <p>
            <strong>SVG</strong> describes a picture with shapes. Press Play to pull this one apart.
          </p>
          <DissectionExperiment />
          <p>Five shapes, one picture. The window crops the scenery; the frame surrounds it.</p>
          <More summary="What are the shapes?">
            <p>
              The sky is a rectangle; the sun is a circle. The hills and frame are
              <strong> paths</strong>: outlines drawn with straight or curved segments. Pulling the
              layers apart is an inspection aid. SVG has no depth here. The frame is a path with a
              hole.
            </p>
          </More>
        </Chapter>
        <Chapter id="order">
          <p>SVG paints in order, like laying paper on a table.</p>
          <PaintOrderExperiment />
          <More summary="What changed in the SVG?">
            <p>
              The same sun circle moves after both hills in the document, before the frame. Its
              center and radius stay fixed. This changes the order of separate shapes; SVG’s{" "}
              <code>paint-order</code> property concerns a shape’s own fill, stroke, and markers.
            </p>
            <p>
              <a href="https://www.w3.org/TR/SVG2/render.html#RenderingOrder">
                W3C: rendering order
              </a>
            </p>
          </More>
        </Chapter>
        <Chapter id="window">
          <p>
            A <strong>clipping path</strong> acts like a window: it hides paint outside the opening.
            Move the window and watch what stays put.
          </p>
          <ClippingExperiment />
          <p>
            Now show beyond the window. The picture was already there; the window was hiding its
            paint.
          </p>
          <More summary="Why are the shapes still there?">
            <p>
              The frame is visible; the clipping boundary is not. Here that boundary matches the
              opening. The clipping boundary moves, along with the frame. The rectangle, circle, and
              hill paths keep their original coordinates and sizes. Removing clipping exposes their
              paint outside the opening; it does not change which hill covers the sun.
            </p>
            <p>
              <a href="https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath">
                MDN: clipping and unchanged geometry
              </a>
            </p>
          </More>
        </Chapter>
      </Page>
    </>
  );
}
