"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { StatusDot } from "@/components/ui/Readouts";
import { severityLevel } from "@/lib/format";
import { useRaceStore, useSnapshot } from "@/lib/store";
import { Alert } from "@/lib/types";
import {
  ProducerBadge,
  ThinkingLine,
} from "@/components/dashboard/ProducerBadge";

/** Right-hand column. Sticky by construction — it never scrolls away. */
export function EngineerPanel() {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <PendingApprovals />
    </div>
  );
}

function PendingApprovals() {
  const alerts = useSnapshot((f) => f.alerts);
  const pending = useMemo(
    () => alerts.filter((a) => a.tier === "2c" && a.status === "pending"),
    [alerts],
  );

  return (
    <Panel
      title="Alerts"
      className="min-h-0 flex-1"
      bodyClassName="overflow-y-auto"
      action={
        <span className="tnum text-[11px] text-ink">
          {pending.length ? `${pending.length} to review` : "clear"}
        </span>
      }
    >
      {pending.length === 0 ? (
        <p className="text-[12px] text-ink-muted">
          No anomalies awaiting a decision. TimesFM is checking every 10 seconds.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Oldest first — the queue is a work list, not a news feed. */}
          {pending
            .slice()
            .reverse()
            .map((a) => (
              <AnomalyCard key={a.id} alert={a} />
            ))}
        </div>
      )}
    </Panel>
  );
}

function AnomalyCard({ alert }: { alert: Alert }) {
  const approveAlert = useRaceStore((s) => s.approveAlert);
  const dismissAlert = useRaceStore((s) => s.dismissAlert);
  // A recording is a record of what was decided, not a queue to decide on.
  const replay = useRaceStore((s) => s.mode === "replay");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  // Until the engineer types, the draft tracks Gemma's recommendation, which
  // arrives a few seconds after the card does.
  const draft = edited ?? alert.recommendation ?? alert.message;
  const level = severityLevel(alert.severity);

  return (
    <article className="pending-pulse rounded border border-status-crit bg-pit-panel-2 p-2.5">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <StatusDot level={level} />
          <span className="text-[11px] tracking-[0.12em] text-ink uppercase">
            {alert.severity}
          </span>
        </span>
        <span className="tnum text-[11px] text-ink-secondary">
          Lap {alert.lap} · {alert.sigma?.toFixed(1)}σ
        </span>
      </header>

      <div className="mt-1.5">
        <ProducerBadge tier={alert.tier} />
      </div>

      <h3 className="mt-1.5 text-[13px] text-ink">{alert.title}</h3>

      <ul className="mt-1.5 space-y-0.5">
        {alert.channels?.map((c) => (
          <li key={c.name} className="tnum flex justify-between text-[11px] text-ink-secondary">
            <span>{c.name}</span>
            <span className="text-ink">+{c.sigma.toFixed(1)}σ</span>
          </li>
        ))}
      </ul>

      {alert.interpreting ? (
        <div className="mt-2 border-t border-pit-border pt-2">
          <ThinkingLine />
        </div>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-ink-body">
          <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
            Reading{" "}
          </span>
          {alert.message}
        </p>
      )}

      <div
        className={`mt-2 border-t border-pit-border pt-2 ${
          alert.interpreting ? "hidden" : ""
        }`}
      >
        <div className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
          To driver
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setEdited(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded border border-pit-border bg-pit-black p-1.5 text-[12px] text-ink outline-none focus:border-ink"
          />
        ) : (
          <p className="mt-1 text-[12px] leading-snug text-ink-body">{draft}</p>
        )}
      </div>

      {replay ? (
        <p className="mt-2 text-[10px] tracking-[0.1em] text-ink-muted uppercase">
          Recorded · {alert.status === "sent" ? "reached driver" : alert.status}
        </p>
      ) : (
      <div className={`mt-2 flex gap-1.5 ${alert.interpreting ? "hidden" : ""}`}>
        <button
          onClick={() => approveAlert(alert.id, draft)}
          className="flex-1 rounded border border-ink px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink uppercase hover:bg-[#1c1c1c]"
        >
          Approve
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex-1 rounded border border-pit-border px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink-secondary uppercase hover:text-ink"
        >
          {editing ? "Done" : "Modify"}
        </button>
        <button
          onClick={() => dismissAlert(alert.id)}
          className="flex-1 rounded border border-pit-border px-2 py-1.5 text-[11px] tracking-[0.1em] text-ink-secondary uppercase hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      )}
    </article>
  );
}
