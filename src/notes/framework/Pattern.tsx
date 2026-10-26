import { MorphFigure, makeMorphShapes } from "../../kit";

/** Save beside your note's index.tsx, import, and render <Pattern />. */
export function Pattern() {
  const shapes = makeMorphShapes();
  return <MorphFigure shapes={shapes} label="The same contours, four forms" />;
}
