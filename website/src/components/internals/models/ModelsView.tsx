"use client";

import { useMemo, useState } from "react";

import { activityFor } from "@/lib/models/activity";
import {
  compileRules,
  decisionsFromAlerts,
  seededRules,
  wouldSuppress,
} from "@/lib/models/filter";
import { MODELS, ModelId } from "@/lib/models/registry";
import { useRaceConnection, useRaceStore } from "@/lib/store";

import { FilterPane } from "./FilterPane";
import { ModelDetail } from "./ModelDetail";
import { ModelList } from "./ModelList";

export type Selection = ModelId | "filter";

export function ModelsView() {
  // The bare connection rather than <RaceGate>: the parameters are the point of
  // this view and they read from config, so it must stay legible with no race
  // running. Only the activity strips need live data.
  useRaceConnection();
  const telemetry = useRaceStore((s) => s.telemetry);

  const [selected, setSelected] = useState<Selection>("tread");

  const alerts = telemetry?.alerts;

  const decisions = useMemo(
    () => decisionsFromAlerts(alerts ?? []),
    [alerts],
  );
  const rules = useMemo(
    () => [...compileRules(decisions), ...seededRules()],
    [decisions],
  );
  const suppressions = useMemo(
    () => wouldSuppress(alerts ?? [], rules),
    [alerts, rules],
  );

  const model = MODELS.find((m) => m.id === selected);

  return (
    <div className="flex min-h-0 flex-1">
      <ModelList
        selected={selected}
        onSelect={setSelected}
        telemetry={telemetry}
        activeRules={rules.filter((r) => r.status !== "proposed").length}
        proposedRules={rules.filter((r) => r.status === "proposed").length}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {model ? (
          <ModelDetail
            model={model}
            activity={activityFor(model.id, telemetry)}
            telemetry={telemetry}
          />
        ) : (
          <FilterPane
            decisions={decisions}
            rules={rules}
            suppressions={suppressions}
            connected={telemetry !== null}
          />
        )}
      </div>
    </div>
  );
}
