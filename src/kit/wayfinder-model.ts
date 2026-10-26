import { curvedRail } from "./timeline-model";
export type ReadingStop = Readonly<{ scroll: number; distance: number }>;
export type ReadingMap = readonly ReadingStop[];
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** Document endpoints and chapter reading-line stops share one strictly monotone
 * map. Clamped duplicate chapter targets cannot create an ambiguous inverse. */
export function readingMap(
  chapters: readonly ReadingStop[],
  maximum: number,
  length: number,
): ReadingMap {
  if (maximum <= 0 || length <= 0) return [{ scroll: 0, distance: 0 }];
  const stops: ReadingStop[] = [{ scroll: 0, distance: 0 }];
  const interior = chapters
    .filter((stop) => stop.scroll > 0 && stop.scroll < maximum)
    .sort((a, b) => a.scroll - b.scroll);
  for (const stop of interior) {
    const distance = clamp(stop.distance, length - 0.001);
    const previous = stops.at(-1)!;
    if (distance <= previous.distance) continue;
    if (stop.scroll === previous.scroll)
      stops[stops.length - 1] = { scroll: stop.scroll, distance };
    else stops.push({ scroll: stop.scroll, distance });
  }
  stops.push({ scroll: maximum, distance: length });
  return stops;
}
function interpolate(
  map: ReadingMap,
  value: number,
  from: keyof ReadingStop,
  to: keyof ReadingStop,
) {
  if (map.length < 2) return 0;
  const at = clamp(value, map.at(-1)![from]);
  const end = map.findIndex((stop, i) => i > 0 && stop[from] >= at);
  const b = map[end < 0 ? map.length - 1 : end],
    a = map[Math.max(0, (end < 0 ? map.length - 1 : end) - 1)];
  return a[to] + ((b[to] - a[to]) * (at - a[from])) / (b[from] - a[from]);
}
export const distanceAtScroll = (map: ReadingMap, scroll: number) =>
  interpolate(map, scroll, "scroll", "distance");
export const scrollAtDistance = (map: ReadingMap, distance: number) =>
  interpolate(map, distance, "distance", "scroll");

/** Fit the same rounded diagonal to the outline's natural height. Wrapped HTML
 * labels scroll; they never compress or deform the curve. */
export function readingRail(height: number) {
  if (!Number.isFinite(height) || height < 160) return undefined;
  return curvedRail(height, 80);
}
export function distanceAtY(rail: ReturnType<typeof curvedRail>, y: number) {
  let lo = 0,
    hi = rail.length;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (rail.pointAt(mid).y < y) lo = mid;
    else hi = mid;
  }
  return Math.max(0.001, Math.min(rail.length - 0.001, (lo + hi) / 2));
}
