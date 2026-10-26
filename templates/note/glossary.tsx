import { note } from "./chapters";

// Definitions are functions: each tooltip and glossary entry gets fresh DOM.
export const { T } = note.glossary({
  slot: {
    name: "Slot",
    home: "picture",
    says: () => (
      <>One position that can hold one item. This illustrative array has sixteen positions.</>
    ),
  },
  index: {
    name: "Index",
    home: "picture",
    says: () => (
      <>
        A position's number. Index zero selects the first position, so index six selects the
        seventh.
      </>
    ),
    from: "indexing",
  },
  invariant: {
    name: "Invariant",
    home: "why",
    says: () => (
      <>A fact preserved after every step. Here each index continues to identify the same slot.</>
    ),
  },
});
