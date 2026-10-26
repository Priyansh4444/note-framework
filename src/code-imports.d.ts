declare module "*?code" {
  const artifact: Extract<import("./kit/CodeBlock").CodeArtifact, { kind: "code" }>;
  export default artifact;
}

declare module "*?diff" {
  const artifact: Extract<import("./kit/CodeBlock").CodeArtifact, { kind: "diff" }>;
  export default artifact;
}
