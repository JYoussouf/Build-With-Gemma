import alertRules from "@data/config/alert-rules.json";
import anomalyConfig from "@data/config/anomaly-detection.json";
import raceDefaults from "@data/config/race-defaults.json";

import { CHANNELS } from "@/lib/channels";
import { Telemetry } from "@/lib/types";

import { ModelId } from "./registry";

/**
 * One line per model establishing that it is running.
 *
 * A parameter table describes a model; it does not show one working. These are
 * the few numbers that do: how often it steps, what it is looking at, and what
 * it has produced so far this session.
 *
 * Read from what the store already holds. Nothing here instruments the
 * simulator, and there is no measurement the race server has to be asked for.
 */

export interface Activity {
  /** How often the model steps. */
  rate: string;
  /** What it is looking at right now. */
  scanning: string;
  /** What it has produced this session. */
  output: string;
}

const HZ = raceDefaults.telemetry_hz;

function selectedSigma(): number {
  const { selected, options } = anomalyConfig.sensitivity;
  return options.find((o) => o.key === selected)?.sigma ?? options[0].sigma;
}

/**
 * Null telemetry means no race is connected. Callers render an idle state
 * rather than zeros, which would read as a measurement of a running model.
 */
export function activityFor(id: ModelId, t: Telemetry | null): Activity | null {
  if (!t) return null;

  switch (id) {
    case "tread":
      return {
        rate: `${HZ} Hz`,
        scanning: "4 corners · wear, grip, temperature, pressure",
        output: `${t.tyres.wearPct.toFixed(1)}% worn · grip ${t.tyres.gripLevel.toFixed(2)} · ${t.tyres.ageLaps} laps on this set`,
      };

    case "fuel":
      return {
        rate: `${HZ} Hz`,
        scanning: "load, speed, weather",
        output: `${t.fuel.flowRateKgH.toFixed(1)} kg/h · ${t.fuel.remainingKg.toFixed(1)} kg left · ${t.fuel.lapsRemaining} laps`,
      };

    case "timesfm": {
      const raised = t.alerts.filter((a) => a.tier === "2c").length;
      const pending = t.alerts.filter(
        (a) => a.tier === "2c" && a.status === "pending",
      ).length;
      return {
        rate: `every ${anomalyConfig.check_interval_s} s`,
        scanning: `${CHANNELS.length} channels at ${selectedSigma().toFixed(1)}σ`,
        output: `${raised} candidate${raised === 1 ? "" : "s"} raised · ${pending} awaiting the engineer`,
      };
    }

    case "rules": {
      const fired = t.alerts.filter((a) => a.tier === "2a").length;
      const enabled = alertRules.rules.filter((r) => r.enabled).length;
      return {
        rate: "per lap",
        scanning: `${enabled} enabled rules`,
        output: `${fired} fire${fired === 1 ? "" : "s"} this session`,
      };
    }
  }
}

/** Per-rule fire counts, so the rules table shows which ones actually trip. */
export function ruleFireCounts(t: Telemetry | null): Map<string, number> {
  const counts = new Map<string, number>();
  if (!t) return counts;
  for (const rule of alertRules.rules) {
    counts.set(
      rule.id,
      t.alerts.filter((a) => a.tier === "2a" && a.title === rule.label).length,
    );
  }
  return counts;
}
