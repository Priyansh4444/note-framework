import { defineNote } from "../../kit";

export const note = defineNote({
  slug: "shared-service",
  chapters: [
    {
      id: "one-service",
      title: "Keep the work in one place",
      question: "Can two windows watch the same work?",
      takeaway:
        "The service owns the sessions. Each update returns only to the clients watching that session.",
      from: ["opencode"],
    },
  ],
  sources: {
    opencode: {
      title: "OpenCode 2.0 — The Service",
      who: "Anomaly",
      short: "OpenCode",
      url: "https://anoma.ly/notes/opencode-2-0/",
      why: "The four-client foundation example motivating this independently authored explanation of shared sessions and subscriber-only updates.",
    },
  },
});
