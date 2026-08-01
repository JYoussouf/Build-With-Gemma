/**
 * Client-side telemetry simulator.
 *
 * Stand-in for the real pipeline: phone sensors -> backend physics models ->
 * Redis hot state -> WebSocket (docs/data-flow.md). The models here are the
 * same shape as the ones in docs/tech-stack.md (fuel burn, tyre wear/temp,
 * brake temp, ERS harvest/deploy), just driven by a synthetic car lapping a
 * synthetic track instead of by a human walking around with a phone.
 *
 * Everything is deterministic — no Date.now(), no Math.random() — so the
 * server-rendered first frame matches the client's.
 */

import {
  Alert,
  AlertTier,
  Corners,
  LapSummary,
  Severity,
  Telemetry,
} from "./types";
import { curvatureAhead, pointAt, sectorFor, TRACK_LENGTH_M } from "./track";

const G = 9.81;
const MAX_LAT_G = 3.8;
const V_MAX_KMH = 328;
const V_MIN_KMH = 74;
const MAX_ACCEL = 11; // m/s^2
const MAX_DECEL = 42; // m/s^2
const LOOKAHEAD_M = 140;
const STARTING_FUEL_KG = 100;
const MGU_K_MAX_KW = 350;
const DEPLOY_MAX_KW = 200;
const TYRE_INERTIA = 0.3;
/** Road-wheel angle to steering-wheel angle. */
const STEERING_RATIO = 4.2;

const GEAR_THRESHOLDS = [0, 62, 108, 152, 194, 234, 272, 302];

const COMPOUND_WEAR = { soft: 1.55, medium: 1.0, hard: 0.72, intermediate: 1.2, wet: 1.3 };
const COMPOUND_FUEL = { soft: 1.05, medium: 1.0, hard: 0.97, intermediate: 1.08, wet: 1.12 };

/** Mutable bits the models need across ticks that aren't part of the UI state. */
interface SimScratch {
  clock: number;
  seq: number;
  sectorStart: number;
  sectorTimes: [number, number, number];
  lapFuelStart: number;
  lapHarvest: number;
  lapDeploy: number;
  lastRuleLap: Record<string, number>;
  nextAnomalyAt: number;
  anomalyCount: number;
}

export interface SimState {
  telemetry: Telemetry;
  scratch: SimScratch;
}

const corners = (v: number): Corners => ({ fl: v, fr: v, rl: v, rr: v });

export function createSimState(): SimState {
  const telemetry: Telemetry = {
    status: "live",
    lap: 1,
    totalLaps: 57,
    lapTimeS: 0,
    lastLapS: 0,
    deltaToTargetS: 0,
    trackPos: 0,
    sector: 1,
    speedKmh: 0,
    rpm: 4200,
    gear: 1,
    throttlePct: 0,
    brakePct: 0,
    steeringDeg: 0,
    lateralG: 0,
    longitudinalG: 0,
    tyres: {
      compound: "medium",
      wearPct: 0,
      gripLevel: 1,
      ageLaps: 0,
      temps: { fl: 82, fr: 84, rl: 79, rr: 80 },
      pressures: { fl: 21, fr: 21, rl: 19.5, rr: 19.5 },
    },
    fuel: {
      remainingKg: STARTING_FUEL_KG,
      capacityKg: 110,
      flowRateKgH: 0,
      avgPerLapKg: 1.72,
      targetPerLapKg: 1.72,
      lapsRemaining: 57,
    },
    ers: {
      socPct: 68,
      mode: "balanced",
      powerKw: 0,
      harvestedMj: 0,
      deployedMj: 0,
      socHistory: [],
    },
    brakes: { temps: corners(320), padPct: 100, fade: false },
    weather: {
      airTempC: 28,
      trackTempC: 42,
      windKmh: 12,
      windDir: "NW",
      rainMmH: 0,
      condition: "dry",
    },
    strategy: {
      plan: "1-stop · Medium → Hard @ Lap 25",
      stintLap: 1,
      stintLength: 25,
      pitWindow: [23, 28],
      confidencePct: 82,
      deltaVsAltS: 0.4,
      // Nominal until the first lap is on the board; the real pre-race report
      // supplies these from the test lap (docs/website-dashboard.md, View 3).
      targetLapTimeS: TRACK_LENGTH_M / (168 / 3.6),
    },
    laps: [],
    alerts: [],
    agentMessages: [
      {
        id: "gemma-0",
        lap: 1,
        text: "Green flag. Build tyre temperature through S1 and settle into a rhythm — I will set your lap and fuel targets off the first flying lap.",
        createdAt: 0,
      },
    ],
  };

  return {
    telemetry,
    scratch: {
      clock: 0,
      seq: 0,
      sectorStart: 0,
      sectorTimes: [0, 0, 0],
      lapFuelStart: STARTING_FUEL_KG,
      lapHarvest: 0,
      lapDeploy: 0,
      lastRuleLap: {},
      nextAnomalyAt: 45,
      anomalyCount: 0,
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function corneringSpeedKmh(curvature: number): number {
  const k = Math.abs(curvature);
  if (k < 1e-4) return V_MAX_KMH;
  const vMs = Math.sqrt((MAX_LAT_G * G) / k);
  return clamp(vMs * 3.6, V_MIN_KMH, V_MAX_KMH);
}

function gearFor(speedKmh: number): number {
  let gear = 1;
  for (let i = 0; i < GEAR_THRESHOLDS.length; i++) {
    if (speedKmh >= GEAR_THRESHOLDS[i]) gear = i + 1;
  }
  return gear;
}

function rpmFor(speedKmh: number, gear: number): number {
  const lo = GEAR_THRESHOLDS[gear - 1];
  const hi = GEAR_THRESHOLDS[gear] ?? V_MAX_KMH + 20;
  const frac = clamp((speedKmh - lo) / Math.max(1, hi - lo), 0, 1);
  return Math.round(8200 + frac * 6600);
}

/**
 * Advance the simulation by `dt` seconds. Returns a fresh telemetry object
 * (new nested objects included) so store selectors see changed references.
 */
export function step(sim: SimState, dt: number): SimState {
  const t = sim.telemetry;
  const sc = { ...sim.scratch };
  sc.clock += dt;

  if (t.status !== "live") return sim;

  // ---- Driver model: target speed from curvature, plus corner-entry braking.
  const here = pointAt(t.trackPos);
  const vNow = t.speedKmh / 3.6;
  const vCorner = corneringSpeedKmh(here.curvature) / 3.6;
  const vAhead = corneringSpeedKmh(curvatureAhead(t.trackPos, LOOKAHEAD_M)) / 3.6;

  const braking = vNow > vAhead + 0.5;
  const headroom = clamp((vCorner - vNow) / Math.max(vCorner, 1), 0, 1);

  let accel: number;
  if (braking) {
    // Brake proportionally to how much speed has to come off before the corner.
    const overspeed = (vNow - vAhead) / Math.max(vNow, 1);
    accel = -MAX_DECEL * clamp(overspeed * 3.2, 0.15, 1);
  } else {
    // Power-limited at high speed: less acceleration available the faster you go.
    accel = MAX_ACCEL * headroom * (1 - 0.55 * (vNow / (V_MAX_KMH / 3.6)));
  }

  const vNext = clamp(vNow + accel * dt, V_MIN_KMH / 3.6, V_MAX_KMH / 3.6);
  const speedKmh = vNext * 3.6;
  const longitudinalG = ((vNext - vNow) / dt) / G;
  const lateralG = (vNext * vNext * here.curvature) / G;

  // Pedal position reflects driver *demand*, not achieved acceleration. Flat
  // out on a drag-limited straight is 100% throttle even though the car is
  // barely gaining speed; mid-corner is maintenance throttle.
  const throttlePct = braking ? 0 : clamp(35 + headroom * 250, 0, 100);
  const brakePct = clamp(longitudinalG < 0 ? -longitudinalG * 26 : 0, 0, 100);
  const steeringDeg =
    ((Math.atan(here.curvature * 3.6) * 180) / Math.PI) * STEERING_RATIO;

  // ---- Position, sectors, laps.
  const advanceM = ((vNow + vNext) / 2) * dt;
  let trackPos = t.trackPos + advanceM / TRACK_LENGTH_M;
  let lap = t.lap;
  const lapTimeS = t.lapTimeS + dt;
  let lastLapS = t.lastLapS;
  const laps = t.laps;
  let crossedLine = false;

  const prevSector = t.sector;
  if (trackPos >= 1) {
    trackPos -= 1;
    crossedLine = true;
  }
  const sector = sectorFor(trackPos);

  // ---- Fuel model (docs/tech-stack.md).
  const windFactor = 1 + t.weather.windKmh / 200;
  const rainFactor = t.weather.rainMmH > 0 ? 1.15 : 1;
  const tyreFactor = COMPOUND_FUEL[t.tyres.compound];
  const flowRateKgH = Math.min(
    100,
    (2.0 +
      0.0008 * speedKmh * speedKmh +
      Math.max(0, longitudinalG) * 25 +
      Math.abs(lateralG) * 5) *
      windFactor *
      rainFactor *
      tyreFactor,
  );
  const remainingKg = Math.max(0, t.fuel.remainingKg - (flowRateKgH * dt) / 3600);

  // ---- Tyre wear + grip.
  const thermal = 1 + (t.weather.trackTempC - 40) * 0.012;
  // Scaled so a medium runs to roughly 55% over a 30-lap stint at this track.
  const wearRate =
    (0.0058 + Math.abs(lateralG) * 0.0075 + (speedKmh / V_MAX_KMH) * 0.0032) *
    COMPOUND_WEAR[t.tyres.compound] *
    thermal;
  const wearPct = clamp(t.tyres.wearPct + wearRate * dt, 0, 100);
  // Grip falls off gently, then falls off a cliff past 62% wear.
  const cliff = wearPct > 62 ? (wearPct - 62) * 0.006 : 0;
  const gripLevel = clamp(1 - wearPct * 0.0013 - cliff, 0.55, 1);

  // ---- Tyre temperatures, per corner. Lateral load heats the outside pair,
  // braking heats the fronts.
  const tyreTemps = mapCorners(t.tyres.temps, (temp, corner) => {
    const outside =
      (lateralG > 0 && (corner === "fr" || corner === "rr")) ||
      (lateralG < 0 && (corner === "fl" || corner === "rl"));
    const front = corner === "fl" || corner === "fr";
    const load = Math.abs(lateralG) * (outside ? 1.35 : 0.6) * (front ? 1.08 : 0.94);
    // Target the 85-105C working window the pre-race report calls for.
    const heatIn = 7 + load * 5.5 + (brakePct / 100) * (front ? 8 : 3.5);
    const cooling = (temp - t.weather.airTempC) * (0.05 + speedKmh * 0.00095);
    // TYRE_INERTIA damps the response: bulk rubber temperature does not swing
    // 40C between one corner and the next.
    return clamp(temp + (heatIn - cooling) * dt * TYRE_INERTIA, 55, 145);
  });
  const tyrePressures = mapCorners(t.tyres.pressures, (psi, corner) => {
    const base = corner === "fl" || corner === "fr" ? 21.0 : 19.5;
    // Pressure tracks temperature — roughly +0.035 psi per degree over 90C.
    return base + (tyreTemps[corner] - 90) * 0.035;
  });

  // ---- Brake temperatures.
  const brakeTemps = mapCorners(t.brakes.temps, (temp, corner) => {
    const front = corner === "fl" || corner === "fr";
    const bias = front ? 1.34 : 0.72;
    const heatIn = (brakePct / 100) * speedKmh * 2.2 * bias;
    // Discs shed heat fast on the straights but hold a working temperature.
    // Balanced so they swing through roughly 350-750C: hot enough to be worth
    // watching, short of the 1000C fade threshold under normal running.
    const cooling = (temp - t.weather.airTempC) * (0.02 + speedKmh * 0.00035);
    return clamp(temp + (heatIn - cooling) * dt, 200, 1150);
  });
  const brakeFade = Math.max(brakeTemps.fl, brakeTemps.fr) > 1000;

  // ---- ERS harvest / deploy.
  let socPct = t.ers.socPct;
  let powerKw = 0;
  let mode: Telemetry["ers"]["mode"] = "balanced";
  if (brakePct > 4) {
    powerKw = Math.min(MGU_K_MAX_KW, (brakePct / 100) * speedKmh * 4.5);
    mode = "harvest";
  } else if (throttlePct < 45) {
    // Maintenance throttle through a corner still trickles charge back in.
    powerKw = 120;
    mode = "harvest";
  } else if (throttlePct > 62) {
    // Deploy scales with available charge, so the store settles into a band
    // instead of emptying on lap one and staying there.
    powerKw = -(throttlePct / 100) * DEPLOY_MAX_KW * (socPct / 100);
    mode = "deploy";
  }
  socPct = clamp(socPct + ((powerKw * dt) / 4000) * 100, 0, 100);
  if (powerKw > 0) sc.lapHarvest += (powerKw * dt) / 1000;
  if (powerKw < 0) sc.lapDeploy += (-powerKw * dt) / 1000;

  // ---- Weather drift: slow, deterministic wander around the seeded values.
  const weather = {
    ...t.weather,
    airTempC: 28 + Math.sin(sc.clock / 180) * 1.2,
    trackTempC: 42 + Math.sin(sc.clock / 150 + 1) * 2.4,
    windKmh: 12 + Math.sin(sc.clock / 95) * 4,
  };

  const gear = gearFor(speedKmh);

  const next: Telemetry = {
    ...t,
    trackPos,
    sector,
    speedKmh,
    gear,
    rpm: rpmFor(speedKmh, gear),
    throttlePct,
    brakePct,
    steeringDeg,
    lateralG,
    longitudinalG,
    lapTimeS,
    lastLapS,
    lap,
    tyres: {
      ...t.tyres,
      wearPct,
      gripLevel,
      temps: tyreTemps,
      pressures: tyrePressures,
    },
    fuel: {
      ...t.fuel,
      remainingKg,
      flowRateKgH,
      lapsRemaining: Math.floor(remainingKg / Math.max(0.1, t.fuel.avgPerLapKg)),
    },
    ers: { ...t.ers, socPct, powerKw, mode },
    brakes: {
      temps: brakeTemps,
      padPct: clamp(t.brakes.padPct - dt * 0.0012 * (brakePct / 100 + 0.1) * 100, 0, 100),
      fade: brakeFade,
    },
    weather,
    laps,
    alerts: t.alerts,
    agentMessages: t.agentMessages,
  };

  // Sector splits.
  if (sector !== prevSector || crossedLine) {
    const split = lapTimeS - sc.sectorStart;
    sc.sectorTimes[prevSector - 1] = split;
    sc.sectorStart = crossedLine ? 0 : lapTimeS;
  }

  if (crossedLine) {
    lastLapS = lapTimeS;
    const lapFuel = sc.lapFuelStart - remainingKg;
    const summary: LapSummary = {
      lap,
      s1: sc.sectorTimes[0],
      s2: sc.sectorTimes[1],
      s3: sc.sectorTimes[2],
      total: lastLapS,
      fuelKg: lapFuel,
      wearPct,
    };

    next.laps = [summary, ...laps].slice(0, 40);
    next.lastLapS = lastLapS;
    next.deltaToTargetS = lastLapS - t.strategy.targetLapTimeS;
    lap = Math.min(t.totalLaps, lap + 1);
    next.lap = lap;
    next.lapTimeS = 0;
    next.tyres = { ...next.tyres, ageLaps: t.tyres.ageLaps + 1 };
    next.fuel = {
      ...next.fuel,
      avgPerLapKg: laps.length
        ? (STARTING_FUEL_KG - remainingKg) / Math.max(1, lap - 1)
        : lapFuel || t.fuel.avgPerLapKg,
    };
    next.ers = {
      ...next.ers,
      harvestedMj: sc.lapHarvest,
      deployedMj: sc.lapDeploy,
      socHistory: [...t.ers.socHistory, socPct].slice(-12),
    };
    next.strategy = { ...t.strategy, stintLap: next.tyres.ageLaps };

    // Calibrate the lap-time and fuel targets off the first flying lap. Lap 1
    // includes the standing start, so it is not representative. Stands in for
    // the pre-race report's predictions.
    if (summary.lap === 2) {
      next.strategy = { ...next.strategy, targetLapTimeS: lastLapS * 0.995 };
      next.fuel = { ...next.fuel, targetPerLapKg: lapFuel };
      next.deltaToTargetS = lastLapS - next.strategy.targetLapTimeS;
    }

    sc.lapFuelStart = remainingKg;
    sc.lapHarvest = 0;
    sc.lapDeploy = 0;
    sc.sectorTimes = [0, 0, 0];

    evaluateLapRules(next, sc);
    maybeSpeak(next, sc);
    if (next.laps[0]) next.laps[0].alertTier = latestTierForLap(next, summary.lap);
    if (lap >= t.totalLaps) next.status = "finished";
  }

  evaluateInstantRules(next, sc);
  maybeAnomaly(next, sc);

  return { telemetry: next, scratch: sc };
}

type CornerKey = keyof Corners;

function mapCorners(c: Corners, fn: (v: number, k: CornerKey) => number): Corners {
  return { fl: fn(c.fl, "fl"), fr: fn(c.fr, "fr"), rl: fn(c.rl, "rl"), rr: fn(c.rr, "rr") };
}

function latestTierForLap(t: Telemetry, lap: number): AlertTier | undefined {
  return t.alerts.find((a) => a.lap === lap)?.tier;
}

function pushAlert(
  t: Telemetry,
  sc: SimScratch,
  a: Omit<Alert, "id" | "createdAt" | "lap">,
) {
  sc.seq += 1;
  t.alerts = [
    { ...a, id: `alert-${sc.seq}`, lap: t.lap, createdAt: sc.clock },
    ...t.alerts,
  ].slice(0, 60);
}

/** Fire at most once every `everyLaps` laps. */
function gated(sc: SimScratch, key: string, lap: number, everyLaps: number): boolean {
  const last = sc.lastRuleLap[key];
  if (last !== undefined && lap - last < everyLaps) return false;
  sc.lastRuleLap[key] = lap;
  return true;
}

/** Tier 2a preventative rules + 2b signal patterns evaluated once per lap. */
function evaluateLapRules(t: Telemetry, sc: SimScratch) {
  if (t.lap % 5 === 0 && gated(sc, "brake-check", t.lap, 4)) {
    pushAlert(t, sc, {
      tier: "2a",
      severity: "low",
      title: "Brake temp check",
      message: `Brakes ${Math.round(t.brakes.temps.fl)}° front, ${Math.round(t.brakes.temps.rl)}° rear. In window.`,
      status: "sent",
    });
  }

  const harvest = t.ers.harvestedMj;
  if (harvest > 0 && harvest < 5.0 && gated(sc, "ers-harvest", t.lap, 6)) {
    pushAlert(t, sc, {
      tier: "2b",
      severity: "medium",
      title: "ERS harvest decline",
      message: `Harvest ${harvest.toFixed(1)} MJ, below the 5.0 MJ floor. Brake later into the heavy zones.`,
      status: "sent",
    });
  }

  const lastLap = t.laps[0];
  if (
    lastLap &&
    lastLap.fuelKg > t.fuel.targetPerLapKg * 1.06 &&
    gated(sc, "fuel-over", t.lap, 5)
  ) {
    pushAlert(t, sc, {
      tier: "2b",
      severity: "medium",
      title: "Fuel overconsumption",
      message: `${lastLap.fuelKg.toFixed(2)} kg last lap against a ${t.fuel.targetPerLapKg.toFixed(2)} kg target. Lift and coast into T7.`,
      status: "sent",
    });
  }
}

/** Rules that can fire at any moment during the lap. */
function evaluateInstantRules(t: Telemetry, sc: SimScratch) {
  if (t.tyres.wearPct > 55 && gated(sc, "tyre-cliff", t.lap, 8)) {
    pushAlert(t, sc, {
      tier: "2a",
      severity: "high",
      title: "Tyre cliff warning",
      message: `Tyre wear ${t.tyres.wearPct.toFixed(0)}%. Prepare to pit within three laps.`,
      status: "sent",
    });
  }

  if (t.fuel.lapsRemaining < 3 && gated(sc, "fuel-crit", t.lap, 3)) {
    pushAlert(t, sc, {
      tier: "2a",
      severity: "critical",
      title: "Fuel critical",
      message: `${t.fuel.remainingKg.toFixed(1)} kg remaining, under three laps. Fuel save mode now.`,
      status: "sent",
    });
  }

  if (t.ers.socPct < 10 && gated(sc, "ers-low", t.lap, 4)) {
    pushAlert(t, sc, {
      tier: "2a",
      severity: "medium",
      title: "ERS depleted",
      message: `Battery ${t.ers.socPct.toFixed(0)}%. Harvest through S2, hold deploy for the main straight.`,
      status: "sent",
    });
  }

  const asymmetry = Math.abs(t.tyres.temps.fl - t.tyres.temps.fr);
  if (asymmetry > 15 && gated(sc, "tyre-asym", t.lap, 6)) {
    pushAlert(t, sc, {
      tier: "2b",
      severity: "medium",
      title: "Tyre asymmetry",
      message: `Front axle split ${asymmetry.toFixed(0)}°C. Left front working harder than the right.`,
      status: "sent",
    });
  }
}

const ANOMALY_TEMPLATES = [
  {
    title: "Brake caliper drift",
    channels: [
      { name: "brake_temp_fl", sigma: 3.1 },
      { name: "tyre_temp_fl", sigma: 1.8 },
    ],
    sigma: 3.1,
    severity: "high" as Severity,
    message:
      "Left front brake caliper may be sticking. Generating excess heat that is transferring into the tyre.",
    recommendation:
      "Reduce braking T1 and T4. Rear bias up two clicks. Monitor two laps, box if no improvement.",
  },
  {
    title: "ERS state of charge decay",
    channels: [{ name: "ers_soc_pct", sigma: 2.6 }],
    sigma: 2.6,
    severity: "medium" as Severity,
    message:
      "State of charge is declining faster than the deployment model predicts across the last four laps.",
    recommendation:
      "Switch to balanced deploy through S2 and rebuild charge before the pit window.",
  },
  {
    title: "Rear axle temperature divergence",
    channels: [
      { name: "tyre_temp_rl", sigma: 2.9 },
      { name: "tyre_temp_rr", sigma: 2.2 },
    ],
    sigma: 2.9,
    severity: "high" as Severity,
    message:
      "Rear axle running hotter than the traction model expects for this fuel load and track temp.",
    recommendation:
      "Short shift out of T6 and T9. Protect the rears for the next three laps.",
  },
  {
    title: "Fuel flow instability",
    channels: [{ name: "fuel_flow_kgh", sigma: 2.4 }],
    sigma: 2.4,
    severity: "medium" as Severity,
    message:
      "Fuel flow rate oscillating outside the normal band on throttle application.",
    recommendation: "Smoother throttle pickup out of the slow corners.",
  },
];

/** Tier 2c: TimesFM-style anomaly, queued for engineer approval. */
function maybeAnomaly(t: Telemetry, sc: SimScratch) {
  if (sc.clock < sc.nextAnomalyAt) return;
  sc.nextAnomalyAt = sc.clock + 95 + (sc.anomalyCount % 4) * 18;
  const tpl = ANOMALY_TEMPLATES[sc.anomalyCount % ANOMALY_TEMPLATES.length];
  sc.anomalyCount += 1;
  pushAlert(t, sc, {
    tier: "2c",
    severity: tpl.severity,
    title: tpl.title,
    message: tpl.message,
    recommendation: tpl.recommendation,
    channels: tpl.channels,
    sigma: tpl.sigma,
    status: "pending",
  });
}

const GEMMA_LINES = [
  "Tyre wear tracking to plan. Extend to lap 27 — fuel and tyres both support it.",
  "Pace is stable within a tenth. Push S1, protect the rears through S2.",
  "Fuel margin holding at plus two kilos. No lift and coast needed yet.",
  "Track temp climbing. Expect degradation to steepen over the next five laps.",
  "Pit window confidence up to 86%. Hards are the right call at this track temp.",
  "Harvest is strong in S3. Keep the late braking into T9.",
];

function maybeSpeak(t: Telemetry, sc: SimScratch) {
  if (t.lap % 3 !== 0) return;
  sc.seq += 1;
  t.agentMessages = [
    {
      id: `gemma-${sc.seq}`,
      lap: t.lap,
      text: GEMMA_LINES[(t.lap / 3) % GEMMA_LINES.length | 0],
      createdAt: sc.clock,
    },
    ...t.agentMessages,
  ].slice(0, 20);
}
