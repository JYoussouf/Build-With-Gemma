"use client";

import { useState } from "react";

import { AlertLog } from "@/components/replays/AlertLog";
import { PreviousRuns } from "@/components/replays/PreviousRuns";
import { ReplayPlayer } from "@/components/replays/ReplayPlayer";

/**
 * Replays. Opens on Previous Runs; a run leads either into the pit wall
 * playing that recording, or into its alert log.
 *
 * State is local rather than routed because a replay holds a buffered run in
 * the store, and a URL that could be opened cold would have to reload it
 * anyway. Worth revisiting if runs need to be linkable.
 */
type View =
  | { kind: "browse" }
  | { kind: "replay"; trackKey: string }
  | { kind: "alerts"; trackKey: string };

export function ReplaysView() {
  const [view, setView] = useState<View>({ kind: "browse" });
  const browse = () => setView({ kind: "browse" });

  if (view.kind === "replay") {
    return <ReplayPlayer trackKey={view.trackKey} onExit={browse} />;
  }
  if (view.kind === "alerts") {
    return <AlertLog trackKey={view.trackKey} onExit={browse} />;
  }
  return (
    <PreviousRuns
      onReplay={(trackKey) => setView({ kind: "replay", trackKey })}
      onViewAlerts={(trackKey) => setView({ kind: "alerts", trackKey })}
    />
  );
}
