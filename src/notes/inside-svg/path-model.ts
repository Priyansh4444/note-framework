export type Point = readonly [number, number];
type Segment = Readonly<{
  letter: string;
  from: Point;
  to: Point;
  /** Present on a cubic; a line otherwise. */
  handles?: readonly [Point, Point];
  /** A move lifts the pen: it travels without ink. */
  ink: boolean;
  length: number;
}>;
export type Line = Readonly<{ text: string; segment?: Segment }>;

const lerp = (a: Point, b: Point, u: number): Point => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u,
];
/** De Casteljau: the point at u, and the exact shorter cubic that ends there. */
function split(p0: Point, p1: Point, p2: Point, p3: Point, u: number) {
  const a = lerp(p0, p1, u),
    b = lerp(p1, p2, u),
    c = lerp(p2, p3, u),
    d = lerp(a, b, u),
    e = lerp(b, c, u),
    end = lerp(d, e, u);
  return { a, d, end };
}
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function cubicLength(p0: Point, p1: Point, p2: Point, p3: Point) {
  let total = 0,
    last = p0;
  for (let i = 1; i <= 256; i++) {
    const { end } = split(p0, p1, p2, p3, i / 256);
    total += distance(last, end);
    last = end;
  }
  return total;
}

/** An original bell: every command is one source line, so each can be read and drawn alone. */
export const BELL = [
  "M 50 10",
  "C 31 10, 23 26, 23 45",
  "V 62",
  "L 13 74",
  "H 87",
  "L 77 62",
  "V 45",
  "C 77 26, 69 10, 50 10",
  "Z",
  "M 41 82",
  "C 43 91, 57 91, 59 82",
] as const;

function parse(commands: readonly string[]) {
  let pen: Point = [50, 50],
    start: Point = pen;
  return commands.map((command): Segment => {
    const letter = command[0];
    const n =
      command
        .slice(1)
        .match(/-?\d+(?:\.\d+)?/g)
        ?.map(Number) ?? [];
    const from = pen;
    let to: Point, handles: Segment["handles"];
    if (letter === "M" || letter === "L") to = [n[0], n[1]];
    else if (letter === "H") to = [n[0], pen[1]];
    else if (letter === "V") to = [pen[0], n[0]];
    else if (letter === "C") {
      handles = [
        [n[0], n[1]],
        [n[2], n[3]],
      ];
      to = [n[4], n[5]];
    } else if (letter === "Z") to = start;
    else throw new Error(`Unsupported path command: ${command}`);
    if (letter === "M") start = to;
    pen = to;
    const length = handles
      ? cubicLength(from, handles[0], handles[1], to)
      : letter === "M"
        ? 0
        : distance(from, to);
    return { letter, from, to, handles, ink: letter !== "M", length };
  });
}

const segments = parse(BELL);
export const d = BELL.join(" ");
export const COMMANDS = BELL.length;
const WIDTH_LINE = BELL.length + 3;
export const LINES: readonly Line[] = [
  { text: '<svg viewBox="0 0 100 100">' },
  { text: '  <path d="' },
  ...BELL.map((text, i) => ({ text: `    ${text}`, segment: segments[i] })),
  { text: '  "' },
  { text: '  stroke-width="6"' },
  { text: '  stroke-linejoin="round"' },
  { text: "/>" },
  { text: "</svg>" },
];
const FIRST_COMMAND = 2;

/** Thin pen until the slit reaches stroke-width; the corners round once it reaches linejoin. */
export function stateAt(position: number) {
  const p = Math.max(0, Math.min(LINES.length, position));
  let ink = "",
    pen: Point = segments[0].from,
    length = 0,
    reached = 0;
  for (let i = 0; i < segments.length; i++) {
    const u = Math.max(0, Math.min(1, p - (FIRST_COMMAND + i)));
    if (u <= 0) break;
    const s = segments[i];
    reached = i + 1;
    if (s.handles) {
      if (u >= 1) ink += ` ${BELL[i]}`;
      else {
        const { a, d: near, end } = split(s.from, s.handles[0], s.handles[1], s.to, u);
        ink += ` C ${a[0]} ${a[1]}, ${near[0]} ${near[1]}, ${end[0]} ${end[1]}`;
      }
      length +=
        u >= 1
          ? s.length
          : (() => {
              const { a, d: near, end } = split(s.from, s.handles[0], s.handles[1], s.to, u);
              return cubicLength(s.from, a, near, end);
            })();
      pen = split(s.from, s.handles[0], s.handles[1], s.to, u).end;
    } else if (s.letter === "M") {
      // The pen travels to its new start; ink resumes only once it has landed.
      pen = lerp(s.from, s.to, u);
      if (u >= 1) ink += ` M ${s.to[0]} ${s.to[1]}`;
    } else {
      // A finished command is written as the source wrote it; only a partial stroke is a stand-in.
      const end = lerp(s.from, s.to, u);
      ink += u >= 1 ? ` ${BELL[i]}` : ` L ${end[0]} ${end[1]}`;
      length += s.length * u;
      pen = end;
    }
  }
  return {
    ink: ink.trim(),
    pen,
    length,
    reached,
    letter: reached ? BELL[reached - 1][0] : "",
    width: 1.25 + (6 - 1.25) * Math.max(0, Math.min(1, p - WIDTH_LINE)),
    join: p >= WIDTH_LINE + 2 ? ("round" as const) : ("miter" as const),
  };
}

/** Time follows ink, with a beat for each line of markup, so long strokes take longer to draw. */
const weights = LINES.map((line) => (line.segment ? 90 + line.segment.length * 9 : 90));
const total = weights.reduce((sum, w) => sum + w, 0);
const ease = (u: number) => (1 - Math.cos(Math.PI * u)) / 2;
const unease = (v: number) => Math.acos(1 - 2 * v) / Math.PI;

export function positionAt(fraction: number) {
  let left = ease(Math.max(0, Math.min(1, fraction))) * total;
  for (let i = 0; i < weights.length; i++) {
    if (left <= weights[i]) return i + left / weights[i];
    left -= weights[i];
  }
  return LINES.length;
}

export function fractionAt(position: number) {
  const p = Math.max(0, Math.min(LINES.length, position));
  const whole = Math.floor(p);
  const spent = weights.slice(0, whole).reduce((sum, w) => sum + w, 0);
  return unease(Math.min(1, (spent + (p - whole) * (weights[whole] ?? 0)) / total));
}

/** Every line read so far is a real position: the steps a reduced-motion reader visits. */
export const STEP_FRACTIONS = LINES.map((_, i) => fractionAt(i + 1));

const hash = (a: number, b: number, c: number) => {
  let h = Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503) ^ Math.imul(c + 13, 2246822519);
  h ^= h >>> 13;
  return Math.abs(Math.imul(h, 1540483477));
};
/** How many lines either side of the position read true. */
export const SLIT_REACH = 2.4;
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789<>{}[]/=:;.,-+";

/**
 * A source line as seen through the slit. Inside it reads true; beyond its edge the text is noise
 * that decodes from the left, and the noise depends only on position, so a pause holds it still.
 */
export function lineThroughSlit(index: number, position: number, reach = SLIT_REACH) {
  const text = LINES[index].text;
  const open = Math.max(0, Math.min(1, reach + 0.5 - Math.abs(index + 0.5 - position)));
  const clear = Math.round(open * text.length);
  const tick = Math.floor(position * 4);
  let noise = "";
  for (let i = clear; i < text.length; i++)
    noise += text[i] === " " ? " " : GLYPHS[hash(index, i, tick) % GLYPHS.length];
  return { clear: text.slice(0, clear), noise, open };
}
