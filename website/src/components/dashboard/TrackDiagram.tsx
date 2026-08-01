"use client";

import clubContext from "@data/tracks/club.context.json";
import grandContext from "@data/tracks/grand.context.json";
import sprintContext from "@data/tracks/sprint.context.json";

import { pointAt, Track } from "@/lib/track";

/**
 * The circuit drawn over the real streets it runs on.
 *
 * The racing line alone was a shape floating in the dark: you could see its
 * corners but not that it is Millennium Boulevard and Park Road. The context
 * layer is the actual OpenStreetMap road network around the circuit, from the
 * same extract the track was cut from, so the map and the track cannot
 * disagree about where a road is.
 *
 * No tile server: the roads are vectors committed alongside the geometry, so
 * this needs no API key, no network, and stays sharp at any zoom. When the
 * Google Photorealistic 3D view lands (docs/map-technology.md) it replaces
 * this layer, not the track on top of it.
 *
 * Everything here is greyscale, per the pit-wall palette. Colour on the map
 * would compete with the status dots that carry data meaning.
 */

interface ContextFile {
  ways: { k: number; n?: string; p: number[] }[];
  buildings: { p: number[]; h: number; n?: string }[];
}

/**
 * Extrusion direction, in metres. A fixed offset rather than a projection:
 * the map is a plan view, and this lifts the roofs off their footprints just
 * enough to read as massing without pretending to be a perspective camera.
 */
const EXTRUDE_X = 0.55;
const EXTRUDE_Y = 0.75;

/** Buildings big enough to be worth labelling, in square metres. */
const LABEL_MIN_AREA = 1200;

const CONTEXT: Record<string, ContextFile> = {
  sprint: sprintContext as ContextFile,
  club: clubContext as ContextFile,
  grand: grandContext as ContextFile,
};

/** Stroke weight per road class, as a multiple of the racing line's width. */
const CLASS_WEIGHT: Record<number, number> = {
  4: 0.5, // secondary
  3: 0.42, // tertiary
  2: 0.3, // residential and unclassified
  1: 0.18, // service roads and car parks
};

/**
 * Grey per road class. Bigger roads read slightly brighter, but all of them
 * stay below the circuit's kerb so the racing line is never confused for one
 * of the streets it runs on.
 */
const CLASS_INK: Record<number, string> = {
  4: "#343434",
  3: "#2e2e2e",
  2: "#282828",
  1: "#202020",
};

/**
 * How far past the circuit to show, as a fraction of its own size.
 *
 * The geometry file's viewBox frames the racing line alone, which cut the
 * surrounding streets off mid-stroke and made them look like stray marks
 * rather than a map. This pulls back far enough for the context to read as
 * the place the circuit sits in.
 */
const CONTEXT_ZOOM_OUT = 0.28;

/** Widens a viewBox about its centre. */
function expand(viewBox: string, by: number): string {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  const dx = w * by;
  const dy = h * by;
  return `${x - dx} ${y - dy} ${w + dx * 2} ${h + dy * 2}`;
}

interface Props {
  track: Track;
  /** Normalised lap position of the car, if one should be drawn. */
  carPos?: number;
  /** Roughly the on-screen width in pixels, used to scale label text. */
  className?: string;
}

export function TrackDiagram({ track, carPos, className = "" }: Props) {
  const context = CONTEXT[track.key];
  const start = pointAt(track, 0);
  // Road width in metres, scaled to the circuit so a 3 km loop and an 800 m
  // one both read correctly.
  const road = Math.max(6, track.lengthM / 190);
  const car = carPos === undefined ? null : pointAt(track, carPos);
  const viewBox = context
    ? expand(track.svg.viewBox, CONTEXT_ZOOM_OUT)
    : track.svg.viewBox;

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label={`${track.name}, drawn over the surrounding streets`}
    >
      {/* The real streets, underneath. Drawn first so the racing line always
          sits on top of them. */}
      {context && (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {context.ways.map((way, i) => (
            <polyline
              key={i}
              points={toPoints(way.p)}
              stroke={CLASS_INK[way.k] ?? CLASS_INK[1]}
              strokeWidth={road * (CLASS_WEIGHT[way.k] ?? CLASS_WEIGHT[1])}
            />
          ))}
        </g>
      )}

      {/* Building massing, between the streets and the circuit. Each footprint
          gets a wall skirt and a lifted roof, which reads as height in a plan
          view without needing a perspective camera. */}
      {context?.buildings && (
        <g>
          {context.buildings.map((b, i) => {
            const dx = b.h * EXTRUDE_X;
            const dy = b.h * EXTRUDE_Y;
            return (
              <g key={i}>
                {/* Walls: the footprint swept to the roof offset. */}
                <polygon
                  points={sweep(b.p, dx, dy)}
                  fill="#232323"
                  stroke="#2a2a2a"
                  strokeWidth={0.6}
                />
                {/* Roof, offset so the walls show beneath it. */}
                <polygon
                  points={toPoints(b.p, dx, dy)}
                  fill="#303030"
                  stroke="#3d3d3d"
                  strokeWidth={0.6}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* The circuit. Three passes: a dark casing, a light kerb, then the
          surface, which is what gives it depth against the streets. */}
      <path
        d={track.svg.pathD}
        fill="none"
        stroke="#0a0a0a"
        strokeWidth={road * 1.9}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={track.svg.pathD}
        fill="none"
        stroke="#6e6e6e"
        strokeWidth={road * 1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={track.svg.pathD}
        fill="none"
        stroke="#1c1c1c"
        strokeWidth={road}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {track.sectorSplits.map((split, i) => {
        const p = pointAt(track, split);
        return (
          <g key={split}>
            <circle
              cx={p.x}
              cy={-p.y}
              r={road * 0.7}
              fill="#0a0a0a"
              stroke="#707070"
              strokeWidth={road * 0.22}
            />
            <text
              x={p.x}
              y={-p.y - road * 1.4}
              textAnchor="middle"
              fill="#a0a0a0"
              fontSize={road * 1.6}
            >
              S{i + 2}
            </text>
          </g>
        );
      })}

      <rect
        x={start.x - road * 0.28}
        y={-start.y - road * 1.2}
        width={road * 0.56}
        height={road * 2.4}
        fill="#ffffff"
      />
      <text
        x={start.x}
        y={-start.y - road * 1.8}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={road * 1.6}
      >
        S/F
      </text>

      {/* Landmarks. Only named buildings with real footprint area, so the map
          says where you are without becoming a directory. */}
      {context?.buildings
        ?.filter((b) => b.n && area(b.p) > LABEL_MIN_AREA)
        .map((b, i) => {
          const c = centroid(b.p);
          return (
            <text
              key={`label-${i}`}
              x={c[0] + b.h * EXTRUDE_X}
              y={-(c[1] + b.h * EXTRUDE_Y)}
              textAnchor="middle"
              fill="#8a8a8a"
              fontSize={road * 0.9}
              className="pointer-events-none"
            >
              {b.n}
            </text>
          );
        })}

      {car && (
        <>
          <circle cx={car.x} cy={-car.y} r={road * 1.5} fill="rgba(0,200,83,0.16)" />
          <circle cx={car.x} cy={-car.y} r={road * 0.68} fill="var(--color-status-ok)" />
        </>
      )}
    </svg>
  );
}

/**
 * Flat [x, y, ...] in metres to an SVG points list, flipping y for screen.
 * An optional offset lifts a roof off its footprint.
 */
function toPoints(flat: number[], dx = 0, dy = 0): string {
  const out: string[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push(`${flat[i] + dx},${-(flat[i + 1] + dy)}`);
  }
  return out.join(" ");
}

/**
 * The wall band between a footprint and its roof: the footprint forwards,
 * then the offset ring backwards, giving one closed polygon per building.
 */
function sweep(flat: number[], dx: number, dy: number): string {
  const base: string[] = [];
  const top: string[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    base.push(`${flat[i]},${-flat[i + 1]}`);
    top.push(`${flat[i] + dx},${-(flat[i + 1] + dy)}`);
  }
  return [...base, ...top.reverse()].join(" ");
}

/** Shoelace area of a footprint ring, in square metres. */
function area(flat: number[]): number {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return Math.abs(a) / 2;
}

function centroid(flat: number[]): [number, number] {
  let x = 0;
  let y = 0;
  const n = flat.length / 2;
  for (let i = 0; i < n; i++) {
    x += flat[i * 2];
    y += flat[i * 2 + 1];
  }
  return [x / n, y / n];
}
