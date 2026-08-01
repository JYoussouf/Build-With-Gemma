/**
 * Placeholder track geometry.
 *
 * In production this comes from `track_points` — the smoothed GPS trace the
 * mobile app captures (docs/mobile-app.md, Screen 2). Until that pipeline
 * exists, we synthesise a closed loop with a plausible mix of fast sweeps and
 * slow corners so the physics models have real curvature to react to.
 */

export interface TrackPoint {
  x: number;
  y: number;
  /** Cumulative distance from start/finish, metres. */
  s: number;
  /** 1 / radius, in 1/m. Higher = tighter corner. */
  curvature: number;
}

const SAMPLES = 480;
/** Scene units per metre — the parametric curve below is drawn in SVG units. */
const UNITS_PER_M = 1.0;

/**
 * Harmonics tuned so the loop has five distinct braking zones and no cusps:
 * tightest radius ~16 m, roughly 40% of the lap off full throttle. A smoother
 * ellipse leaves the car flat out the whole way round and nothing interesting
 * happens to the brakes, tyres, or ERS.
 */
function shape(theta: number): [number, number] {
  const x =
    500 +
    370 * Math.cos(theta) +
    70 * Math.cos(3 * theta) -
    40 * Math.sin(2 * theta) +
    28 * Math.cos(5 * theta);
  const y =
    320 +
    200 * Math.sin(theta) +
    80 * Math.sin(2 * theta) +
    34 * Math.cos(4 * theta) +
    22 * Math.sin(5 * theta);
  return [x, y];
}

function curvatureAt(
  a: [number, number],
  b: [number, number],
  c: [number, number],
): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area = Math.abs(
    (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
  );
  if (area < 1e-6) return 0;
  // Menger curvature: 4 * triangle area / product of side lengths.
  // Signed by turn direction so the steering trace swings both ways.
  const cross =
    (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const kUnits = (2 * area) / (ab * bc * ca);
  return Math.sign(cross) * kUnits * UNITS_PER_M;
}

function buildTrack(): TrackPoint[] {
  const raw: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    raw.push(shape((i / SAMPLES) * Math.PI * 2));
  }

  const points: TrackPoint[] = [];
  let s = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const prev = raw[(i - 1 + SAMPLES) % SAMPLES];
    const cur = raw[i];
    const next = raw[(i + 1) % SAMPLES];
    if (i > 0) {
      s += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / UNITS_PER_M;
    }
    points.push({
      x: cur[0],
      y: cur[1],
      s,
      curvature: curvatureAt(prev, cur, next),
    });
  }
  return points;
}

export const TRACK: TrackPoint[] = buildTrack();

export const TRACK_LENGTH_M =
  TRACK[TRACK.length - 1].s +
  Math.hypot(
    TRACK[0].x - TRACK[TRACK.length - 1].x,
    TRACK[0].y - TRACK[TRACK.length - 1].y,
  ) /
    UNITS_PER_M;

/** Local maxima of curvature — how many corners the trace actually has. */
const NUM_CORNERS = TRACK.reduce((count, p, i) => {
  const prev = TRACK[(i - 1 + TRACK.length) % TRACK.length];
  const next = TRACK[(i + 1) % TRACK.length];
  const k = Math.abs(p.curvature);
  return k > 0.008 && k >= Math.abs(prev.curvature) && k > Math.abs(next.curvature)
    ? count + 1
    : count;
}, 0);

export const TRACK_META = {
  name: "Waterloo Street Circuit",
  country: "Canada",
  city: "Waterloo",
  corners: NUM_CORNERS,
  elevationM: [330, 338] as const,
  drsZones: 2,
};

/** SVG path string for the full loop. */
export const TRACK_PATH_D = (() => {
  const head = `M ${TRACK[0].x.toFixed(1)} ${TRACK[0].y.toFixed(1)}`;
  const rest = TRACK.slice(1)
    .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  return `${head} ${rest} Z`;
})();

/** Sector boundaries as fractions of a lap. */
export const SECTOR_SPLITS = [0.36, 0.71] as const;

export function sectorFor(pos: number): 1 | 2 | 3 {
  if (pos < SECTOR_SPLITS[0]) return 1;
  if (pos < SECTOR_SPLITS[1]) return 2;
  return 3;
}

/** Interpolated point at a normalised lap position (0..1). */
export function pointAt(pos: number): { x: number; y: number; curvature: number } {
  const t = ((pos % 1) + 1) % 1;
  const f = t * TRACK.length;
  const i = Math.floor(f);
  const frac = f - i;
  const a = TRACK[i % TRACK.length];
  const b = TRACK[(i + 1) % TRACK.length];
  return {
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac,
    curvature: a.curvature + (b.curvature - a.curvature) * frac,
  };
}

/**
 * Peak absolute curvature within `metres` down the road — used to decide when
 * to lift and brake for a corner the car has not reached yet.
 */
export function curvatureAhead(pos: number, metres: number): number {
  let peak = 0;
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const ahead = pos + (metres * i) / steps / TRACK_LENGTH_M;
    peak = Math.max(peak, Math.abs(pointAt(ahead).curvature));
  }
  return peak;
}
