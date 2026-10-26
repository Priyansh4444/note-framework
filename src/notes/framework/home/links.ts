/** Keep this worktree’s preview self-contained; hosted single-note builds keep their published example. */
export const EXAMPLE =
  import.meta.env.VITE_FRAMEWORK_PREVIEW === "1"
    ? "/notes/framework-demo"
    : "/d/ef8f3bee1d7e04a446cf3c409fa1f91a";
