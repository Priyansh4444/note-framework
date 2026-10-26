import { defineNote, DisclosureSummary } from "../../kit";
import { SpringInstrument } from "./Instrument";
import meta from "./note.json";
import "./vendor/iso.css";
import "./spring.css";
const { Page, Chapter } = defineNote({
  slug: "spring-workshop",
  chapters: [
    {
      id: "feel",
      title: "Give it a little pull",
      question: "Why does some motion feel springy?",
      takeaway: "The spring returns the carriage; damping changes how it gets there.",
    },
  ],
  sources: {
    physics: {
      title: "Damped oscillations",
      short: "OpenStax",
      who: "OpenStax",
      url: "https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations",
      why: "The mass–spring–damper equation and the three damping regimes.",
    },
  },
});
const origin =
  import.meta.env.VITE_FRAMEWORK_PREVIEW === "1"
    ? ""
    : "https://note-framework-share.pronsh.workers.dev";
export default function SpringWorkshop() {
  return (
    <>
      <nav class="spring-nav" aria-label="Framework">
        <a href={`${origin}/`}>← Note Framework</a>
        <a href={`${origin}/docs`}>Build a note like this →</a>
      </nav>
      <Page
        meta={meta}
        date="2026-10-25"
        kicker="An instrument you can feel"
        howTo={false}
        dek={<>A spring brings it home. A damper decides how.</>}
      >
        <Chapter id="feel">
          <p>
            Pull the carriage by its round grip, then let go. The spring pulls toward the center.
            The <strong>damper</strong> resists motion, taking energy out of each return. Try the
            three settings on the same instrument.
          </p>
          <SpringInstrument />
          <details class="spring-reason">
            <DisclosureSummary>What is the model behind the motion?</DisclosureSummary>
            <div>
              <p>
                This is an idealized instrument with one moving mass and linear spring and damping
                forces. It solves the mass–spring–damper equation exactly, rather than stepping a
                new position once per frame. The mass is 1 kg, spring stiffness is 144 N/m, and the
                three damping ratios are 0.22, 1 and 1.8. Displacement is shown in millimeters.
              </p>
              <p>
                “Just enough” means critical damping: from a stationary release it reaches the
                center quickly without crossing it. Grabbing or changing the damping during a return
                preserves the current position; changing damping also preserves velocity. A release
                speed limit keeps the carriage within its physical stroke.
              </p>
              <p>
                <a href="https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations">
                  Read the physics
                </a>
                . The drawing is an original instrument built with the MIT-licensed{" "}
                <a href="https://github.com/wheresryan22/anatomy">Anatomy geometry kit</a>.
              </p>
            </div>
          </details>
        </Chapter>
      </Page>
    </>
  );
}
