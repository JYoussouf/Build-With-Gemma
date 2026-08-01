"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Channel } from "@/lib/channels";
import { TelemetryFrame } from "@/lib/frame";
import { formatValue, plotSeries } from "@/lib/explore/series";

interface ChannelChartProps {
  frames: TelemetryFrame[];
  series: { channel: Channel; colour: string }[];
  /** Index into `frames`, or null to follow the newest frame. */
  cursor: number | null;
  onCursor: (index: number | null) => void;
}

/** Horizontal gridlines, as fractions of the plot height. */
const GRID = [0, 0.25, 0.5, 0.75, 1];

export function ChannelChart({
  frames,
  series,
  cursor,
  onCursor,
}: ChannelChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measured rather than scaled with a viewBox: a non-uniform viewBox would
  // stretch strokes and text with the container.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;

  const plotted = useMemo(
    () =>
      width > 0 && height > 0
        ? series.map((s) =>
            plotSeries(frames, s.channel, s.colour, width, height, cursor),
          )
        : [],
    [frames, series, width, height, cursor],
  );

  const indexFromEvent = useCallback(
    (clientX: number) => {
      const el = container.current;
      if (!el || frames.length === 0) return null;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const index = Math.round(ratio * (frames.length - 1));
      return Math.max(0, Math.min(frames.length - 1, index));
    },
    [frames.length],
  );

  const cursorIndex = cursor ?? frames.length - 1;
  const cursorX =
    frames.length > 1 ? (cursorIndex / (frames.length - 1)) * width : width;
  const cursorFrame = frames[cursorIndex];

  const first = frames[0];
  const last = frames[frames.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        className="relative min-h-0 flex-1 cursor-crosshair"
        onMouseMove={(e) => onCursor(indexFromEvent(e.clientX))}
        onMouseLeave={() => onCursor(null)}
      >
        <svg
          width={width}
          height={height}
          className="absolute inset-0 block"
          aria-label="Selected telemetry channels over time"
        >
          {GRID.map((g) => (
            <line
              key={g}
              x1={0}
              x2={width}
              y1={g * height}
              y2={g * height}
              stroke="var(--color-pit-border)"
              strokeWidth={1}
              strokeDasharray={g === 0 || g === 1 ? undefined : "2 4"}
            />
          ))}

          {plotted.map((s) => (
            <polyline
              key={s.channel.id}
              points={s.points}
              fill="none"
              stroke={s.colour}
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {frames.length > 0 && (
            <>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={0}
                y2={height}
                stroke="var(--color-ink-secondary)"
                strokeWidth={1}
              />
              {plotted.map((s) => {
                const span = s.domain[1] - s.domain[0] || 1;
                const value = s.current;
                if (value === null) return null;
                const y = height - ((value - s.domain[0]) / span) * height;
                return (
                  <circle
                    key={s.channel.id}
                    cx={cursorX}
                    cy={y}
                    r={3}
                    fill="var(--color-pit-black)"
                    stroke={s.colour}
                    strokeWidth={1.5}
                  />
                );
              })}
            </>
          )}
        </svg>

        {series.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-muted">
            Select a channel to plot it.
          </div>
        )}
        {series.length > 0 && frames.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-ink-muted">
            Waiting for frames.
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-baseline justify-between border-t border-pit-border px-1 pt-1.5">
        <span className="tnum text-[10px] text-ink-muted">
          {first ? `t+${first.t.toFixed(1)}s` : ""}
        </span>
        <span className="tnum text-[10px] text-ink-secondary">
          {cursorFrame
            ? `t+${cursorFrame.t.toFixed(1)}s · lap ${cursorFrame.lap} · S${cursorFrame.sector}`
            : ""}
        </span>
        <span className="tnum text-[10px] text-ink-muted">
          {last ? `t+${last.t.toFixed(1)}s` : ""}
        </span>
      </div>

      {plotted.length > 0 && (
        <ul className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-1 pt-2">
          {plotted.map((s) => (
            <li key={s.channel.id} className="flex items-baseline gap-1.5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
                style={{ backgroundColor: s.colour }}
              />
              <span className="text-[11px] text-ink-secondary">
                {s.channel.label}
              </span>
              <span className="tnum text-[12px] text-ink">
                {formatValue(s.channel, s.current)}
              </span>
              <span className="text-[10px] text-ink-muted">{s.channel.unit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
