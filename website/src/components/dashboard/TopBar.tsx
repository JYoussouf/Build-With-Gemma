"use client";

import Link from "next/link";
import { COMPOUND_LABEL, levelFor } from "@/lib/format";
import { useRaceStore } from "@/lib/store";
import { StatusDot } from "@/components/ui/Readouts";

const SPEEDS = [1, 4, 16];

export function TopBar() {
  const t = useRaceStore((s) => s.telemetry);
  const running = useRaceStore((s) => s.running);
  const multiplier = useRaceStore((s) => s.speedMultiplier);
  const toggleRunning = useRaceStore((s) => s.toggleRunning);
  const setSpeedMultiplier = useRaceStore((s) => s.setSpeedMultiplier);
  const reset = useRaceStore((s) => s.reset);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-pit-border bg-pit-panel/60 px-4 py-2">
      <Link href="/" className="text-[13px] font-semibold tracking-[0.22em] text-ink">
        RACEMIND
      </Link>

      <span className="flex items-center gap-2 text-[12px]">
        <StatusDot level={t.status === "live" ? "ok" : "warn"} />
        <span className="tracking-[0.14em] text-ink uppercase">{t.status}</span>
      </span>

      <Field label="Lap" value={`${t.lap} / ${t.totalLaps}`} />
      <Field label="Fuel" value={`${t.fuel.remainingKg.toFixed(1)} kg`} />
      <Field
        label="Tyres"
        value={`${t.tyres.wearPct.toFixed(0)}% ${COMPOUND_LABEL[t.tyres.compound]}`}
        level={levelFor(t.tyres.wearPct, 45, 62)}
      />
      <Field label="ERS" value={`${t.ers.socPct.toFixed(0)}%`} />
      <Field
        label="Weather"
        value={`${t.weather.airTempC.toFixed(0)}°C ${t.weather.condition}`}
      />

      <div className="ml-auto flex items-center gap-2">
        <nav className="flex items-center gap-1 text-[11px]">
          <NavLink href="/dashboard">Pit Wall</NavLink>
          <NavLink href="/hud">Driver HUD</NavLink>
        </nav>
        <div className="flex items-center overflow-hidden rounded border border-pit-border">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeedMultiplier(s)}
              className={`tnum px-2 py-1 text-[11px] ${
                multiplier === s
                  ? "bg-[#252525] text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
        <button
          onClick={toggleRunning}
          className="rounded border border-pit-border px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
        >
          {running ? "Pause" : "Resume"}
        </button>
        <button
          onClick={reset}
          className="rounded border border-pit-border px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
        >
          Reset
        </button>
      </div>
    </header>
  );
}

function Field({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level?: "ok" | "warn" | "crit";
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {level && <StatusDot level={level} />}
        <span className="tnum text-[13px] text-ink">{value}</span>
      </span>
    </span>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded border border-transparent px-2 py-1 text-ink-secondary hover:border-pit-border hover:text-ink"
    >
      {children}
    </Link>
  );
}
