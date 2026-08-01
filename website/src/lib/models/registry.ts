import alertRules from "@data/config/alert-rules.json";
import anomalyConfig from "@data/config/anomaly-detection.json";
import compoundConfig from "@data/config/tyre-compounds.json";
import raceDefaults from "@data/config/race-defaults.json";
import vehicle from "@data/config/vehicle.json";

/**
 * The four models that decide what the driver and the engineer see, described
 * as data so one detail component renders all of them.
 *
 * Every parameter value here is read from `@data/config` or quoted from the
 * implementation with the line it lives on. Nothing is retyped by hand: a value
 * that could drift from the running model would make this view worse than no
 * view at all.
 */

export type ModelId = "tread" | "fuel" | "timesfm" | "rules";

export interface ModelInput {
  name: string;
  unit: string;
  note: string;
}

export interface ParameterRow {
  label: string;
  value: string;
  note?: string;
}

export interface ParameterGroup {
  title: string;
  /** Where these values come from, shown as the group's provenance. */
  source: string;
  rows: ParameterRow[];
}

export interface ModelDescriptor {
  id: ModelId;
  name: string;
  /** Shown under the name, e.g. "physics · 10 Hz". */
  kind: string;
  summary: string;
  implementation: string;
  inputs: ModelInput[];
  groups: ParameterGroup[];
}

const HZ = raceDefaults.telemetry_hz;
const compounds = compoundConfig.compounds;

/** `1.55` reads as a bare number; `×1.55` reads as the multiplier it is. */
const factor = (n: number) => `×${n.toFixed(2)}`;

const tread: ModelDescriptor = {
  id: "tread",
  name: "Tread Model",
  kind: `physics · ${HZ} Hz`,
  summary:
    "Degrades the tire every tick from how hard the car is being driven. Cornering load dominates, speed and track temperature scale it, and the compound multiplies it. Grip falls away gently with wear until the cliff, past which it drops fast — which is what turns a stint length into a strategy decision.",
  implementation: "website/src/lib/simulation.ts:479-490",
  inputs: [
    { name: "lateral_g", unit: "g", note: "Cornering load. The dominant term." },
    { name: "speed_kmh", unit: "km/h", note: "Scaled against the car's maximum." },
    { name: "compound", unit: "—", note: "Selects the wear and life factors." },
    { name: "track_temp_c", unit: "°C", note: "Thermal term, referenced to 40 °C." },
  ],
  groups: [
    {
      title: "Wear rate",
      source: "simulation.ts:481-485",
      rows: [
        { label: "Base rate", value: "0.0058 %/s", note: "Wear with the car standing still." },
        { label: "Lateral coefficient", value: "0.0075", note: "Per g of cornering load." },
        { label: "Speed coefficient", value: "0.0032", note: "At maximum speed." },
        {
          label: "Thermal coefficient",
          value: "0.012 /°C",
          note: "Referenced to 40 °C track temperature.",
        },
      ],
    },
    {
      title: "Grip",
      source: "simulation.ts:488-490 · tyre-compounds.json",
      rows: [
        { label: "Linear falloff", value: "0.0013 /%", note: "Grip lost per point of wear." },
        {
          label: "Cliff",
          value: `${compoundConfig.grip_cliff_wear_pct} % wear`,
          note: "Past here grip falls away roughly five times faster.",
        },
        { label: "Cliff slope", value: "0.006 /%", note: "Additional falloff beyond the cliff." },
        { label: "Grip floor", value: "0.55", note: "Worn out, not undriveable." },
      ],
    },
    {
      title: "Working window",
      source: "tyre-compounds.json",
      rows: [
        {
          label: "Optimal temperature",
          value: `${compoundConfig.optimal_temp_window_c[0]}–${compoundConfig.optimal_temp_window_c[1]} °C`,
        },
      ],
    },
    {
      title: "Compounds",
      source: "tyre-compounds.json",
      rows: compounds.map((c) => ({
        label: c.label,
        value: `${factor(c.wear_factor)} wear`,
        note: `${c.expected_life_laps} lap expected life`,
      })),
    },
  ],
};

const fuel: ModelDescriptor = {
  id: "fuel",
  name: "Fuel Consumption Model",
  kind: `physics · ${HZ} Hz`,
  summary:
    "Instantaneous burn from speed, load and weather, integrated down the tank. The same function sizes the fuel a race starts with and then burns it, so the car is never loaded by one model and drained by another.",
  implementation: "website/src/lib/simulation.ts:266-285",
  inputs: [
    { name: "speed_kmh", unit: "km/h", note: "Squared, as the drag term." },
    { name: "longitudinal_g", unit: "g", note: "Positive only. Braking burns nothing." },
    { name: "lateral_g", unit: "g", note: "Cornering load, absolute." },
    { name: "compound", unit: "—", note: "Selects the fuel factor." },
    { name: "wind_kmh", unit: "km/h", note: "Raises burn proportionally." },
    { name: "rain_mm_h", unit: "mm/h", note: "Any rain applies a flat penalty." },
  ],
  groups: [
    {
      title: "Flow terms",
      source: "simulation.ts:276-280",
      rows: [
        { label: "Idle", value: "2.0 kg/h", note: "Burn with the car standing still." },
        { label: "Drag", value: "0.0008 · v²", note: "The dominant term at speed." },
        { label: "Acceleration", value: "25 · long_g", note: "Positive g only." },
        { label: "Cornering", value: "5 · |lat_g|", note: "Load through the corner." },
      ],
    },
    {
      title: "Multipliers",
      source: "simulation.ts:272-274 · tyre-compounds.json",
      rows: [
        { label: "Wind", value: "1 + wind/200" },
        { label: "Rain", value: factor(1.15), note: "Flat, applied whenever rain is falling." },
        ...compounds.map((c) => ({
          label: c.label,
          value: factor(c.fuel_factor),
        })),
      ],
    },
    {
      title: "Tank",
      source: "vehicle.json",
      rows: [
        { label: "Capacity", value: `${vehicle.fuel.capacity_kg} kg` },
        {
          label: "Flow ceiling",
          value: `${vehicle.fuel.max_flow_kg_h} kg/h`,
          note: "Regulatory limit. The model clamps to it.",
        },
        {
          label: "Target per lap",
          value: `${raceDefaults.targets.fuel_per_lap_kg} kg`,
          note: "Nominal until the first flying lap recalibrates it.",
        },
      ],
    },
  ],
};

const sensitivity = anomalyConfig.sensitivity;

const timesfm: ModelDescriptor = {
  id: "timesfm",
  name: "TimesFM Search Model",
  kind: `TimesFM · statistical · every ${anomalyConfig.check_interval_s} s`,
  summary:
    "Forecasts each channel forward from its own recent history and flags the ones that come in wide of the forecast. It searches the whole channel space continuously, which is the point: it finds the deviation nobody thought to write a rule for. Gemma interprets what it flags, and an engineer decides before the driver hears anything.",
  implementation: "data/config/anomaly-detection.json · simulated in simulation.ts",
  inputs: [
    { name: "channel history", unit: "—", note: "Recent samples per channel." },
    { name: "sensitivity", unit: "σ", note: "How far off forecast counts as a deviation." },
  ],
  groups: [
    {
      title: "Sensitivity",
      source: "anomaly-detection.json",
      rows: sensitivity.options.map((o) => ({
        label: o.key.toUpperCase(),
        value: `${o.sigma.toFixed(1)} σ`,
        note: o.key === sensitivity.selected ? "Selected" : undefined,
      })),
    },
    {
      title: "Cadence",
      source: "anomaly-detection.json",
      rows: [
        { label: "Check interval", value: `${anomalyConfig.check_interval_s} s` },
        { label: "Tier", value: anomalyConfig.tier, note: "Engineer approval required." },
        { label: "Enabled", value: anomalyConfig.enabled ? "yes" : "no" },
      ],
    },
    {
      title: "Anomaly templates",
      source: "anomaly-detection.json",
      rows: anomalyConfig.templates.map((t) => ({
        label: t.title,
        value: `${t.sigma.toFixed(1)} σ · ${t.severity}`,
        note: t.channels.map((c) => c.name).join(", "),
      })),
    },
  ],
};

const rules: ModelDescriptor = {
  id: "rules",
  name: "Rules Model",
  kind: "rule engine · per lap",
  summary:
    "Preventative checks that need no interpretation and no approval. Where the TimesFM Search Model searches for the unknown, this covers the known: the handful of conditions that always matter, evaluated every lap and sent straight to the driver. A cooldown stops a rule firing every tick once its condition is true.",
  implementation: "data/config/alert-rules.json",
  inputs: [
    { name: "lap", unit: "—", note: "Drives the every-N-laps triggers." },
    {
      name: "telemetry channels",
      unit: "—",
      note: "The channels named by the threshold triggers.",
    },
  ],
  groups: [
    {
      title: "Coverage",
      source: "alert-rules.json",
      rows: [
        {
          label: "Rules",
          value: `${alertRules.rules.filter((r) => r.enabled).length} of ${alertRules.rules.length} enabled`,
        },
        { label: "Tier", value: alertRules.tier, note: "Straight to the driver HUD." },
      ],
    },
    {
      title: "Rules",
      source: "alert-rules.json",
      rows: alertRules.rules.map((r) => ({
        label: r.label,
        value: r.enabled
          ? describeTrigger(r.trigger)
          : `${describeTrigger(r.trigger)} · off`,
        note: `${r.severity} · ${r.cooldown_laps} lap cooldown`,
      })),
    },
  ],
};

function describeTrigger(trigger: {
  type: string;
  laps?: number;
  channel?: string;
  op?: string;
  value?: number;
}): string {
  if (trigger.type === "every_n_laps") return `every ${trigger.laps} laps`;
  return `${trigger.channel} ${trigger.op} ${trigger.value}`;
}

export const MODELS: ModelDescriptor[] = [tread, fuel, timesfm, rules];
