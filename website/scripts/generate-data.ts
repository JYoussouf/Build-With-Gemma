/**
 * Generates the shared datasets in /data from the physics simulator.
 *
 * Run from website/:  npm run generate:data
 *
 * Emits, per track:
 *   data/timeseries/<key>/telemetry-10hz.jsonl  full-rate frames, first N laps
 *   data/timeseries/<key>/telemetry-1hz.jsonl   whole race, decimated
 *   data/timeseries/<key>/laps.json             every lap summary
 *   data/timeseries/<key>/alerts.json           every 2a/2b/2c alert raised
 *   data/timeseries/<key>/meta.json             provenance and totals
 *   data/samples/<key>-sensor-packets.jsonl     one lap of raw phone packets
 *
 * The whole race at 10 Hz is ~20 MB per track, too much to keep in git, so the
 * committed full-rate file covers the first few laps and the whole race is
 * kept at 1 Hz. Both are slices of the same deterministic run — pass
 * --full-rate-laps=57 to materialise the entire race at 10 Hz locally.
 *
 * Flags:
 *   --full-rate-laps=N   laps kept in telemetry-10hz.jsonl (default 3)
 *   --decimated-hz=N     rate for the whole-race file (default 1)
 *
 * The output is deterministic: same code and config in, byte-identical files
 * out. Regenerate after changing anything in /data/config.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import raceDefaults from "../../data/config/race-defaults.json" with { type: "json" };
import vehicle from "../../data/config/vehicle.json" with { type: "json" };
import { createSimState, SimState, step } from "../src/lib/simulation";
import { pointAt, TRACK_KEYS, Track } from "../src/lib/track";
import { Telemetry } from "../src/lib/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "..", "data");

const HZ = raceDefaults.telemetry_hz;
const DT = 1 / HZ;
/** Physics substep. Matches the store's integration step. */
const SUBSTEP = 0.1;
/** Guard against a track that never completes (bad geometry). */
const MAX_SIM_SECONDS = 4 * 60 * 60;

function flag(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = raw ? Number(raw.split("=")[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const FULL_RATE_LAPS = flag("full-rate-laps", 3);
const DECIMATED_HZ = flag("decimated-hz", 1);

const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LON = 111320;

const r = (v: number, dp = 2) => Number(v.toFixed(dp));

/** Inverse of the projection in track.ts, for reconstructing GPS fixes. */
function toLatLon(x: number, y: number, center: { lat: number; lon: number }) {
  return {
    lat: center.lat + y / M_PER_DEG_LAT,
    lon:
      center.lon +
      x / (M_PER_DEG_LON * Math.cos((center.lat * Math.PI) / 180)),
  };
}

function advance(sim: SimState, dt: number): SimState {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / steps;
  let cur = sim;
  for (let i = 0; i < steps; i++) cur = step(cur, h);
  return cur;
}

function frameOf(t: Telemetry, clock: number, track: Track, center: { lat: number; lon: number }) {
  const p = pointAt(track, t.trackPos);
  const { lat, lon } = toLatLon(p.x, p.y, center);
  return {
    t: r(clock, 1),
    lap: t.lap,
    lap_time_s: r(t.lapTimeS, 2),
    track_pos: r(t.trackPos, 5),
    sector: t.sector,
    lat: r(lat, 7),
    lon: r(lon, 7),
    speed_kmh: r(t.speedKmh, 1),
    rpm: Math.round(t.rpm),
    gear: t.gear,
    throttle_pct: r(t.throttlePct, 1),
    brake_pct: r(t.brakePct, 1),
    steering_deg: r(t.steeringDeg, 2),
    lateral_g: r(t.lateralG, 3),
    longitudinal_g: r(t.longitudinalG, 3),
    tyres: {
      compound: t.tyres.compound,
      wear_pct: r(t.tyres.wearPct, 3),
      grip_level: r(t.tyres.gripLevel, 4),
      age_laps: t.tyres.ageLaps,
      temps_c: {
        fl: r(t.tyres.temps.fl, 1),
        fr: r(t.tyres.temps.fr, 1),
        rl: r(t.tyres.temps.rl, 1),
        rr: r(t.tyres.temps.rr, 1),
      },
      pressures_psi: {
        fl: r(t.tyres.pressures.fl, 2),
        fr: r(t.tyres.pressures.fr, 2),
        rl: r(t.tyres.pressures.rl, 2),
        rr: r(t.tyres.pressures.rr, 2),
      },
    },
    fuel: {
      remaining_kg: r(t.fuel.remainingKg, 3),
      flow_rate_kg_h: r(t.fuel.flowRateKgH, 1),
      avg_per_lap_kg: r(t.fuel.avgPerLapKg, 3),
      laps_remaining: t.fuel.lapsRemaining,
    },
    ers: {
      soc_pct: r(t.ers.socPct, 2),
      mode: t.ers.mode,
      power_kw: r(t.ers.powerKw, 1),
      harvested_mj: r(t.ers.harvestedMj, 3),
      deployed_mj: r(t.ers.deployedMj, 3),
    },
    brakes: {
      temps_c: {
        fl: r(t.brakes.temps.fl, 1),
        fr: r(t.brakes.temps.fr, 1),
        rl: r(t.brakes.temps.rl, 1),
        rr: r(t.brakes.temps.rr, 1),
      },
      pad_pct: r(t.brakes.padPct, 2),
      fade: t.brakes.fade,
    },
    weather: {
      air_temp_c: r(t.weather.airTempC, 1),
      track_temp_c: r(t.weather.trackTempC, 1),
      wind_kmh: r(t.weather.windKmh, 1),
      wind_dir: t.weather.windDir,
      rain_mm_h: r(t.weather.rainMmH, 2),
      condition: t.weather.condition,
    },
  };
}

/**
 * Reconstructs the raw phone packet the app would have sent for this frame.
 * The real pipeline runs the other way — packets in, telemetry out — so these
 * are useful as replay fixtures for the app and for backend model tests.
 */
function sensorPacketOf(
  t: Telemetry,
  clock: number,
  track: Track,
  center: { lat: number; lon: number },
  raceId: string,
  epoch: number,
) {
  const p = pointAt(track, t.trackPos);
  const { lat, lon } = toLatLon(p.x, p.y, center);
  const speedMs = t.speedKmh / 3.6;
  const yawRate = speedMs * p.curvature;
  const ahead = pointAt(track, t.trackPos + 0.002);
  const heading =
    (((Math.atan2(ahead.x - p.x, ahead.y - p.y) * 180) / Math.PI) + 360) % 360;

  return {
    ts: r(epoch + clock, 3),
    race_id: raceId,
    gps: {
      lat: r(lat, 7),
      lon: r(lon, 7),
      speed_ms: r(speedMs, 2),
      heading_deg: r(heading, 1),
      altitude_m: 334.2,
      accuracy_m: 3.1,
    },
    imu: {
      accel_x: r(t.lateralG, 3),
      accel_y: r(t.longitudinalG, 3),
      accel_z: r(0.02, 3),
      gyro_x: 0,
      gyro_y: 0,
      gyro_z: r(yawRate, 4),
    },
    baro: { pressure_mbar: 1013.2 },
    meta: { battery_pct: 72, orientation: "pocket" },
  };
}

function generateTrack(trackKey: string) {
  let sim = createSimState(trackKey);
  const track = sim.track;
  // The geographic centre the projection was built around, so emitted GPS
  // fixes land back on the real roads.
  const center: { lat: number; lon: number } = JSON.parse(
    readFileSync(join(DATA, "tracks", `${trackKey}.json`), "utf8"),
  ).center;

  const fullRate: string[] = [];
  const decimated: string[] = [];
  const packets: string[] = [];
  const decimateEvery = Math.max(1, Math.round(HZ / DECIMATED_HZ));
  const raceId = `sim-${trackKey}`;
  // Fixed epoch keeps output byte-identical between runs.
  const epoch = 1722430567.0;

  let clock = 0;
  let tick = 0;
  let totalFrames = 0;
  while (sim.telemetry.status === "live" && clock < MAX_SIM_SECONDS) {
    const frame = frameOf(sim.telemetry, clock, track, center);
    totalFrames++;

    if (sim.telemetry.lap <= FULL_RATE_LAPS) fullRate.push(JSON.stringify(frame));
    if (tick % decimateEvery === 0) decimated.push(JSON.stringify(frame));
    if (sim.telemetry.lap <= 1) {
      packets.push(
        JSON.stringify(
          sensorPacketOf(sim.telemetry, clock, track, center, raceId, epoch),
        ),
      );
    }

    sim = advance(sim, DT);
    clock += DT;
    tick++;
  }

  const t = sim.telemetry;
  const laps = [...t.laps].reverse().map((l) => ({
    lap: l.lap,
    s1: r(l.s1, 3),
    s2: r(l.s2, 3),
    s3: r(l.s3, 3),
    total: r(l.total, 3),
    delta_to_target_s: r(l.total - t.strategy.targetLapTimeS, 3),
    fuel_kg: r(l.fuelKg, 3),
    wear_pct: r(l.wearPct, 2),
    alert_tier: l.alertTier ?? null,
  }));

  const alerts = [...t.alerts].reverse().map((a) => ({
    id: a.id,
    tier: a.tier,
    severity: a.severity,
    lap: a.lap,
    title: a.title,
    message: a.message,
    status: a.status,
    created_at: r(a.createdAt, 1),
    ...(a.sigma !== undefined ? { sigma: a.sigma } : {}),
    ...(a.channels ? { channels: a.channels } : {}),
    ...(a.recommendation ? { recommendation: a.recommendation } : {}),
  }));

  const dir = join(DATA, "timeseries", trackKey);
  mkdirSync(dir, { recursive: true });

  const meta = {
    description: `Full simulated race on ${track.name}, generated by website/scripts/generate-data.ts.`,
    track_key: trackKey,
    track_name: track.name,
    track_length_m: r(track.lengthM, 1),
    total_laps: t.lap,
    telemetry_hz: HZ,
    duration_s: r(clock, 1),
    frames: {
      description:
        "The full race at 10 Hz is too large for git. telemetry-10hz.jsonl is the opening laps at full rate; telemetry-1hz.jsonl is the whole race decimated. Regenerate either with website/scripts/generate-data.ts.",
      total_at_10hz: totalFrames,
      full_rate_file: "telemetry-10hz.jsonl",
      full_rate_laps: Math.min(FULL_RATE_LAPS, t.lap),
      full_rate_frames: fullRate.length,
      decimated_file: "telemetry-1hz.jsonl",
      decimated_hz: DECIMATED_HZ,
      decimated_frames: decimated.length,
    },
    starting_fuel_kg: vehicle.fuel.starting_kg,
    starting_compound: raceDefaults.starting_compound,
    fastest_lap_s: laps.length ? r(Math.min(...laps.map((l) => l.total)), 3) : null,
    fuel_used_kg: r(vehicle.fuel.starting_kg - t.fuel.remainingKg, 2),
    final_tyre_wear_pct: r(t.tyres.wearPct, 2),
    alerts_by_tier: {
      "2a": alerts.filter((a) => a.tier === "2a").length,
      "2b": alerts.filter((a) => a.tier === "2b").length,
      "2c": alerts.filter((a) => a.tier === "2c").length,
    },
    schema: {
      telemetry: "../../schema/telemetry-frame.schema.json",
      laps: "../../schema/lap-summary.schema.json",
      alerts: "../../schema/alert.schema.json",
    },
  };

  writeFileSync(join(dir, "telemetry-10hz.jsonl"), fullRate.join("\n") + "\n");
  writeFileSync(join(dir, "telemetry-1hz.jsonl"), decimated.join("\n") + "\n");
  writeFileSync(join(dir, "laps.json"), JSON.stringify(laps, null, 2) + "\n");
  writeFileSync(join(dir, "alerts.json"), JSON.stringify(alerts, null, 2) + "\n");
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  mkdirSync(join(DATA, "samples"), { recursive: true });
  writeFileSync(
    join(DATA, "samples", `${trackKey}-sensor-packets.jsonl`),
    packets.join("\n") + "\n",
  );

  return { meta, packets: packets.length, laps: laps.length, alerts: alerts.length };
}

for (const key of TRACK_KEYS) {
  const { meta, packets, laps, alerts } = generateTrack(key);
  console.log(
    `${key.padEnd(7)} ${String(laps).padStart(3)} laps  ` +
      `${String(meta.frames.total_at_10hz).padStart(6)} frames @10Hz  ` +
      `(${meta.frames.full_rate_frames} full-rate, ` +
      `${meta.frames.decimated_frames} @${DECIMATED_HZ}Hz)  ` +
      `fastest ${meta.fastest_lap_s}s  ${alerts} alerts  ${packets} packets`,
  );
}
