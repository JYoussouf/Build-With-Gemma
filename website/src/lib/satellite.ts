"use client";

import trackIndex from "@data/tracks/index.json";

/**
 * Satellite imagery under the circuit maps.
 *
 * Esri World Imagery, whose export endpoint serves a bbox as a single image
 * with no API key. That is the only reason it is here rather than Google:
 * docs/map-technology.md commits to Google Maps Platform, and this should be
 * swapped for Photorealistic 3D Tiles once a key exists. Two consequences
 * worth knowing:
 *
 *   - It needs network at render time, unlike the vector layers, so the map
 *     must still read correctly when the request fails.
 *   - Its terms of use should be checked before any public deployment.
 *
 * The metric projection in track-build.ts is equirectangular, so requesting
 * the image in EPSG:4326 (plate carrée) puts imagery and vectors in the same
 * frame at this scale without reprojection.
 */

const ENDPOINT =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

/** Requested image size. Enough to stay sharp on a large preview. */
const IMAGE_PX = 1400;

export interface MetricBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Parses an SVG viewBox into the metric bounds it covers. */
export function boundsFromViewBox(viewBox: string): MetricBounds {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  // The diagram flips y for screen, so the viewBox's y is negated northing.
  return { minX: x, maxX: x + w, minY: -(y + h), maxY: -y };
}

/** The imagery URL covering a circuit's map, or null if the track is unknown. */
export function satelliteUrl(
  trackKey: string,
  bounds: MetricBounds,
): string | null {
  const entry = trackIndex.tracks.find((t) => t.key === trackKey);
  if (!entry) return null;

  const lonPerM =
    1 / (M_PER_DEG_LON * Math.cos((entry.center.lat * Math.PI) / 180));
  const latPerM = 1 / M_PER_DEG_LAT;

  const west = entry.center.lon + bounds.minX * lonPerM;
  const east = entry.center.lon + bounds.maxX * lonPerM;
  const south = entry.center.lat + bounds.minY * latPerM;
  const north = entry.center.lat + bounds.maxY * latPerM;

  // Match the image's aspect to the bbox, so the imagery is not stretched.
  const aspect = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
  const width = aspect >= 1 ? IMAGE_PX : Math.round(IMAGE_PX * aspect);
  const height = aspect >= 1 ? Math.round(IMAGE_PX / aspect) : IMAGE_PX;

  const params = new URLSearchParams({
    bbox: `${west},${south},${east},${north}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    format: "jpg",
    f: "image",
  });
  return `${ENDPOINT}?${params}`;
}
