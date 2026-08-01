"use client";

import { activityFor } from "@/lib/models/activity";
import { MODELS } from "@/lib/models/registry";
import { Telemetry } from "@/lib/types";

import { Selection } from "./ModelsView";

/**
 * The left rail. Four models, then the filter set apart from them, because it
 * is not a model — it is the layer that learns from what the engineer does to
 * their output.
 */

interface Props {
  selected: Selection;
  onSelect: (selection: Selection) => void;
  telemetry: Telemetry | null;
  activeRules: number;
  proposedRules: number;
}

export function ModelList({
  selected,
  onSelect,
  telemetry,
  activeRules,
  proposedRules,
}: Props) {
  return (
    <nav
      aria-label="Models"
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-pit-border"
    >
      {MODELS.map((model) => {
        const activity = activityFor(model.id, telemetry);
        return (
          <Row
            key={model.id}
            active={selected === model.id}
            onClick={() => onSelect(model.id)}
            name={model.name}
            kind={model.kind}
            running={activity !== null}
            status={activity ? activity.scanning : "idle · no race data"}
          />
        );
      })}

      <div className="mx-3 my-2 border-t border-pit-border" />

      <Row
        active={selected === "filter"}
        onClick={() => onSelect("filter")}
        name="Agent-In-The-Loop Filter"
        kind="feedback layer · shadow"
        running={activeRules > 0}
        status={
          proposedRules > 0
            ? `${activeRules} active · ${proposedRules} proposed`
            : `${activeRules} active rule${activeRules === 1 ? "" : "s"}`
        }
      />
    </nav>
  );
}

interface RowProps {
  active: boolean;
  onClick: () => void;
  name: string;
  kind: string;
  running: boolean;
  status: string;
}

function Row({ active, onClick, name, kind, running, status }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`border-l-2 px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-l-ink bg-pit-panel-2"
          : "border-l-transparent hover:bg-pit-panel/60"
      }`}
    >
      <span className="flex items-center gap-2">
        {/* Green means stepping, grey means nothing to step on. Colour carries
            meaning on the pit wall, so it is spent only where it does. */}
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${
            running ? "bg-status-ok" : "bg-ink-muted"
          }`}
        />
        <span
          className={`truncate text-[12px] ${active ? "text-ink" : "text-ink-secondary"}`}
        >
          {name}
        </span>
      </span>
      <span className="mt-1 block truncate pl-3.5 text-[10px] tracking-[0.08em] text-ink-muted uppercase">
        {kind}
      </span>
      <span className="mt-0.5 block truncate pl-3.5 text-[10px] text-ink-muted">
        {status}
      </span>
    </button>
  );
}
