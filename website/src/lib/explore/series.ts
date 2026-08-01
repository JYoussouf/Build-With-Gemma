/**
 * Turning frames into drawable series.
 *
 * Kept out of the chart component so the geometry can be reasoned about on its
 * own: windowing, decimation, and scaling are all pure functions of the frames
 * and the channel.
 */

import { Channel } from "../channels";
import { TelemetryFrame } from "../frame";

/** Rolling windows offered by the chart. `seconds: null` means everything. */
export const WINDOWS: { label: string; seconds: number | null }[] = [
  { label: "30 s", seconds: 30 },
  { label: "2 min", seconds: 120 },
  { label: "10 min", seconds: 600 },
  { label: "All", seconds: null },
];

/**
 * Most points drawn per series. Beyond this the polyline costs more than it
 * communicates, since the chart is only ever a few hundred pixels wide.
 */
const MAX_POINTS = 1400;

/** Frames within `seconds` of the frame at `end`, inclusive. */
export function windowFrames(
  frames: TelemetryFrame[],
  end: number,
  seconds: number | null,
): TelemetryFrame[] {
  if (frames.length === 0 || end < 0) return [];
  const upto = frames.slice(0, end + 1);
  if (seconds === null) return upto;
  const cutoff = upto[upto.length - 1].t - seconds;
  // Frames are ordered by t, so the first in-window frame bounds the slice.
  const from = upto.findIndex((f) => f.t >= cutoff);
  return from <= 0 ? upto : upto.slice(from);
}

/**
 * Reduces a series to at most MAX_POINTS while keeping its extremes.
 *
 * Plain stride sampling would drop the single frame where a brake temperature
 * spiked, which is exactly what someone exploring the data is looking for.
 * Taking the min and max of each bucket keeps the envelope intact.
 */
export function decimate(values: number[]): { value: number; index: number }[] {
  const n = values.length;
  if (n <= MAX_POINTS) return values.map((value, index) => ({ value, index }));

  const buckets = Math.floor(MAX_POINTS / 2);
  const size = n / buckets;
  const out: { value: number; index: number }[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const stop = Math.min(n, Math.floor((b + 1) * size));
    if (stop <= start) continue;

    let minI = start;
    let maxI = start;
    for (let i = start + 1; i < stop; i++) {
      if (values[i] < values[minI]) minI = i;
      if (values[i] > values[maxI]) maxI = i;
    }
    // Emit in the order they occur so the line does not zigzag backwards.
    const [first, second] = minI <= maxI ? [minI, maxI] : [maxI, minI];
    out.push({ value: values[first], index: first });
    if (second !== first) out.push({ value: values[second], index: second });
  }
  return out;
}

/**
 * Vertical range for a channel. A fixed domain is used where the channel has
 * one; otherwise the range present in the window, padded so a flat line does
 * not sit exactly on an edge.
 */
export function domainFor(channel: Channel, values: number[]): [number, number] {
  if (channel.domain) return channel.domain;
  if (values.length === 0) return [0, 1];

  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

export interface PlottedSeries {
  channel: Channel;
  colour: string;
  points: string;
  domain: [number, number];
  /** Value at the cursor, for the legend. */
  current: number | null;
}

/**
 * Builds one series' polyline in pixel space.
 *
 * Each series is scaled to its own domain: fuel in kilograms and rpm in
 * thousands cannot share a value axis usefully, so the legend carries the
 * numbers and the chart carries the shape.
 */
export function plotSeries(
  frames: TelemetryFrame[],
  channel: Channel,
  colour: string,
  width: number,
  height: number,
  cursor: number | null,
): PlottedSeries {
  const values = frames.map((f) => channel.get(f));
  const domain = domainFor(channel, values);
  const span = domain[1] - domain[0] || 1;
  const sampled = decimate(values);
  const lastIndex = Math.max(1, values.length - 1);

  const points = sampled
    .map(({ value, index }) => {
      const x = (index / lastIndex) * width;
      const y = height - ((value - domain[0]) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const current =
    cursor !== null && cursor >= 0 && cursor < values.length
      ? values[cursor]
      : (values[values.length - 1] ?? null);

  return { channel, colour, points, domain, current };
}

/** Formats a channel value for a readout, at a sensible precision. */
export function formatValue(channel: Channel, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  const magnitude = Math.abs(value);
  const dp = magnitude >= 1000 ? 0 : magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 3;
  return value.toFixed(dp);
}
