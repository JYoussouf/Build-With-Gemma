/**
 * One recorded run: its summary, every lap, and every alert that fired.
 *
 * Two sources:
 * 1. Static JSON archives (data/timeseries/) — looked up via runs.json manifest
 * 2. PostgreSQL races — ID format is `db-<uuid>`, fetched from the database
 *
 * Deliberately a separate endpoint from anything the live race uses. A
 * recorded alert is a record of what fired during that race — it is not a
 * pending item, and nothing here should ever reach the engineer's approval
 * queue or the agent feed. Replay is evidence, not telemetry.
 *
 * The archive half reads through `readArchive` and the database half defers
 * its import, for the reasons given in those two modules: Workers has no
 * filesystem, and `pg` cannot load there at all.
 */

import manifest from "@data/timeseries/runs.json";
import trackIndex from "@data/tracks/index.json";
import { readArchive } from "@/lib/archives";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Database race (ID starts with "db-") ────────────────────────
  if (id.startsWith("db-")) {
    const raceId = id.slice(3);

    try {
      const { getLapSummaries, getAgentMessages, getRaceById } = await import("@server/db");
      const race = await getRaceById(raceId);
      if (!race) {
        return Response.json({ error: `unknown db race: ${id}` }, { status: 404 });
      }

      const [laps, messages] = await Promise.all([
        getLapSummaries(raceId),
        getAgentMessages(raceId),
      ]);

      const track = trackIndex.tracks.find((t) => t.key === "club");

      const createdAtStr = typeof race.created_at === "string"
        ? race.created_at
        : new Date(race.created_at as string).toISOString();

      const meta = {
        id,
        track_key: track?.key ?? "club",
        track_name: race.name ?? "Unknown",
        track_length_m: track?.total_distance_m ?? 1200,
        total_laps: race.total_laps,
        duration_s: 0,
        fastest_lap_s: laps.length > 0
          ? Math.min(...laps.map((l) => l.total).filter((t) => t > 0))
          : null,
        fuel_used_kg: laps.reduce((sum, l) => sum + l.fuelKg, 0),
        final_tyre_wear_pct: laps.length > 0 ? laps[laps.length - 1].wearPct : 0,
        alerts_by_tier: {},
        recorded_at: createdAtStr,
        source: "database" as const,
        label: `Live run ${createdAtStr.slice(11, 19)}`,
        starting_fuel_kg: 15,
      };

      // Convert DB laps to the stored lap format the replay system expects
      const storedLaps = laps.map((l) => ({
        lap: l.lap,
        s1: l.s1,
        s2: l.s2,
        s3: l.s3,
        total: l.total,
        delta_to_target_s: 0,
        fuel_kg: l.fuelKg,
        wear_pct: l.wearPct,
        alert_tier: null,
      }));

      // Convert DB messages to the stored alert format
      const storedAlerts = messages.map((m) => ({
        id: m.id,
        tier: "2a" as const,
        severity: "low",
        lap: m.lap ?? 0,
        title: "Agent message",
        message: m.text,
        status: "sent" as const,
        created_at: m.createdAt,
      }));

      return Response.json(
        { meta, laps: storedLaps, alerts: storedAlerts },
        { headers: { "cache-control": "public, max-age=60" } },
      );
    } catch (err) {
      return Response.json(
        { error: `db race load failed: ${err}` },
        { status: 500 },
      );
    }
  }

  // ── Static JSON archive ──────────────────────────────────────────
  const entry = manifest.runs.find((r) => r.id === id);
  if (!entry) {
    return Response.json({ error: `unknown run: ${id}` }, { status: 404 });
  }

  const dir = `/data/timeseries/${entry.archive}`;
  try {
    const [metaRes, lapsRes, alertsRes] = await Promise.all([
      readArchive(`${dir}/meta.json`, request.url),
      readArchive(`${dir}/laps.json`, request.url),
      readArchive(`${dir}/alerts.json`, request.url),
    ]);
    // A miss is a 404 body rather than a throw, so it has to be checked:
    // parsing an error page as the run would surface as a broken replay
    // instead of a missing one.
    if (!metaRes.ok || !lapsRes.ok || !alertsRes.ok) {
      throw new Error(
        `archive incomplete: meta ${metaRes.status}, laps ${lapsRes.status}, alerts ${alertsRes.status}`,
      );
    }
    const [meta, laps, alerts] = await Promise.all([
      metaRes.json() as Promise<Record<string, unknown>>,
      lapsRes.json(),
      alertsRes.json(),
    ]);
    const overrides =
      "overrides" in entry ? (entry.overrides as Record<string, unknown>) : {};
    return Response.json(
      {
        meta: { ...meta, ...overrides, id: entry.id, label: entry.label },
        laps,
        alerts,
      },
      { headers: { "cache-control": "public, max-age=3600" } },
    );
  } catch (err) {
    // Logged rather than swallowed: "no archive" is the right answer when the
    // files were never generated, but it is a misleading one when the read
    // itself failed, and the two are indistinguishable from the response.
    console.error(`archive read failed for ${id}:`, err);
    return Response.json(
      { error: `no archive for ${id} - run npm run generate:data` },
      { status: 404 },
    );
  }
}
