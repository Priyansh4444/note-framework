import { defineNote, More } from "../../kit";
import { SpringInstrument } from "./Instrument";
import { ExampleNav } from "../example-nav";
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
      from: ["physics", "lab"],
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
    lab: {
      title: "Interaction Lab",
      short: "AI for UI",
      who: "AI for UI",
      url: "https://aiforui.dev/lab",
      why: "The idea of pairing a spring with its response curve, settle time and overshoot. The code and drawing here are original.",
    },
  },
});
export default function SpringWorkshop() {
  return (
    <>
      <ExampleNav />
      <Page
        meta={meta}
        date="2026-10-25"
        kicker="An instrument you can feel"
        howTo={false}
        references="compact"
        dek={<>A spring brings it home. A damper decides how.</>}
      >
        <Chapter id="feel">
          <p>
            Pull the round grip and let go. The spring returns the carriage to center; the{" "}
            <strong>damper</strong> takes energy out of each return. Try all three settings.
          </p>
          <SpringInstrument />
          <More summary="What is the model behind the motion?">
            <p>
              This is an idealized instrument with one moving mass and linear spring and damping
              forces. It solves the mass–spring–damper equation exactly, rather than stepping a new
              position once per frame. The mass is 1 kg, spring stiffness is 144 N/m, and the three
              damping ratios are 0.22, 1 and 1.8. Displacement is shown in millimeters. Overshoot
              and settle time describe a release from rest; settled means staying within 2% of the
              pull.
            </p>
            <p>
              “Just enough” means critical damping: from a stationary release it reaches the center
              quickly without crossing it. Grabbing or changing the damping during a return
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
          </More>
        </Chapter>
      </Page>
    </>
  );
}
