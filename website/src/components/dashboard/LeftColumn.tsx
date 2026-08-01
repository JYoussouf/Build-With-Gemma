"use client";

import { Panel } from "@/components/ui/Panel";
import { Bar, LabeledBar, Metric, StatusDot } from "@/components/ui/Readouts";
import { COMPOUND_COLOR, COMPOUND_LABEL, levelFor, signed } from "@/lib/format";
import { useRaceStore, useSnapshot } from "@/lib/store";
import { Corners } from "@/lib/types";
import { ModelName } from "@/components/dashboard/ProducerBadge";

/**
 * The parameter column: every numeric readout, in one place.
 *
 * The map moved to the centre and took the hero slot, so the numbers gather
 * here rather than being split either side of it. Ordered by how often an
 * engineer looks at them during a lap: car inputs first, then the consumables
 * that drive strategy, then the conditions that change slowest.
 *
 * The column scrolls. Every panel keeps its natural height, because the
 * alternative — sharing the leftover space — crushed whichever panel was last
 * to nothing on a short viewport.
 */
export function LeftColumn() {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <SpeedAndInputs />
      <TyrePanel />
      <ErsPanel />
      <BrakePanel />
      <FuelPanel />
      <StrategyPanel />
      <WeatherPanel />
    </div>
  );
}

function TyrePanel() {
  const tyres = useSnapshot((f) => f.tyres);
  const wearLevel = levelFor(tyres.wearPct, 45, 62);

  return (
    <Panel
      title="Tires"
      className="shrink-0"
      action={
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: COMPOUND_COLOR[tyres.compound] }}
          />
          <span className="text-[11px] text-ink">{COMPOUND_LABEL[tyres.compound]}</span>
        </span>
      }
    >
      <CornerGrid temps={tyres.temps} pressures={tyres.pressures} />
      <div className="mt-3 space-y-2">
        <LabeledBar
          label="Wear"
          value={tyres.wearPct}
          display={`${tyres.wearPct.toFixed(1)}%`}
          level={wearLevel}
        />
        <Metric label="Grip level" value={tyres.gripLevel.toFixed(3)} />
        <Metric label="Age" value={tyres.ageLaps} unit="laps" />
      </div>
    </Panel>
  );
}

function CornerGrid({ temps, pressures }: { temps: Corners; pressures: Corners }) {
  const keys: (keyof Corners)[] = ["fl", "fr", "rl", "rr"];
  return (
    <div className="grid grid-cols-2 gap-2">
      {keys.map((k) => {
        const level = levelFor(temps[k], 108, 122);
        return (
          <div
            key={k}
            className="rounded border border-pit-border bg-pit-panel-2 px-2 py-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                {k}
              </span>
              <StatusDot level={level} />
            </div>
            <div className="tnum text-[15px] text-ink">{temps[k].toFixed(0)}°C</div>
            <div className="tnum text-[10px] text-ink-secondary">
              {pressures[k].toFixed(1)} psi
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Fuel is only interesting as a margin (feedback/round-01 D1, Q1). Refuelling
 * is banned, so the car has what it started with, and the single number that
 * matters is how many laps of fuel are left against how many laps are left to
 * run. Showing the surplus directly is what makes it read as a constraint —
 * against the tank's 110 kg capacity the bar sat near empty all race and said
 * nothing.
 */
function FuelPanel() {
  const fuel = useSnapshot((f) => f.fuel);
  const lap = useSnapshot((f) => f.lap);
  const totalLaps = useSnapshot((f) => f.totalLaps);

  const lapsToRun = Math.max(0, totalLaps - lap + 1);
  const surplus = fuel.lapsRemaining - lapsToRun;
  const level = surplus < 0 ? "crit" : surplus < 1 ? "warn" : "ok";

  return (
    <Panel title="Fuel" className="shrink-0">
      <Bar value={fuel.remainingKg} max={fuel.startKg} height={10} />
      <div className="tnum mt-1.5 text-[15px] text-ink">
        {fuel.remainingKg.toFixed(1)}
        <span className="text-[11px] text-ink-secondary">
          {" "}
          / {fuel.startKg.toFixed(1)} kg race load
        </span>
      </div>
      <div className="mt-2 space-y-0.5">
        <Metric
          label="Fuel laps vs laps left"
          value={`${fuel.lapsRemaining} / ${lapsToRun}`}
          level={level}
        />
        <Metric
          label="Margin"
          value={`${surplus >= 0 ? "+" : ""}${surplus}`}
          unit="laps"
          level={level}
        />
        <Metric label="Per lap" value={fuel.avgPerLapKg.toFixed(2)} unit="kg" />
        <Metric label="Flow" value={fuel.flowRateKgH.toFixed(1)} unit="kg/h" />
      </div>
    </Panel>
  );
}

function WeatherPanel() {
  const w = useSnapshot((f) => f.weather);
  return (
    <Panel title="Weather" className="shrink-0">
      <Metric label="Air" value={w.airTempC.toFixed(1)} unit="°C" />
      <Metric label="Track" value={w.trackTempC.toFixed(1)} unit="°C" />
      <Metric label="Wind" value={`${w.windKmh.toFixed(0)} ${w.windDir}`} unit="km/h" />
      <Metric label="Rain" value={w.rainMmH.toFixed(1)} unit="mm/h" />
      <Metric
        label="Condition"
        value={w.condition.toUpperCase()}
        level={w.condition === "dry" ? "ok" : "warn"}
      />
    </Panel>
  );
}

function SpeedAndInputs() {
  const t = useSnapshot((f) => f);

  return (
    <Panel title="Speed & Inputs" className="shrink-0">
      <div className="flex items-end justify-between">
        <div>
          <div className="tnum text-4xl leading-none text-ink">
            {t.speedKmh.toFixed(0)}
            <span className="ml-1 text-[12px] text-ink-secondary">km/h</span>
          </div>
          <div className="tnum mt-1 text-[11px] text-ink-secondary">
            {Math.round(t.rpm).toLocaleString("en-US")} rpm
          </div>
        </div>
        <div className="flex size-14 items-center justify-center rounded border border-pit-border bg-pit-panel-2">
          <span className="tnum text-3xl text-ink">{t.gear}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <LabeledBar
          label="Throttle"
          value={t.throttlePct}
          display={`${t.throttlePct.toFixed(0)}%`}
          color="#e0e0e0"
        />
        <LabeledBar
          label="Brake"
          value={t.brakePct}
          display={`${t.brakePct.toFixed(0)}%`}
          color="#8a8a8a"
        />
      </div>

      <div className="mt-3 space-y-2 border-t border-pit-border pt-3">
        <SteeringTrace deg={t.steeringDeg} />
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Lateral G" value={signed(t.lateralG, 2)} />
          <Metric label="Longitudinal G" value={signed(t.longitudinalG, 2)} />
        </div>
      </div>
    </Panel>
  );
}

/** Full lock on these circuits is about 55 degrees at the wheel. */
const STEERING_RANGE_DEG = 60;

function SteeringTrace({ deg }: { deg: number }) {
  const clamped = Math.max(-STEERING_RANGE_DEG, Math.min(STEERING_RANGE_DEG, deg));
  const pct = 50 + (clamped / STEERING_RANGE_DEG) * 50;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-secondary">Steering</span>
        <span className="tnum text-[12px] text-ink">{signed(deg, 1)}°</span>
      </div>
      <div className="relative mt-1 h-2 rounded-sm bg-[#1e1e1e]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#3a3a3a]" />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink transition-[left] duration-100 ease-linear"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ErsPanel() {
  const ers = useSnapshot((f) => f.ers);
  const socLevel = ers.socPct < 12 ? "crit" : ers.socPct < 30 ? "warn" : "ok";

  return (
    <Panel
      title="Energy (ERS)"
      className="shrink-0"
      action={
        <span className="text-[11px] tracking-[0.1em] text-ink uppercase">{ers.mode}</span>
      }
    >
      <LabeledBar
        label="Battery"
        value={ers.socPct}
        display={`${ers.socPct.toFixed(0)}%`}
        color="var(--color-data-ers)"
        level={socLevel}
      />
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <Metric label="Power" value={signed(ers.powerKw, 0)} unit="kW" />
        <Metric label="Harvested" value={ers.harvestedMj.toFixed(1)} unit="MJ" />
        <Metric label="Deployed" value={ers.deployedMj.toFixed(1)} unit="MJ" />
        <Metric label="Capacity" value="4.0" unit="MJ" />
      </div>
      <SocSparkline history={ers.socHistory} current={ers.socPct} />
    </Panel>
  );
}

function SocSparkline({ history, current }: { history: number[]; current: number }) {
  const series = [...history, current];
  if (series.length < 2) {
    return (
      <p className="mt-3 text-[11px] text-ink-muted">
        SOC history builds after the first completed lap.
      </p>
    );
  }
  const w = 240;
  const h = 44;
  // Autoscale with a little headroom — a settled SOC band would otherwise be
  // an indistinguishable flat line pinned to the bottom of a 0-100 axis.
  const lo = Math.max(0, Math.min(...series) - 4);
  const hi = Math.min(100, Math.max(...series) + 4);
  const span = Math.max(1, hi - lo);
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - lo) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="mt-3 border-t border-pit-border pt-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
          SOC by lap
        </span>
        <span className="tnum text-[10px] text-ink-muted">
          {lo.toFixed(0)}–{hi.toFixed(0)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-data-ers)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function BrakePanel() {
  const brakes = useSnapshot((f) => f.brakes);
  const keys: (keyof Corners)[] = ["fl", "fr", "rl", "rr"];

  return (
    <Panel title="Brakes" className="shrink-0">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {keys.map((k) => {
          const temp = brakes.temps[k];
          const level = levelFor(temp, 820, 1000);
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                  {k}
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot level={level} />
                  <span className="tnum text-[12px] text-ink">{temp.toFixed(0)}°C</span>
                </span>
              </div>
              <Bar value={temp} max={1150} color="#8a8a8a" height={6} />
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-pit-border pt-2">
        <Metric
          label="Fade"
          value={brakes.fade ? "YES" : "No"}
          level={brakes.fade ? "crit" : "ok"}
        />
        <Metric label="Pad life" value={`${brakes.padPct.toFixed(0)}%`} />
      </div>
    </Panel>
  );
}

function StrategyPanel() {
  const t = useSnapshot((f) => f);
  const pitStop = useRaceStore((s) => s.pitStop);
  const s = t.strategy;
  const inWindow = t.lap >= s.pitWindow[0] && t.lap <= s.pitWindow[1];

  return (
    <Panel
      title="Strategy"
      className="shrink-0"
      bodyClassName="flex min-h-0 flex-col overflow-y-auto"
    >
      <div className="text-[13px] text-ink">{s.plan}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <Metric label="Stint lap" value={`${t.tyres.ageLaps} of ${s.stintLength}`} />
        <Metric label="Confidence" value={`${s.confidencePct}%`} />
        <Metric
          label="Pit window"
          value={`Laps ${s.pitWindow[0]}-${s.pitWindow[1]}`}
          level={inWindow ? "warn" : "ok"}
        />
        <Metric label="Δ vs Hard" value={signed(s.deltaVsAltS, 1)} unit="s" />
      </div>

      <GemmaFeed />

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => pitStop("hard")}
          className="flex-1 rounded border border-ink px-3 py-2 text-[12px] font-medium tracking-[0.12em] text-ink uppercase hover:bg-[#1c1c1c]"
        >
          Box now
        </button>
        <button className="flex-1 rounded border border-pit-border px-3 py-2 text-[12px] tracking-[0.12em] text-ink-secondary uppercase hover:text-ink">
          Extend
        </button>
        <button className="flex-1 rounded border border-pit-border px-3 py-2 text-[12px] tracking-[0.12em] text-ink-secondary uppercase hover:text-ink">
          Override
        </button>
      </div>
    </Panel>
  );
}

function GemmaFeed() {
  const messages = useSnapshot((f) => f.agentMessages);
  return (
    <div className="mt-3 rounded border border-pit-border bg-pit-panel-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-pit-border px-2.5 py-1.5">
        <span className="text-[10px] tracking-[0.14em] text-ink-secondary uppercase">
          Gemma says
        </span>
        {/* Attribution on agent output, from config rather than a literal
            (feedback round-01 F4/Q3). */}
        <ModelName />
      </div>
      <ul className="max-h-40 space-y-2 overflow-y-auto px-2.5 py-2">
        {messages.map((m) => (
          <li key={m.id} className="text-[12px] leading-snug text-ink-body">
            <span className="tnum mr-2 text-[10px] text-ink-muted">L{m.lap}</span>
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
