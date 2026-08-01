"use client";

/**
 * Loading a recorded run so it can drive the live pit wall.
 *
 * The archive on disk is snake_case (it is the canonical wire and storage
 * shape, described by /data/schema). The dashboard reads camelCase. The
 * conversion happens once here, at load, rather than inside the store, so the
 * store only ever deals in one vocabulary.
 *
 * The whole run is buffered up front. That is what makes the scrubber able to
 * jump anywhere in the race instantly, and playback always starts at the first
 * frame rather than wherever a stream happens to be.
 */

import { TelemetryFrame } from "./frame";
import { ReplayRun } from "./store";
import { Alert, AlertTier, LapSummary, Severity } from "./types";

/** A lap as stored. See /data/schema/lap-summary.schema.json. */
interface StoredLap {
  lap: number;
  s1: number;
  s2: number;
  s3: number;
  total: number;
  delta_to_target_s: number;
  fuel_kg: number;
  wear_pct: number;
  alert_tier: AlertTier | null;
}

/** An alert as stored. See /data/schema/alert.schema.json. */
interface StoredAlert {
  id: string;
  tier: AlertTier;
  severity: string;
  lap: number;
  title: string;
  message: string;
  status: "pending" | "sent" | "dismissed";
  created_at: number;
  sigma?: number;
  channels?: { name: string; sigma: number }[];
  recommendation?: string;
}

export interface RunSummary {
  track_key: string;
  track_name: string;
  track_length_m: number;
  total_laps: number;
  duration_s: number;
  fastest_lap_s: number | null;
  fuel_used_kg: number;
  final_tyre_wear_pct: number;
  alerts_by_tier: Record<string, number>;
}

const PRODUCER: Record<AlertTier, Alert["producer"]> = {
  "2a": "rule",
  "2b": "signal",
  "2c": "model",
};

function toAlert(a: StoredAlert): Alert {
  return {
    id: a.id,
    tier: a.tier,
    severity: a.severity as Severity,
    lap: a.lap,
    title: a.title,
    message: a.message,
    status: a.status,
    producer: PRODUCER[a.tier],
    createdAt: a.created_at,
    sigma: a.sigma,
    channels: a.channels,
    recommendation: a.recommendation,
  };
}

function toLap(l: StoredLap): LapSummary {
  return {
    lap: l.lap,
    s1: l.s1,
    s2: l.s2,
    s3: l.s3,
    total: l.total,
    fuelKg: l.fuel_kg,
    wearPct: l.wear_pct,
    alertTier: l.alert_tier ?? undefined,
  };
}

/**
 * Which archive a replay reads.
 *
 * 1 Hz covers the whole race, which is what a start-to-end scrubber needs.
 * 10 Hz is smoother but only holds the opening laps, so it is offered as a
 * detail pass rather than the default (see /data/README.md for why the files
 * are split).
 */
export type ReplayRate = "1hz" | "10hz";

export async function loadRun(
  trackKey: string,
  rate: ReplayRate = "1hz",
): Promise<ReplayRun> {
  const [detail, telemetry] = await Promise.all([
    fetch(`/api/runs/${trackKey}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error ?? "run not found");
      return r.json() as Promise<{
        meta: RunSummary & { starting_fuel_kg?: number };
        laps: StoredLap[];
        alerts: StoredAlert[];
      }>;
    }),
    fetch(`/api/timeseries/${trackKey}/${rate}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error ?? "telemetry missing");
      return r.text();
    }),
  ]);

  const frames = telemetry
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TelemetryFrame);

  if (frames.length === 0) throw new Error("recording has no frames");

  const laps = detail.laps.map(toLap);
  // The run's own fastest lap is the only honest reference for its deltas;
  // the live target came from a pre-race report this recording never had.
  const fastest = detail.meta.fastest_lap_s ?? laps[0]?.total ?? 0;

  return {
    trackKey,
    trackName: detail.meta.track_name,
    totalLaps: detail.meta.total_laps,
    frames,
    laps,
    alerts: detail.alerts.map(toAlert),
    fuelStartKg: frames[0].fuel.remaining_kg,
    fuelTargetPerLapKg: detail.meta.fuel_used_kg / detail.meta.total_laps,
    targetLapTimeS: fastest,
  };
}
