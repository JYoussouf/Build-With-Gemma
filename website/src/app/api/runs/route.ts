/**
 * Index of the recorded runs.
 *
 * Two sources merged:
 * 1. Static JSON archives (data/timeseries/runs.json) — pre-recorded demo runs
 * 2. PostgreSQL races — races that were run live on the server and completed
 *
 * DB races appear as replayable runs so the engineer can review what happened.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import manifest from "@data/timeseries/runs.json";
import trackIndex from "@data/tracks/index.json";
import { listRaces } from "@server/db";

const DATA = join(process.cwd(), "..", "data");

export interface RunSummary {
  id: string;
  track_key: string;
  track_name: string;
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
  /** True when the source is the database rather than a JSON archive. */
  source?: "archive" | "database";
  /** Label shown in the UI. */
  label: string;
}

export async function GET() {
  // ── Static archives ──────────────────────────────────────────────
  const archiveRuns = await Promise.all(
    manifest.runs.map(async (entry) => {
      try {
        const path = join(DATA, "timeseries", entry.archive, "meta.json");
        const [raw, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
        const meta = JSON.parse(raw);
        const overrides =
          "overrides" in entry ? (entry.overrides as Record<string, unknown>) : {};

        return {
          ...meta,
          ...overrides,
          id: entry.id,
          track_key: entry.track_key,
          label: entry.label,
          source: "archive" as const,
          recorded_at: entry.recorded_at ?? stats.mtime.toISOString(),
          ...("synthetic" in entry
            ? {
                synthetic: entry.synthetic,
                synthetic_note: entry.synthetic_note,
              }
            : {}),
        } as RunSummary;
      } catch {
        return null;
      }
    }),
  );

  // ── Database races ────────────────────────────────────────────────
  let dbRuns: RunSummary[] = [];
  try {
    const races = await listRaces();
    dbRuns = races.map((race) => {
      const track = trackIndex.tracks.find((t) => t.key === "club");
      const createdAtStr = typeof race.created_at === "string"
        ? race.created_at
        : new Date(race.created_at as string).toISOString();
      return {
        id: `db-${race.id}`,
        track_key: track?.key ?? "club",
        track_name: race.name ?? "Unknown",
        track_length_m: track?.total_distance_m ?? 1200,
        total_laps: race.total_laps,
        duration_s: 0,
        fastest_lap_s: null,
        fuel_used_kg: 0,
        final_tyre_wear_pct: 0,
        alerts_by_tier: {},
        recorded_at: createdAtStr,
        source: "database" as const,
        label: `Live run ${createdAtStr.slice(11, 19)}`,
      };
    });
  } catch (err) {
    // DB might not be available in all environments
    console.error("Failed to load DB races for runs list:", err);
  }

  // ── Merge ─────────────────────────────────────────────────────────
  const all = [...archiveRuns.filter(Boolean), ...dbRuns] as RunSummary[];

  // Circuit order follows the tracks index so the featured one can lead.
  const order = new Map(trackIndex.tracks.map((t, i) => [t.key, i]));
  all.sort(
    (a, b) =>
      (order.get(a.track_key) ?? 99) - (order.get(b.track_key) ?? 99) ||
      a.recorded_at.localeCompare(b.recorded_at),
  );

  return Response.json(
    { runs: all },
    { headers: { "cache-control": "no-cache" } },
  );
}
