/**
 * Index of the recorded runs.
 *
 * A run has its own identity rather than being the circuit it was set on: a
 * circuit accumulates runs, and two runs can read the same archive. The
 * manifest at data/timeseries/runs.json is the list; each entry names the
 * archive its telemetry comes from.
 *
 * These are archives, not live state — see the note in `runs/[id]/route.ts`
 * about why replay is kept away from the live pipeline.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import manifest from "@data/timeseries/runs.json";
import trackIndex from "@data/tracks/index.json";

const DATA = join(process.cwd(), "..", "data");

export interface RunSummary {
  id: string;
  track_key: string;
  track_name: string;
  label: string;
  track_length_m: number;
  total_laps: number;
  duration_s: number;
  fastest_lap_s: number | null;
  fuel_used_kg: number;
  final_tyre_wear_pct: number;
  alerts_by_tier: Record<string, number>;
  recorded_at: string;
  /** True when the entry is a placeholder rather than a real recording. */
  synthetic?: boolean;
  synthetic_note?: string;
}

export async function GET() {
  const runs = await Promise.all(
    manifest.runs.map(async (entry) => {
      try {
        const path = join(DATA, "timeseries", entry.archive, "meta.json");
        const [raw, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
        const meta = JSON.parse(raw);
        const overrides =
          "overrides" in entry ? (entry.overrides as Record<string, unknown>) : {};

        return {
          ...meta,
          // Overrides let a synthetic entry carry its own figures rather than
          // repeating the archive's and reading as a duplicate recording.
          ...overrides,
          id: entry.id,
          track_key: entry.track_key,
          label: entry.label,
          recorded_at: entry.recorded_at ?? stats.mtime.toISOString(),
          ...("synthetic" in entry
            ? {
                synthetic: entry.synthetic,
                synthetic_note: entry.synthetic_note,
              }
            : {}),
        } as RunSummary;
      } catch {
        // A run whose archive is missing is simply absent from the list.
        return null;
      }
    }),
  );

  // Circuit order follows the tracks index so the featured one can lead.
  const order = new Map(trackIndex.tracks.map((t, i) => [t.key, i]));
  const listed = runs.filter(Boolean) as RunSummary[];
  listed.sort(
    (a, b) =>
      (order.get(a.track_key) ?? 99) - (order.get(b.track_key) ?? 99) ||
      a.recorded_at.localeCompare(b.recorded_at),
  );

  return Response.json(
    { runs: listed },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
