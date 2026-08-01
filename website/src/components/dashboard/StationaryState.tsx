"use client";

import gemmaConfig from "@data/config/gemma.json";
import { useRaceStore } from "@/lib/store";
import { StatusDot } from "@/components/ui/Readouts";

/** Q3: the version string comes from config, never a literal in a component. */
const MODEL = gemmaConfig.model;

/**
 * What the Live view shows before anyone has driven.
 *
 * This is the honest resting state rather than an error: a phone sitting on a
 * table streams nothing worth interpreting, so there is nothing for the models
 * to say. Previously the view opened onto a race already in progress, which
 * read as live telemetry when no vehicle existed.
 *
 * The demo button is labelled as a demo on purpose. It starts the simulator,
 * not a car, and the label should not let anyone mistake one for the other.
 */
export function StationaryState() {
  const startDriving = useRaceStore((s) => s.startDriving);

  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-md border border-pit-border bg-pit-panel/80 p-6">
        <div className="flex items-center gap-2">
          {/* Amber, not green: present and connected, but not producing. */}
          <StatusDot level="warn" />
          <h1 className="text-[13px] tracking-[0.16em] text-ink uppercase">
            Car is stationary
          </h1>
        </div>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-body">
          Insights will generate when the vehicle is running.
        </p>
        <div className="mt-3 flex items-center gap-2 border-t border-pit-border pt-3">
          <span className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
            Interpreter
          </span>
          {/* Name only. The card already says the car is stationary and that
              insights arrive once it moves, so an "idle" marker restated it,
              and the unverified caveat is noise on the opening screen. Both
              still appear where the model actually produces output. */}
          <span className="text-[10px] text-ink-secondary">
            {MODEL.display_name}
          </span>
        </div>

        <button
          onClick={startDriving}
          className="mt-5 w-full rounded border border-ink px-4 py-3 text-[12px] font-medium tracking-[0.16em] text-ink uppercase hover:bg-[#1c1c1c]"
        >
          Demo: start driving
        </button>
      </div>
    </main>
  );
}
