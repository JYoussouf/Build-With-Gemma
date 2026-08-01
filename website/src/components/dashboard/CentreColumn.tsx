"use client";

import { Panel } from "@/components/ui/Panel";
import { TrackMap } from "./TrackMap";

/**
 * The centre of the pit wall: where the car is.
 *
 * The map used to be a 260 px box at the top of the parameter column, which
 * made the one genuinely spatial thing on screen the smallest. It now takes
 * the middle and the numbers gather to its left, so a glance answers "where is
 * the car" before "what are the numbers".
 */
export function CentreColumn() {
  return (
    <Panel title="Track & Car" className="h-full" bodyClassName="min-h-0">
      <TrackMap />
    </Panel>
  );
}
