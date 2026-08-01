"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { StatusDot } from "@/components/ui/Readouts";
import { severityLevel } from "@/lib/format";
import { useRaceStore, useSnapshot } from "@/lib/store";
import { Alert, AlertTier } from "@/lib/types";
import {
  ProducerBadge,
  ProducerHeading,
  ThinkingLine,
} from "@/components/dashboard/ProducerBadge";

/** Beyond this, the queue is summarised so the rules below stay reachable. */
const MAX_VISIBLE_PENDING = 2;

/** Right-hand column. Sticky by construction — it never scrolls away. */
export function EngineerPanel() {
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <RecommendedPit />
      <PendingApprovals />
      <RulesPanel />
      <PatternsPanel />
      <AlertHistory />
    </div>
  );
}

function RecommendedPit() {
  const strategy = useSnapshot((f) => f.strategy);
  const lap = useSnapshot((f) => f.lap);
  const tyreWear = useSnapshot((f) => f.tyres.wearPct);
  const fuelRemaining = useSnapshot((f) => f.fuel.remainingKg);
  const compound = useSnapshot((f) => f.tyres.compound);
  const pit = useRaceStore((s) => s.pitStop);

  const [pitWindowStart, pitWindowEnd] = strategy.pitWindow;
  const pitLap = strategy.stintLap + strategy.stintLength;
  const inWindow = lap >= pitWindowStart && lap <= pitWindowEnd;
  const lapsToPit = Math.max(0, pitWindowStart - lap);

  const recommendation = (() => {
    if (tyreWear > 55) return { urgency: "critical", text: "Tyre wear critical — pit this lap", compound: "hard" as const };
    if (inWindow) return { urgency: "high", text: "In pit window — box when ready", compound: "hard" as const };
    if (lapsToPit <= 3) return { urgency: "medium", text: `Pit window opens in ${lapsToPit} lap${lapsToPit === 1 ? "" : "s"}`, compound: "hard" as const };
    return { urgency: "low", text: `Next pit: lap ${pitLap}`, compound: "hard" as const };
  })();

  const urgencyColor = {
    critical: "border-status-crit bg-[#2a0d0d]",
    high: "border-status-warn bg-[#2a1d0d]",
    medium: "border-pit-border bg-pit-panel-2",
    low: "border-pit-border bg-pit-panel-2",
  }[recommendation.urgency];

  const urgencyDot = {
    critical: "crit",
    high: "warn",
    medium: "warn",
    low: "ok",
  }[recommendation.urgency] as "crit" | "warn" | "ok";

  return (
    <Panel
      title="Recommended pit"
      className="shrink-0"
      action={
        <span className="tnum text-[11px] text-ink">
          Lap {lap} / window {pitWindowStart}-{pitWindowEnd}
        </span>
      }
    >
      <div className={`rounded border p-2.5 ${urgencyColor}`}>
        <div className="flex items-center gap-1.5">
          <StatusDot level={urgencyDot} />
          <span className="text-[11px] tracking-[0.12em] text-ink uppercase">
            {recommendation.urgency}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-ink">{recommendation.text}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-secondary">
          <span>Tyres: <span className="text-ink">{tyreWear.toFixed(1)}%</span> {compound}</span>
          <span>Fuel: <span className="text-ink">{fuelRemaining.toFixed(1)} kg</span></span>
          <span>Suggest: <span className="text-ink">{recommendation.compound}</span></span>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => pit(recommendation.compound)}
            className="rounded bg-status-crit px-3 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            Box now ({recommendation.compound})
          </button>
          <button
            onClick={() => pit("medium")}
            className="rounded border border-pit-border px-3 py-1 text-[11px] text-ink-secondary hover:bg-pit-panel"
          >
            Override (medium)
          </button>
        </div>
      </div>
    </Panel>
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
      title="Pending approval (2c)"
      className="shrink-0"
      action={
        <span className="tnum text-[11px] text-ink">
          {pending.length ? `${pending.length} waiting` : "clear"}
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
            .slice(0, MAX_VISIBLE_PENDING)
            .map((a) => (
              <AnomalyCard key={a.id} alert={a} />
            ))}
          {pending.length > MAX_VISIBLE_PENDING && (
            <p className="text-[11px] text-ink-secondary">
              {pending.length - MAX_VISIBLE_PENDING} more queued behind these.
            </p>
          )}
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

/**
 * Rule and pattern config is local state for this draft. It moves to the
 * `alert_rules` / `signal_patterns` tables once the backend exists.
 */
const DEFAULT_RULES = [
  { id: "brake-check", label: "Brake temp check", detail: "every 5 laps", severity: "Low", on: true },
  { id: "tyre-cliff", label: "Tyre cliff warning", detail: "wear > 55%", severity: "High", on: true },
  { id: "fuel-crit", label: "Fuel critical", detail: "< 3 laps fuel", severity: "High", on: true },
  { id: "ers-low", label: "ERS depleted", detail: "SOC < 10%", severity: "Medium", on: true },
  { id: "coolant", label: "Coolant overheat", detail: "> 120°C", severity: "High", on: true },
  { id: "stint", label: "Stint lap report", detail: "every 3 laps", severity: "Low", on: false },
];

const DEFAULT_PATTERNS = [
  { id: "oil-drift", label: "Oil temp drift", detail: "window 5 laps · slope 0.02", on: true },
  { id: "tyre-asym", label: "Tyre asymmetry", detail: "delta > 15°C", on: true },
  { id: "ers-harvest", label: "ERS harvest decline", detail: "min 5.0 MJ", on: true },
  { id: "fuel-over", label: "Fuel overconsumption", detail: null, on: true },
];

function RulesPanel() {
  const [rules, setRules] = useState(DEFAULT_RULES);
  return (
    <Panel
      title="Preventative rules (2a)"
      className="shrink-0"
      action={
        <button className="text-[11px] text-ink-secondary hover:text-ink">+ Add</button>
      }
    >
      <ul className="space-y-1">
        {rules.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={r.on}
                onChange={() =>
                  setRules((prev) =>
                    prev.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)),
                  )
                }
                className="size-3 accent-white"
              />
              <span
                className={`flex-1 text-[12px] ${r.on ? "text-ink-body" : "text-ink-muted"}`}
              >
                {r.label}
              </span>
              <span className="text-[10px] text-ink-muted">{r.detail}</span>
              <span className="w-12 text-right text-[10px] text-ink-secondary">
                {r.severity}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PatternsPanel() {
  const [patterns, setPatterns] = useState(DEFAULT_PATTERNS);
  // The fuel target is sized per circuit now, so it cannot be a literal here
  // without going stale the moment the track changes (feedback D1/D4).
  const fuelTarget = useSnapshot((f) => f.fuel.targetPerLapKg);
  const detailFor = (id: string, detail: string | null) =>
    id === "fuel-over" ? `target ${fuelTarget.toFixed(2)} kg/lap` : detail;
  return (
    <Panel title="Signal patterns (2b)" className="shrink-0">
      <ul className="space-y-1">
        {patterns.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={p.on}
                onChange={() =>
                  setPatterns((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, on: !x.on } : x)),
                  )
                }
                className="size-3 accent-white"
              />
              <span
                className={`flex-1 text-[12px] ${p.on ? "text-ink-body" : "text-ink-muted"}`}
              >
                {p.label}
              </span>
              <span className="text-[10px] text-ink-muted">
                {detailFor(p.id, p.detail)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const STATUS_LABEL = {
  pending: "PENDING",
  sent: "SENT → HUD",
  dismissed: "DISMISSED",
} as const;

/**
 * Alert history, grouped by what produced each item rather than by time
 * (feedback round-01 F5).
 *
 * Chronological order buried the model's contribution among rule firings —
 * a threshold crossing and a Gemma reading looked identical in the list.
 * Grouping by producer makes that difference the first thing read, which is
 * the point F4 and F5 are jointly making.
 *
 * The model group is listed first and kept visible even when empty, so its
 * absence reads as "nothing flagged yet" rather than the section not existing.
 */
const GROUP_ORDER: AlertTier[] = ["2c", "2b", "2a"];

function AlertHistory() {
  const alerts = useSnapshot((f) => f.alerts);

  const grouped = useMemo(() => {
    const by: Record<AlertTier, Alert[]> = { "2a": [], "2b": [], "2c": [] };
    for (const a of alerts) by[a.tier].push(a);
    return by;
  }, [alerts]);

  return (
    <Panel
      title="Alert history"
      className="min-h-[180px] flex-1"
      bodyClassName="overflow-y-auto"
      action={
        <span className="tnum text-[11px] text-ink-muted">
          {alerts.length} total
        </span>
      }
    >
      <div className="space-y-3">
        {GROUP_ORDER.map((tier) => {
          const group = grouped[tier];
          if (group.length === 0 && tier !== "2c") return null;
          return (
            <section key={tier}>
              <header className="border-b border-pit-border pb-1">
                <ProducerHeading tier={tier} />
              </header>
              {group.length === 0 ? (
                <p className="pt-1.5 text-[11px] text-ink-muted">
                  Nothing flagged yet.
                </p>
              ) : (
                <ul>
                  {group.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 border-b border-pit-border/40 py-1 last:border-0"
                    >
                      <span className="tnum w-8 shrink-0 text-[11px] text-ink-muted">
                        L{a.lap}
                      </span>
                      <span className="flex-1 truncate text-[12px] text-ink-body">
                        {a.interpreting ? "Interpreting…" : a.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <StatusDot
                          level={
                            a.status === "sent"
                              ? "ok"
                              : a.status === "pending"
                                ? "warn"
                                : "crit"
                          }
                        />
                        <span className="w-20 text-right text-[10px] text-ink-secondary">
                          {STATUS_LABEL[a.status]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
