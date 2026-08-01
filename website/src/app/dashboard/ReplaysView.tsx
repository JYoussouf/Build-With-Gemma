"use client";

import { useEffect, useState } from "react";

import { RunMeta, RunReview } from "@/components/dashboard/RunReview";

/**
 * Replays — reviewing recorded runs.
 *
 * This was the Pit Wall tab. Everything it showed was a simulated run being
 * presented as live, so it is named for what it actually contains, and the
 * genuinely live view moved to its own tab.
 *
 * Reuses the drawer's review components rather than reimplementing them, so
 * the full-page and in-race views of a recording cannot drift apart.
 */
export function ReplaysView() {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((body: { runs: RunMeta[] }) => {
        setRuns(body.runs);
        setSelected((cur) => cur ?? body.runs[0]?.track_key ?? null);
      })
      .catch(() => setError("Could not load recorded runs."));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="replay-hatch flex shrink-0 flex-wrap items-center gap-3 border-b border-dashed border-ink-muted px-4 py-2">
        {/* Square, not the round live status light: a different shape reads as
            a different kind of thing before the label is read. */}
        <span aria-hidden className="size-2 shrink-0 bg-ink-secondary" />
        <span className="text-[11px] font-medium tracking-[0.18em] text-ink uppercase">
          Replay
        </span>
        <span className="text-[11px] text-ink-muted">
          recorded archive · not live telemetry
        </span>

        <label className="ml-2 flex items-center gap-1.5">
          <span className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
            Run
          </span>
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded border border-pit-border bg-pit-panel px-1.5 py-1 text-[11px] text-ink outline-none hover:border-ink focus:border-ink"
          >
            {runs.map((r) => (
              <option key={r.track_key} value={r.track_key}>
                {r.track_name} · {r.total_laps} laps
              </option>
            ))}
          </select>
        </label>

        <span className="tnum ml-auto text-[11px] text-ink-muted">
          {runs.length} recorded ·{" "}
          {runs.reduce((n, r) => n + r.total_laps, 0)} laps
        </span>
      </header>

      {error ? (
        <p className="p-6 text-[12px] text-ink-muted">{error}</p>
      ) : selected ? (
        <RunReview trackKey={selected} />
      ) : (
        <p className="p-6 text-[12px] text-ink-muted">
          No recorded runs. Generate them with{" "}
          <code className="text-ink-secondary">npm run generate:data</code>.
        </p>
      )}
    </div>
  );
}
