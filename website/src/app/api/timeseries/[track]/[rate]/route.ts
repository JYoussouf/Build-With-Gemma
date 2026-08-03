/**
 * Serves the recorded race archives to the explore view.
 *
 * `/data` sits outside `website/`, so it is staged into `public/data` by
 * `scripts/stage-data.ts` at build time rather than committed twice. This
 * route reads it back from there, which is one code path for both
 * environments: local development gets it from Next's `public/`, and the
 * deployment gets it from Cloudflare's static assets. Cloudflare has no
 * filesystem, so reading the file directly is not an option there.
 *
 * The route stays in front of the files rather than the explore view fetching
 * `/data/...` itself, so the archives keep a single addressable API and the
 * allowlist below still governs what is reachable.
 */

import trackIndex from "@data/tracks/index.json";
import { readArchive } from "@/lib/archives";

const TRACK_KEYS = new Set(trackIndex.tracks.map((t) => t.key));

/** Request rate to filename. Also the allowlist - nothing else is readable. */
const FILES: Record<string, string> = {
  "10hz": "telemetry-10hz.jsonl",
  "1hz": "telemetry-1hz.jsonl",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ track: string; rate: string }> },
) {
  const { track, rate } = await params;

  // Both segments are checked against fixed sets before any path is built, so
  // a crafted segment cannot escape data/timeseries.
  if (!TRACK_KEYS.has(track)) {
    return Response.json({ error: `unknown track: ${track}` }, { status: 404 });
  }
  const file = FILES[rate];
  if (!file) {
    return Response.json({ error: `unknown rate: ${rate}` }, { status: 404 });
  }

  const response = await readArchive(`/data/timeseries/${track}/${file}`, request.url);
  if (!response.ok) {
    return Response.json(
      { error: `no ${file} for ${track} - run npm run generate:data` },
      { status: 404 },
    );
  }

  return new Response(response.body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      // The archives only change when generate:data is re-run.
      "cache-control": "public, max-age=3600",
    },
  });
}
