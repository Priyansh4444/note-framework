import { expect, test } from "bun:test";
import { scanSource } from "./taste";

const rules = (file: string, source: string) => scanSource(file, source).map((v) => v.rule);

test.each([
  ["a.css", "@media (prefers-color-scheme: light) {", "dark-only"],
  ["a.tsx", 'import mermaid from "mermaid";', "no-mermaid"],
  ["a.css", "  transition: transform 300ms linear;", "linear-motion"],
  ["a.ts", 'animate(el, { x: 1 }, { ease: "linear" });', "linear-motion"],
  ["a.css", ".card:hover { transform: scale(1.1); }", "hover-zoom"],
  ["a.css", "  color: #ece7da;", "palette-tokens"],
  ["a.tsx", "<p>It's worth noting that inodes hold metadata.</p>", "filler-prose"],
])("%s `%s` breaks %s", (file, source, rule) => {
  expect(rules(file, source)).toEqual([rule]);
});

test.each([
  ["a.css", "  transition: visibility 0s linear 180ms, opacity 200ms var(--ease-out);"],
  ["a.css", "  animation: flow 1600ms linear infinite;"],
  ["a.css", "  transition: transform var(--spring-dur) linear(0, 0.6, 1);"],
  ["a.css", "  --ink: #ece7da;"],
  ["a.css", "  stroke: var(--diagram-blue, #87c5d1);"],
  ["a.css", ".card:hover { transform: scale(1.02); }"],
  ["a.md", "Draw diagrams by hand; do not use Mermaid."],
  ["a.tsx", "<p>Inodes hold metadata, never names.</p>"],
  ["a.css", "/* taste-allow palette-tokens: brand logo ink */\n  fill: #ff6600;"],
])("%s `%s` passes", (file, source) => {
  expect(rules(file, source)).toEqual([]);
});

test("an allow comment needs a reason", () => {
  expect(rules("a.css", "  color: #fff; /* taste-allow palette-tokens: */")).toEqual([
    "palette-tokens",
  ]);
});
