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
  | { kind: "replay"; runId: string }
  | { kind: "alerts"; runId: string };

export function ReplaysView() {
  const [view, setView] = useState<View>({ kind: "browse" });
  const browse = () => setView({ kind: "browse" });

  if (view.kind === "replay") {
    return <ReplayPlayer runId={view.runId} onExit={browse} />;
  }
  if (view.kind === "alerts") {
    return <AlertLog runId={view.runId} onExit={browse} />;
  }
  return (
    <PreviousRuns
      onReplay={(runId) => setView({ kind: "replay", runId })}
      onViewAlerts={(runId) => setView({ kind: "alerts", runId })}
    />
  );
}
