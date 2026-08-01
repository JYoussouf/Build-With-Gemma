# Behind the Scenes: Models View

## Problem

RaceMind runs four models that decide what the driver and the engineer see: a tread model that degrades the tyres, a fuel consumption model that burns the tank down, a TimesFM anomaly detector that flags deviations for engineer approval, and a set of preventative rules that fire straight to the HUD.

Their parameters are spread across `data/config/*.json` and their equations are inlined in `website/src/lib/simulation.ts`.
Nothing in the product shows what these models take as input, what constants they run on, or whether they are behaving.

The internals section already anticipates this: `website/src/app/internals/layout.tsx` lists a Models tab marked "soon".
This spec fills it in.

## Scope

In scope:

- An `/internals/models` view: a model list on the left, a full detail pane for the selected model on the right.
- Per model: its inputs, its parameters read live from `data/config/`, a response curve where one is meaningful, and an SLO table pairing declared targets against observed measurements.
- A new `data/config/model-slos.json` holding the declared targets.
- Extracting the tread and fuel equations out of `simulation.ts` into a shared module so the plotted curve and the running simulation are the same code.

Out of scope:

- Editing any parameter. The Models view is read-only; editing belongs to the Config view.
- Any change to the race server. Observed metrics are computed client-side from data the store already holds.
- Wiring real TimesFM inference. It stays simulated, and the view says so.
- A test runner. `website/` has none today and this spec does not add one.

## Approach

### Route and shell

`website/src/app/internals/models/page.tsx` renders `<ModelsView />`.
The Models entry in the `TABS` array in `website/src/app/internals/layout.tsx` flips to `ready: true`.

The view is a two-pane split inside the existing non-scrolling internals shell.
The left rail lists the four models, each with a name, a one-line kind (`physics · 10 Hz`, `statistical · 0.1 Hz`, `rule engine · per lap`) and a health dot summarising its SLO state.
The right pane shows the selected model in full and scrolls on its own.
The page as a whole never scrolls, matching the discipline the Explore view established.

### Single source of truth for the equations

A plotted curve that duplicates the simulation's arithmetic will drift from it the first time someone tunes a constant.
To prevent that, the pure expressions move out of `simulation.ts` into `website/src/lib/models/equations.ts`:

```ts
export function tyreWearRate(
  latG: number,
  speedKmh: number,
  compound: Compound,
  trackTempC: number,
): number;

export function gripForWear(wearPct: number): number;

export function fuelFlowKgH(
  speedKmh: number,
  longG: number,
  latG: number,
  compound: Compound,
  windKmh: number,
  rainMmH: number,
): number;
```

These are lifted verbatim from `simulation.ts:327-354`, keeping the same constants and the same `@data/config` imports.
`simulation.ts` then calls them in place of the inlined arithmetic.
The Models view plots the same functions.
This is a behaviour-preserving refactor: the numbers the simulator produces do not change.

### Model registry

`website/src/lib/models/registry.ts` describes the four models as data, so the detail pane is one component rendered four ways rather than four bespoke components:

```ts
interface ModelDescriptor {
  id: "tread" | "fuel" | "timesfm" | "rules";
  name: string;
  kind: string;
  summary: string;
  source: string;
  inputs: { name: string; unit: string; note: string }[];
  parameterGroups: { title: string; rows: ParameterRow[] }[];
  curve?: CurveSpec;
}
```

Every parameter value is read from `@data/config/*` or from the constants in `equations.ts`.
No value is retyped into the registry by hand.
`source` names the file and line range the model is implemented in, so the view points at its own implementation.

### What each model shows

**Tread model.**
Inputs: lateral g, speed, compound, track temperature.
Parameters: base wear rate `0.0058 %/s`, lateral coefficient `0.0075`, speed coefficient `0.0032`, grip cliff `62 %`, grip floor `0.55`, thermal coefficient `0.012 per °C over 40 °C`, and the per-compound `wear_factor` and `expected_life_laps` table from `tyre-compounds.json`.
Curves: grip against wear, showing the gentle slope, the cliff and the floor; and wear rate against lateral g, one line per compound.

**Fuel consumption model.**
Inputs: speed, longitudinal g, lateral g, compound, wind, rain.
Parameters: idle term `2.0`, drag term `0.0008 · v²`, acceleration term `25 · long_g`, cornering term `5 · |lat_g|`, the `100 kg/h` flow ceiling from `vehicle.json`, the wind factor `1 + wind/200`, the rain factor `1.15`, and the per-compound `fuel_factor` table.
Curve: flow rate against speed for three load cases (coasting, steady, accelerating), with the flow ceiling drawn as a horizontal limit.

**TimesFM, displayed as "Optimization Explorer".**
Inputs: recent channel history, selected sensitivity.
Parameters: the three sensitivity levels (`low 3.5σ`, `normal 2.5σ`, `high 1.8σ`) with the selected one marked, `check_interval_s: 10`, the enabled flag, and the four anomaly templates with their channels and severities.
Curve: a normal distribution with the three sigma gates marked, annotated with the expected false-flag rate at each level.
The card states plainly that inference is simulated and that the interpretations are the canned templates in `anomaly-detection.json`.

**Rules model.**
Inputs: lap counter, telemetry channels named by the rule triggers.
Parameters: the six rules from `alert-rules.json` as a table - id, trigger type, channel, operator, threshold, `cooldown_laps`, severity, enabled - with a live fire count per rule.
No curve. A rule set has no response surface, and inventing one would misrepresent it.

### SLOs

`data/config/model-slos.json` declares the targets. Shape:

```json
{
  "description": "...",
  "models": {
    "tread": {
      "slos": [
        {
          "id": "temp-window-residency",
          "label": "Tyre temp in working window",
          "target": 60,
          "op": ">=",
          "unit": "%",
          "provenance": "measured",
          "note": "Share of frames with all four tyre temps inside optimal_temp_window_c."
        }
      ]
    }
  }
}
```

`website/src/lib/models/slo.ts` computes the observed value for each SLO id from data the store already holds - the frame stream, `telemetry.laps`, and `telemetry.alerts`.
It exports one pure function per model that takes telemetry and returns `Record<string, number | null>`, plus a rolling frame accumulator for the metrics that need history.

Each SLO row carries a `provenance` tag and the view renders it:

- `measured` - computed from the running race.
- `derived` - computed from configuration alone.
- `simulated` - no real model behind the number; rendered visually distinct so it can never be mistaken for a measurement.

The SLOs:

| Model | SLO | Target | Provenance |
| --- | --- | --- | --- |
| Tread | Tyre temp in working window | ≥ 60 % of frames | measured |
| Tread | Projected stint length vs compound expected life | ≤ 3 laps | measured |
| Tread | Wear monotonicity violations within a stint | 0 | measured |
| Tread | Model step rate | ≥ 9.5 Hz | measured |
| Fuel | Laps-remaining error vs rolling actual burn | ≤ 0.5 lap | measured |
| Fuel | Per-lap burn vs `targets.fuel_per_lap_kg` | ≤ 3 % | measured |
| Fuel | Flow-ceiling breaches | 0 | measured |
| Fuel | Fuel monotonicity violations | 0 | measured |
| TimesFM | Engineer approval rate (`sent` / (`sent` + `dismissed`)) | ≥ 70 % | measured |
| TimesFM | Flags per hour at selected sigma | 2 to 12 | measured |
| TimesFM | Check-interval adherence | within 20 % of 10 s | measured |
| TimesFM | Forecast MAE | ≤ 4 % | simulated |
| TimesFM | Inference latency p95 | ≤ 250 ms | simulated |
| Rules | Cooldown compliance | 100 % | measured |
| Rules | Duplicate-fire violations | 0 | measured |
| Rules | Rule coverage enabled | reported, no target | derived |

The engineer approval rate stands in for precision: an anomaly the engineer sends to the driver was worth raising, one they dismiss was not.
It is a proxy and the row says so in its note.

### Empty state

Observed columns need a running or replayed race.
Before one connects, they render an em-dash and the pane shows a single line explaining that observed values need race data, with a link to the Pit Wall.
They do not render zeros, which would read as measurements of a healthy model.

## Components

```
website/src/components/internals/models/
  ModelsView.tsx       two-pane shell, selection state
  ModelList.tsx        left rail, health dot per model
  ModelDetail.tsx      renders one ModelDescriptor
  ParameterTable.tsx   labelled value rows, grouped
  SloTable.tsx         target / observed / status, provenance styling
  ResponseCurve.tsx    plots a CurveSpec on an SVG axis
```

`ResponseCurve` is a small standalone SVG plot rather than a reuse of `ChannelChart`.
`ChannelChart` is built around time-series frames with a hover cursor and a windowing model; a static function plot shares none of that and forcing them together would complicate both.

## File changes

| File | Change |
| --- | --- |
| `data/config/model-slos.json` | new - declared SLO targets |
| `website/src/lib/models/equations.ts` | new - extracted from `simulation.ts` |
| `website/src/lib/models/registry.ts` | new - four model descriptors |
| `website/src/lib/models/slo.ts` | new - observed metrics from store data |
| `website/src/components/internals/models/*.tsx` | new - six components |
| `website/src/app/internals/models/page.tsx` | new - route |
| `website/src/lib/simulation.ts` | edit - call `equations.ts` |
| `website/src/app/internals/layout.tsx` | edit - Models tab `ready: true` |

## Verification

- `npm run lint` and `npm run typecheck` clean.
- `npm run dev:all`, open `/internals/models`, and confirm each model's parameters match its config file.
- Confirm observed SLO columns populate and move as the race runs, and read an em-dash before a race connects.
- Confirm the simulator's behaviour is unchanged after the equations extraction: wear and fuel traces in `/internals/explore` follow the same shape as before.
- Confirm the tread curve agrees with the sim: the grip value the curve gives for the current wear percentage matches the grip the live frame reports.
