import { DisclosureSummary } from "../../kit";
import { DissectionExperiment, PaintOrderExperiment, ClippingExperiment } from "./Experiments";
import { note } from "./chapters";
import meta from "./note.json";
import "./svg.css";
const { Page, Chapter } = note;
const frameworkOrigin =
  import.meta.env.VITE_FRAMEWORK_PREVIEW === "1"
    ? ""
    : "https://note-framework-share.pronsh.workers.dev";
export default function InsideSvg() {
  return (
    <>
      <nav class="note-inside-svg-nav" aria-label="Framework">
        <a href={`${frameworkOrigin}/`}>← Note Framework</a>
        <a href={`${frameworkOrigin}/docs`}>Build a note like this →</a>
      </nav>
      <Page
        meta={meta}
        date="2026-10-25"
        kicker="An explanation you can play"
        howTo={false}
        dek={<>A sky, a circle, two hills, and a little window.</>}
      >
        <Chapter id="layers">
          <p>
            <strong>SVG</strong> is a way to describe a picture with shapes. This original landscape
            uses just five. Pull them apart, then follow the same shapes through two small
            experiments.
          </p>
          <DissectionExperiment />
          <p>
            The sky is a rectangle; the sun is a circle. The window still crops each colored layer.
            The hills and frame are <strong>paths</strong>: outlines drawn with straight or curved
            segments.
          </p>
        </Chapter>
        <Chapter id="order">
          <p>
            SVG paints these shapes in order, like laying pieces of paper on a table. A later shape
            covers an earlier one wherever they overlap.
          </p>
          <PaintOrderExperiment />
          <details class="svg-reason">
            <DisclosureSummary>What changed in the SVG?</DisclosureSummary>
            <div>
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
            </div>
          </details>
        </Chapter>
        <Chapter id="window">
          <p>
            A <strong>clipping path</strong> is an invisible boundary that limits where paint
            appears. Here it matches the opening in the frame. The frame is visible; the clipping
            boundary is not.
          </p>
          <ClippingExperiment />
          <p>
            Move the window back to Center, then show beyond it. The picture was already there. The
            window was hiding its paint.
          </p>
          <details class="svg-reason">
            <DisclosureSummary>Why are the shapes still there?</DisclosureSummary>
            <div>
              <p>
                The clipping boundary moves, along with the frame. The rectangle, circle, and hill
                paths keep their original coordinates and sizes. Removing clipping exposes their
                paint outside the opening; it does not change which hill covers the sun.
              </p>
              <p>
                <a href="https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/clipPath">
                  MDN: clipping and unchanged geometry
                </a>
              </p>
            </div>
          </details>
        </Chapter>
      </Page>
    </>
  );
}
