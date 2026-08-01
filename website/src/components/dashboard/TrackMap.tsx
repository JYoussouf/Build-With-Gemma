"use client";

import { useRaceStore } from "@/lib/store";
import { pointAt, SECTOR_SPLITS, TRACK_META, TRACK_PATH_D } from "@/lib/track";

/**
 * 2D fallback for the Google Photorealistic 3D map described in
 * docs/website-dashboard.md. Renders the processed track trace and the live
 * car position; swapping in Map3DElement later only changes this component.
 */
export function TrackMap() {
  const trackPos = useRaceStore((s) => s.telemetry.trackPos);
  const sector = useRaceStore((s) => s.telemetry.sector);
  const car = pointAt(trackPos);
  const start = pointAt(0);

  return (
    <div className="flex h-full flex-col gap-2">
      <svg
        viewBox="0 0 1000 640"
        className="w-full flex-1"
        role="img"
        aria-label={`Track map, car in sector ${sector}`}
      >
        <path
          d={TRACK_PATH_D}
          fill="none"
          stroke="#2e2e2e"
          strokeWidth={26}
          strokeLinejoin="round"
        />
        <path
          d={TRACK_PATH_D}
          fill="none"
          stroke="#4a4a4a"
          strokeWidth={20}
          strokeLinejoin="round"
        />
        <path
          d={TRACK_PATH_D}
          fill="none"
          stroke="#141414"
          strokeWidth={14}
          strokeLinejoin="round"
        />

        {SECTOR_SPLITS.map((split, i) => {
          const p = pointAt(split);
          return (
            <g key={split}>
              <circle cx={p.x} cy={p.y} r={9} fill="#0a0a0a" stroke="#606060" strokeWidth={3} />
              <text
                x={p.x}
                y={p.y - 20}
                textAnchor="middle"
                className="tnum"
                fill="#a0a0a0"
                fontSize={22}
              >
                S{i + 2}
              </text>
            </g>
          );
        })}

        <g>
          <rect
            x={start.x - 4}
            y={start.y - 18}
            width={8}
            height={36}
            fill="#ffffff"
            transform={`rotate(20 ${start.x} ${start.y})`}
          />
          <text
            x={start.x}
            y={start.y - 26}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={22}
          >
            S/F
          </text>
        </g>

        <circle cx={car.x} cy={car.y} r={20} fill="rgba(0,200,83,0.16)" />
        <circle cx={car.x} cy={car.y} r={9} fill="var(--color-status-ok)" />
      </svg>

      <div className="flex items-center justify-between border-t border-pit-border pt-2 text-[11px]">
        <span className="text-ink-secondary">{TRACK_META.name}</span>
        <span className="tnum text-ink">Sector {sector}</span>
      </div>
    </div>
  );
}
