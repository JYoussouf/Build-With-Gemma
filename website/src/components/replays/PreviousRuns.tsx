"use client";

import { useEffect, useState } from "react";

import trackIndex from "@data/tracks/index.json";
import { RunSummary } from "@/lib/replay";
import { TrackDiagram } from "@/components/dashboard/TrackDiagram";
import { getTrack } from "@/lib/track";
import { lapTime } from "@/lib/format";

/**
 * Previous Runs: the browser you land on when opening Replays.
 *
 * Organised by track first, because a run only means anything against the
 * circuit it was set on — a 31 s lap is quick on the Sprint and impossible on
 * the Grand. Selecting a track shows it large on the right, with its runs
 * listed underneath the track list.
 */

interface Props {
  onReplay: (trackKey: string) => void;
  onViewAlerts: (trackKey: string) => void;
}

export function PreviousRuns({ onReplay, onViewAlerts }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((body: { runs: RunSummary[] }) => {
        // The featured run leads and is selected on open. Named in
        // data/tracks/index.json rather than here, so which run headlines the
        // tab is a data decision rather than a component one.
        const featured = trackIndex.featured_run;
        const ordered = [...body.runs].sort(
          (a, b) =>
            Number(b.track_key === featured) - Number(a.track_key === featured),
        );
        setRuns(ordered);
        setSelected((cur) => cur ?? ordered[0]?.track_key ?? null);
        // The featured track opens expanded, so the tab lands on something
        // actionable rather than three collapsed rows.
        if (ordered[0]) setExpanded(new Set([ordered[0].track_key]));
      })
      .catch(() => setError("Could not load recorded runs."));
  }, []);

  const active = runs.find((r) => r.track_key === selected) ?? null;

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col overflow-y-auto">
        <header className="mb-3">
          <h1 className="text-[13px] tracking-[0.18em] text-ink uppercase">
            Previous runs
          </h1>
          <p className="mt-1 text-[11px] text-ink-secondary">
            {error ??
              `${runs.length} circuits · ${runs.reduce((n, r) => n + r.total_laps, 0)} laps recorded`}
          </p>
        </header>

        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.track_key}>
              <TrackCard
                run={run}
                active={run.track_key === selected}
                open={expanded.has(run.track_key)}
                onToggle={() => {
                  // Selecting for the preview and expanding are one gesture:
                  // opening a track is also how you ask to look at it.
                  setSelected(run.track_key);
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(run.track_key)) next.delete(run.track_key);
                    else next.add(run.track_key);
                    return next;
                  });
                }}
                onReplay={() => onReplay(run.track_key)}
                onViewAlerts={() => onViewAlerts(run.track_key)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0">
        {active ? (
          <TrackPreview run={active} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-pit-border">
            <p className="text-[12px] text-ink-muted">
              No recorded runs. Generate them with{" "}
              <code className="text-ink-secondary">npm run generate:data</code>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One circuit, expandable to the runs recorded on it.
 *
 * Collapsed it is a circuit with a run count; expanded it lists each run with
 * when it was recorded. Today every track has exactly one archive, but runs
 * accumulate per track rather than replacing each other, so the list is the
 * shape this has to be — a card that showed a single run inline would have to
 * be rebuilt the first time a track had two.
 */
function TrackCard({
  run,
  active,
  open,
  onToggle,
  onReplay,
  onViewAlerts,
}: {
  run: RunSummary;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onReplay: () => void;
  onViewAlerts: () => void;
}) {
  // One archive per track today. When the generator writes more, they land
  // here and the row list grows.
  const runsForTrack = [run];

  return (
    <div
      className={`overflow-hidden rounded-md border ${
        active ? "border-ink bg-pit-panel-2" : "border-pit-border bg-pit-panel/60"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-pit-panel-2/60"
      >
        <span
          aria-hidden
          className={`text-[10px] text-ink-muted transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">
            {run.track_name}
          </span>
          <span className="tnum mt-0.5 block text-[11px] text-ink-secondary">
            {(run.track_length_m / 1000).toFixed(2)} km · {run.total_laps} laps
          </span>
        </span>
        <span className="tnum shrink-0 text-[10px] tracking-[0.1em] text-ink-muted uppercase">
          {runsForTrack.length} run{runsForTrack.length === 1 ? "" : "s"}
        </span>
      </button>

      {open && (
        <ul className="border-t border-pit-border">
          {runsForTrack.map((r) => (
            <RunRow
              key={r.recorded_at}
              run={r}
              onReplay={onReplay}
              onViewAlerts={onViewAlerts}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** A single recorded run: when it happened, how it went, and what to do with it. */
function RunRow({
  run,
  onReplay,
  onViewAlerts,
}: {
  run: RunSummary;
  onReplay: () => void;
  onViewAlerts: () => void;
}) {
  const alerts = Object.values(run.alerts_by_tier).reduce((n, v) => n + v, 0);

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tnum text-[12px] text-ink">
          {formatStamp(run.recorded_at)}
        </span>
        <span className="tnum text-[10px] text-ink-muted">
          {Math.round(run.duration_s / 60)} min
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <Stat
          label="Fastest"
          value={run.fastest_lap_s ? lapTime(run.fastest_lap_s) : "—"}
        />
        <Stat label="Alerts" value={String(alerts)} />
        <Stat label="Wear" value={`${run.final_tyre_wear_pct.toFixed(0)}%`} />
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={onReplay}
          className="flex-1 rounded border border-ink px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink uppercase hover:bg-[#1c1c1c]"
        >
          Replay
        </button>
        <button
          onClick={onViewAlerts}
          className="flex-1 rounded border border-pit-border px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink-secondary uppercase hover:text-ink"
        >
          Alert log
        </button>
      </div>
    </li>
  );
}

/**
 * Run timestamps as an absolute date and time.
 *
 * Deliberately not "2 hours ago": these are archives compared against each
 * other, and a relative label makes two runs from the same afternoon hard to
 * tell apart and changes every time the page is opened.
 */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
        {label}
      </span>
      <span className="tnum text-[11px] text-ink">{value}</span>
    </span>
  );
}

/** The selected circuit, drawn large from its committed geometry. */
function TrackPreview({ run }: { run: RunSummary }) {
  const track = getTrack(run.track_key);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-pit-border bg-pit-panel/60">
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-pit-border px-4 py-2.5">
        <h2 className="text-[14px] text-ink">{track.name}</h2>
        <span className="tnum text-[11px] text-ink-secondary">
          {(track.lengthM / 1000).toFixed(3)} km · {track.numCorners} corners ·{" "}
          {run.total_laps} laps
        </span>
      </header>

      <div className="min-h-0 flex-1 p-4">
        <TrackDiagram track={track} className="h-full w-full" />
      </div>

      <footer className="flex shrink-0 flex-wrap gap-x-6 gap-y-1 border-t border-pit-border px-4 py-2.5">
        <Stat label="Roads" value={track.roads.join(", ") || "—"} />
        <Stat label="Fuel used" value={`${run.fuel_used_kg.toFixed(1)} kg`} />
        <Stat label="Final wear" value={`${run.final_tyre_wear_pct.toFixed(0)}%`} />
        <Stat
          label="Alerts"
          value={`${run.alerts_by_tier["2a"] ?? 0} · ${run.alerts_by_tier["2b"] ?? 0} · ${run.alerts_by_tier["2c"] ?? 0}`}
        />
      </footer>
    </div>
  );
}
