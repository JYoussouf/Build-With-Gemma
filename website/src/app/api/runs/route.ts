/**
 * Index of the recorded races in `/data/timeseries`.
 *
 * These are archives, not live state — see the note in `runs/[track]/route.ts`
 * about why replay is kept away from the live pipeline.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import trackIndex from "@data/tracks/index.json";

const DATA = join(process.cwd(), "..", "data");

export interface RunMeta {
  track_key: string;
  track_name: string;
  track_length_m: number;
  total_laps: number;
  duration_s: number;
  fastest_lap_s: number | null;
  fuel_used_kg: number;
  final_tyre_wear_pct: number;
  alerts_by_tier: Record<string, number>;
  frames: { total_at_10hz: number; decimated_frames: number };
  /**
   * When the archive was written, from the file's own mtime. The generator is
   * deliberately deterministic and stamps nothing itself, so this is the only
   * honest record of when a run was produced.
   */
  recorded_at: string;
}

export async function GET() {
  const runs = await Promise.all(
    trackIndex.tracks.map(async (t) => {
      try {
        const path = join(DATA, "timeseries", t.key, "meta.json");
        const [raw, stats] = await Promise.all([
          readFile(path, "utf8"),
          stat(path),
        ]);
        return {
          ...JSON.parse(raw),
          recorded_at: stats.mtime.toISOString(),
        } as RunMeta;
      } catch {
        // A track with no archive yet is simply absent from the list.
        return null;
      }
    }),
  );

  return Response.json(
    { runs: runs.filter(Boolean) },
    {
      // Archives only change when generate:data is re-run.
      headers: { "cache-control": "public, max-age=3600" },
    },
  );
}
