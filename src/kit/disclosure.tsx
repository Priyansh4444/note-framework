import type { ParentComponent } from "solid-js";

/** A native disclosure with one first-line marker and a full-width hit target. */
export const DisclosureSummary: ParentComponent = (props) => (
  <summary class="nk-disclosure-summary">
    <span class="nk-disclosure-mark" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
        <path
          d="m6 4 4 4-4 4"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span class="nk-disclosure-label">{props.children}</span>
  </summary>
);
