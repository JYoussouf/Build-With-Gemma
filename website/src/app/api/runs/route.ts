/**
 * Index of the recorded runs.
 *
 * Two sources merged:
 * 1. Static JSON archives (data/timeseries/runs.json) — pre-recorded demo runs
 * 2. PostgreSQL races — races that were run live on the server and completed
 *
 * DB races appear as replayable runs so the engineer can review what happened.
 *
 * The database half is local-only: the Cloudflare deployment has no Postgres
 * in front of it, and Workers cannot load `pg` at all, so the import is
 * deferred to request time and a failure degrades to the archives alone. That
 * is the same shape as the local behaviour when Postgres is simply down.
 */

import manifest from "@data/timeseries/runs.json";
import trackIndex from "@data/tracks/index.json";
import { readArchive } from "@/lib/archives";

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

/** Sorting compares these as strings, so the fallback has to be ISO too. */
function lastModifiedOf(response: Response): string {
  const header = response.headers.get("last-modified");
  const parsed = header ? Date.parse(header) : NaN;
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString();
}

export async function GET(request: Request) {
  // ── Static archives ──────────────────────────────────────────────
  const archiveRuns = await Promise.all(
    manifest.runs.map(async (entry) => {
      try {
        const response = await readArchive(
          `/data/timeseries/${entry.archive}/meta.json`,
          request.url,
        );
        if (!response.ok) return null;
        // Workers types give json() an `unknown`, and the archive's meta is
        // spread wholesale into the summary below.
        const meta = (await response.json()) as Record<string, unknown>;
        const overrides =
          "overrides" in entry ? (entry.overrides as Record<string, unknown>) : {};

        return {
          ...meta,
          ...overrides,
          id: entry.id,
          track_key: entry.track_key,
          label: entry.label,
          source: "archive" as const,
          // Every manifest entry carries its own timestamp; the header is the
          // fallback for one that does not, in place of the file's mtime.
          recorded_at: entry.recorded_at ?? lastModifiedOf(response),
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
    const { listRaces } = await import("@server/db");
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
