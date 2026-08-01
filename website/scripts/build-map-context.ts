/**
 * Derives the real road network around each circuit, for drawing underneath
 * the racing line.
 *
 * Run from website/:  npm run build:map
 * (also runs as part of `npm run generate:data`)
 *
 * The tracks were cut from OpenStreetMap road centrelines, and the same
 * Overpass response that produced them is cached in
 * `tools/track_generator/osm_roads_cache.json`. Reusing it means the map under
 * the track is the same data the track came from, so the two cannot disagree
 * about where a road is — and it needs no tile server, no API key and no
 * network at render time.
 *
 * Output goes to `/data/tracks/<key>.context.json`, projected into the same
 * metric space as `<key>.geometry.json` so the SVG can draw both in one
 * coordinate system.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "..", "data");
const TOOLS = join(HERE, "..", "..", "tools", "track_generator");
const ROADS_CACHE = join(TOOLS, "osm_roads_cache.json");
const BUILDINGS_CACHE = join(TOOLS, "osm_buildings_cache.json");

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** How far beyond the circuit's own extent to keep roads, in metres. */
const MARGIN_M = 260;

interface OsmWay {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/**
 * Extruded height per building class, in metres.
 *
 * OSM around RIM Park carries almost no height or level tags, so these are
 * plausible defaults by use rather than surveyed values. They exist to give
 * the massing depth, not to state how tall anything is.
 */
const BUILDING_HEIGHT: Record<string, number> = {
  sports_centre: 14,
  commercial: 12,
  industrial: 10,
  apartments: 14,
  school: 9,
  parking: 8,
  retail: 8,
  house: 6,
  yes: 7,
};

const DEFAULT_HEIGHT = 7;

/**
 * Road classes, ordered so the renderer can weight them. Service roads and
 * car parks are the bulk of the RIM Park data and would dominate the picture
 * at an even weight, so they are drawn thinnest.
 */
const CLASS_RANK: Record<string, number> = {
  secondary: 4,
  tertiary: 3,
  unclassified: 2,
  residential: 2,
  service: 1,
};

interface ContextWay {
  /** Road class, for stroke weight. */
  k: number;
  /** Name, where OSM has one. Only kept for the roads the circuit uses. */
  n?: string;
  /** Flat [x, y, x, y, ...] in metres, same projection as the geometry file. */
  p: number[];
}

interface ContextBuilding {
  /** Footprint ring, flat [x, y, ...] in metres. */
  p: number[];
  /** Extrusion height in metres. */
  h: number;
  /** Name, where OSM has one. These are the landmarks worth labelling. */
  n?: string;
}

function project(
  lat: number,
  lon: number,
  center: { lat: number; lon: number },
): [number, number] {
  return [
    (lon - center.lon) * M_PER_DEG_LON * Math.cos((center.lat * Math.PI) / 180),
    (lat - center.lat) * M_PER_DEG_LAT,
  ];
}

const roadsCache = JSON.parse(readFileSync(ROADS_CACHE, "utf8")) as {
  elements: OsmWay[];
};
const buildingsCache = JSON.parse(readFileSync(BUILDINGS_CACHE, "utf8")) as {
  elements: OsmWay[];
};
const index = JSON.parse(
  readFileSync(join(DATA, "tracks", "index.json"), "utf8"),
) as { tracks: { key: string; center: { lat: number; lon: number } }[] };

for (const entry of index.tracks) {
  const geometry = JSON.parse(
    readFileSync(join(DATA, "tracks", `${entry.key}.geometry.json`), "utf8"),
  ) as { points: number[][]; roads: string[]; name: string };

  // Keep only what falls near this circuit. The cache covers all of RIM Park,
  // and a 3 km circuit's map should not carry the 800 m one's back streets.
  const xs = geometry.points.map((p) => p[0]);
  const ys = geometry.points.map((p) => p[1]);
  const bounds = {
    minX: Math.min(...xs) - MARGIN_M,
    maxX: Math.max(...xs) + MARGIN_M,
    minY: Math.min(...ys) - MARGIN_M,
    maxY: Math.max(...ys) + MARGIN_M,
  };

  const ways: ContextWay[] = [];
  for (const way of roadsCache.elements) {
    if (!way.geometry || way.geometry.length < 2) continue;
    const highway = way.tags?.highway ?? "";
    const rank = CLASS_RANK[highway];
    if (!rank) continue;

    const projected = way.geometry.map((p) => project(p.lat, p.lon, entry.center));
    const visible = projected.some(
      ([x, y]) =>
        x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY,
    );
    if (!visible) continue;

    const name = way.tags?.name;
    ways.push({
      k: rank,
      ...(name && geometry.roads.includes(name) ? { n: name } : {}),
      p: projected.flatMap(([x, y]) => [
        Number(x.toFixed(1)),
        Number(y.toFixed(1)),
      ]),
    });
  }

  // Buildings, for massing under the circuit. Same bounds test as the roads.
  const buildings: ContextBuilding[] = [];
  for (const way of buildingsCache.elements) {
    if (!way.geometry || way.geometry.length < 3) continue;
    const kind = way.tags?.building ?? way.tags?.leisure ?? "yes";
    const projected = way.geometry.map((p) => project(p.lat, p.lon, entry.center));
    const visible = projected.some(
      ([x, y]) =>
        x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY,
    );
    if (!visible) continue;

    const name = way.tags?.name;
    const explicit = Number(way.tags?.height ?? NaN);
    const levels = Number(way.tags?.["building:levels"] ?? NaN);
    const height = Number.isFinite(explicit)
      ? explicit
      : Number.isFinite(levels)
        ? levels * 3.2
        : (BUILDING_HEIGHT[kind] ?? DEFAULT_HEIGHT);

    buildings.push({
      p: projected.flatMap(([x, y]) => [
        Number(x.toFixed(1)),
        Number(y.toFixed(1)),
      ]),
      h: height,
      ...(name ? { n: name } : {}),
    });
  }

  const out = {
    description:
      "Real road network around this circuit, from the same OpenStreetMap extract the track was cut from. Projected into the metric space of the matching .geometry.json. Built by website/scripts/build-map-context.ts.",
    track_key: entry.key,
    source:
      "OpenStreetMap via tools/track_generator/osm_roads_cache.json and osm_buildings_cache.json",
    ways,
    buildings,
  };

  writeFileSync(
    join(DATA, "tracks", `${entry.key}.context.json`),
    JSON.stringify(out) + "\n",
  );

  const named = buildings.filter((b) => b.n).length;
  console.log(
    `${entry.key.padEnd(7)} ${String(ways.length).padStart(3)} roads  ` +
      `${String(buildings.length).padStart(4)} buildings (${named} named)  ` +
      `${(JSON.stringify(out).length / 1024).toFixed(0)} KB`,
  );
}
