"use client";

import { useEffect, useRef, useState } from "react";

import { CentreColumn } from "@/components/dashboard/CentreColumn";
import { EngineerPanel } from "@/components/dashboard/EngineerPanel";
import { LeftColumn } from "@/components/dashboard/LeftColumn";
import { TimingTower } from "@/components/dashboard/TimingTower";
import { loadRun, ReplayRate } from "@/lib/replay";
import { useRaceStore } from "@/lib/store";

/**
 * A recorded run, rendered through the live pit wall.
 *
 * These are the same components the Live view mounts, driven from the store's
 * replay mode rather than the socket. That is deliberate: a second set of
 * dashboard components for replay would drift from the live ones, and the
 * whole value of reviewing a run is that it looks like what you watched.
 *
 * The run is buffered whole before playback starts, so the scrubber can jump
 * anywhere in the race and playback always begins at the first frame.
 */

interface Props {
  trackKey: string;
  onExit: () => void;
}

const SPEEDS = [1, 4, 16, 60];

export function ReplayPlayer({ trackKey, onExit }: Props) {
  const [rate, setRate] = useState<ReplayRate>("1hz");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const enterReplay = useRaceStore((s) => s.enterReplay);
  const exitReplay = useRaceStore((s) => s.exitReplay);
  const seekReplay = useRaceStore((s) => s.seekReplay);
  const index = useRaceStore((s) => s.replayIndex);
  const frame = useRaceStore((s) => s.frame);
  const meta = useRaceStore((s) => s.meta);

  // Load, and leave replay mode on unmount so the store goes back to live.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setPlaying(false);

    loadRun(trackKey, rate)
      .then((run) => {
        if (cancelled) return;
        setTotal(run.frames.length);
        enterReplay(run);
        setState("ready");
        setPlaying(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [trackKey, rate, enterReplay]);

  useEffect(() => () => exitReplay(), [exitReplay]);

  // Advance in wall-clock time. Frame spacing comes from the file's own rate,
  // so 1x is real time whichever archive is loaded.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (state !== "ready" || !playing || total === 0) return;
    const frameMs = rate === "10hz" ? 100 : 1000;
    const idealMs = frameMs / speed;
    // Below ~20 ms the browser cannot paint one frame per tick, so tick
    // slower and step further rather than falling behind.
    const tickMs = Math.max(20, idealMs);
    const stride = Math.max(1, Math.round(tickMs / idealMs));

    const id = window.setInterval(() => {
      const next = indexRef.current + stride;
      if (next >= total - 1) {
        seekReplay(total - 1);
        setPlaying(false);
        return;
      }
      seekReplay(next);
    }, tickMs);
    return () => window.clearInterval(id);
  }, [state, playing, speed, rate, total, seekReplay]);

  if (state === "error") {
    return (
      <Shell onExit={onExit} title="Replay">
        <p className="p-6 text-[12px] text-ink-muted">{error}</p>
      </Shell>
    );
  }

  if (state === "loading" || !frame) {
    return (
      <Shell onExit={onExit} title="Replay">
        <p className="p-6 text-[12px] text-ink-muted">
          Buffering the run so the whole race can be scrubbed…
        </p>
      </Shell>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReplayBar
        title={meta?.trackName ?? trackKey}
        clock={frame.t}
        lap={frame.lap}
        totalLaps={meta?.totalLaps ?? 0}
        index={index}
        total={total}
        playing={playing}
        setPlaying={setPlaying}
        speed={speed}
        setSpeed={setSpeed}
        rate={rate}
        setRate={setRate}
        onSeek={seekReplay}
        onExit={onExit}
      />

      {/* The Live layout exactly. Only the source differs. */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,30fr)_minmax(0,40fr)_minmax(0,30fr)]">
        <LeftColumn />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
          <div className="min-h-0 overflow-hidden">
            <CentreColumn />
          </div>
          <div className="h-[190px] shrink-0 xl:h-[230px]">
            <TimingTower />
          </div>
        </div>
        <EngineerPanel />
      </main>
    </div>
  );
}

function Shell({
  children,
  onExit,
  title,
}: {
  children: React.ReactNode;
  onExit: () => void;
  title: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="replay-hatch flex shrink-0 items-center gap-3 border-b border-dashed border-ink-muted px-4 py-2">
        <span aria-hidden className="size-2 shrink-0 bg-ink-secondary" />
        <span className="text-[11px] font-medium tracking-[0.18em] text-ink uppercase">
          {title}
        </span>
        <button
          onClick={onExit}
          className="ml-auto rounded border border-pit-border px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
        >
          ← Previous runs
        </button>
      </header>
      {children}
    </div>
  );
}

function ReplayBar({
  title,
  clock,
  lap,
  totalLaps,
  index,
  total,
  playing,
  setPlaying,
  speed,
  setSpeed,
  rate,
  setRate,
  onSeek,
  onExit,
}: {
  title: string;
  clock: number;
  lap: number;
  totalLaps: number;
  index: number;
  total: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  rate: ReplayRate;
  setRate: (r: ReplayRate) => void;
  onSeek: (i: number) => void;
  onExit: () => void;
}) {
  return (
    // Hatched and dashed, so a recording is never mistaken for the live feed
    // even though the dashboard below it is identical.
    <header className="replay-hatch flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed border-ink-muted px-3 py-2">
      <span aria-hidden className="size-2 shrink-0 bg-ink-secondary" />
      <span className="text-[11px] font-medium tracking-[0.18em] text-ink uppercase">
        Replay
      </span>
      <span className="max-w-[220px] truncate text-[11px] text-ink-secondary">
        {title}
      </span>

      <button
        onClick={() => setPlaying(!playing)}
        className="w-[74px] rounded border border-ink px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink uppercase hover:bg-[#1c1c1c]"
      >
        {playing ? "Pause" : "Play"}
      </button>

      {/* Time within the recording, not wall time. */}
      <span className="tnum text-[12px] text-ink">{clockLabel(clock)}</span>
      <span className="tnum text-[11px] text-ink-secondary">
        Lap {lap} / {totalLaps}
      </span>

      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={index}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Scrub through the recording"
        className="h-1 min-w-[160px] flex-1 accent-white"
      />

      <div className="flex items-center overflow-hidden rounded border border-pit-border">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`tnum px-2 py-1 text-[11px] ${
              speed === s ? "bg-[#252525] text-ink" : "text-ink-secondary hover:text-ink"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <select
        value={rate}
        onChange={(e) => setRate(e.target.value as ReplayRate)}
        title="1 Hz covers the whole race; 10 Hz is smoother but only the opening laps"
        className="rounded border border-pit-border bg-pit-panel px-1.5 py-1 text-[11px] text-ink outline-none hover:border-ink focus:border-ink"
      >
        <option value="1hz">1 Hz · whole race</option>
        <option value="10hz">10 Hz · first laps</option>
      </select>

      <button
        onClick={onExit}
        className="rounded border border-pit-border px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
      >
        ← Previous runs
      </button>
    </header>
  );
}

function clockLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
