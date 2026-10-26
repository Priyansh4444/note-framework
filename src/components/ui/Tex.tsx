import { type Component, createMemo } from "solid-js";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./math.css";

/** Authored TeX only; KaTeX emits visual HTML and accessible MathML together. */
export const Tex: Component<{ tex: string; display?: boolean }> = (props) => {
  const rendered = createMemo(() =>
    katex.renderToString(props.tex, {
      displayMode: props.display ?? false,
      output: "htmlAndMathml",
      throwOnError: true,
      strict: "error",
      trust: false,
    }),
  );
  return (
    <span
      class="nf-math"
      classList={{ "nf-math-display": props.display }}
      data-tex={props.tex}
      innerHTML={rendered()}
    />
  );
};
