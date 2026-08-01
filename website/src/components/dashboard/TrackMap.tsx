"use client";

import { TrackDiagram } from "@/components/dashboard/TrackDiagram";
import { useRaceStore, useSnapshot } from "@/lib/store";
import { getTrack } from "@/lib/track";

/**
 * The track panel on the pit wall: the circuit over its real streets, with
 * the car on it.
 *
 * Rendering lives in TrackDiagram, shared with the Replays browser so the
 * small live map and the large preview cannot drift.
 */
export function TrackMap() {
  const trackKey = useRaceStore((s) => s.trackKey);
  const trackPos = useSnapshot((t) => t.trackPos);
  const sector = useSnapshot((t) => t.sector);
  const track = getTrack(trackKey);

  return (
    <div className="flex h-full flex-col gap-2">
      <TrackDiagram track={track} carPos={trackPos} className="w-full flex-1" />

      <div className="flex items-center justify-between border-t border-pit-border pt-2 text-[11px]">
        <span className="truncate text-ink-secondary">{track.name}</span>
        <span className="tnum shrink-0 text-ink">
          {(track.lengthM / 1000).toFixed(3)} km · Sector {sector}
        </span>
      </div>
    </div>
  );
}
