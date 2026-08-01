"use client";

import { SatelliteMap } from "@/components/dashboard/SatelliteMap";
import { useRaceStore, useSnapshot } from "@/lib/store";
import { getTrack } from "@/lib/track";

/**
 * The track panel on the pit wall: Google Maps satellite view with the
 * circuit polyline and live car position marker.
 */
export function TrackMap() {
  const trackKey = useRaceStore((s) => s.trackKey);
  const trackPos = useSnapshot((t) => t.trackPos);
  const sector = useSnapshot((t) => t.sector);
  const track = getTrack(trackKey);

  return (
    <div className="flex h-full flex-col gap-2">
      <SatelliteMap
        track={track}
        trackKey={trackKey}
        carPos={trackPos}
        className="w-full flex-1"
      />

      <div className="flex items-center justify-between border-t border-pit-border pt-2 text-[11px]">
        <span className="truncate text-ink-secondary">{track.name}</span>
        <span className="tnum shrink-0 text-ink">
          {(track.lengthM / 1000).toFixed(3)} km · Sector {sector}
        </span>
      </div>
    </div>
  );
}
