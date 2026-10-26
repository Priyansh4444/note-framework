import { note } from "./chapters";

export const { T } = note.glossary({
  lerp: {
    name: "Linear interpolation",
    home: "mix",
    symbol: "(1-t)A+tB",
    says: () => (
      <>
        The point a fraction t of the way from A to B. Often shortened to <em>lerp</em>.
      </>
    ),
  },
  convex: {
    name: "Convex combination",
    home: "mix",
    says: () => (
      <>
        A weighted average whose weights are all nonnegative and add up to one. It always lies among
        the points it averages.
      </>
    ),
  },
  control: {
    name: "Control point",
    home: "nest",
    says: () => (
      <>
        One of the points that shape a Bézier curve. The curve starts at the first and ends at the
        last; the inner ones steer it without, in general, lying on it.
      </>
    ),
  },
  casteljau: {
    name: "De Casteljau’s algorithm",
    home: "nest",
    from: "pomax",
    says: () => (
      <>
        Evaluate a Bézier curve by mixing neighbouring points with the same t, level after level,
        until one point remains.
      </>
    ),
  },
  bernstein: {
    name: "Bernstein polynomial",
    home: "weights",
    from: "bezier",
    symbol: "\\binom{n}{i}t^i(1-t)^{n-i}",
    says: () => <>The weight of control point i in a degree-n Bézier curve. For a cubic, n = 3.</>,
  },
  hull: {
    name: "Convex hull",
    home: "weights",
    says: () => (
      <>
        The smallest convex region containing a set of points: the shape a rubber band makes when
        stretched around them.
      </>
    ),
  },
  flatten: {
    name: "Flattening",
    home: "flatten",
    from: "pomax",
    says: () => (
      <>Replacing a curve with straight segments so that it can be drawn, cut or measured.</>
    ),
  },
});
