"use client";

import { useEffect, useMemo, useState } from "react";

import { ProducerHeading } from "@/components/dashboard/ProducerBadge";
import { StatusDot } from "@/components/ui/Readouts";
import { AlertTier } from "@/lib/types";

/**
 * The full alert log for one recorded run.
 *
 * Grouped by producer rather than by time, matching the live panel
 * (feedback round-01 F5) so the model's contribution reads the same way in
 * review as it did during the race. Read-only: these are a record of what
 * fired and what became of it, not a queue waiting on a decision.
 */

interface StoredAlert {
  id: string;
  tier: AlertTier;
  severity: string;
  lap: number;
  title: string;
  message: string;
  status: "pending" | "sent" | "dismissed";
  created_at: number;
  sigma?: number;
  recommendation?: string;
}

const GROUP_ORDER: AlertTier[] = ["2c", "2b", "2a"];

const OUTCOME: Record<StoredAlert["status"], string> = {
  sent: "reached driver",
  dismissed: "dismissed by engineer",
  pending: "never actioned",
};

export function AlertLog({
  trackKey,
  onExit,
}: {
  trackKey: string;
  onExit: () => void;
}) {
  const [alerts, setAlerts] = useState<StoredAlert[]>([]);
  const [name, setName] = useState(trackKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/runs/${trackKey}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "run not found");
        return r.json();
      })
      .then((body) => {
        setAlerts(body.alerts);
        setName(body.meta.track_name);
      })
      .catch((e: Error) => setError(e.message));
  }, [trackKey]);

  const grouped = useMemo(() => {
    const by: Record<AlertTier, StoredAlert[]> = { "2a": [], "2b": [], "2c": [] };
    for (const a of alerts) by[a.tier].push(a);
    return by;
  }, [alerts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="replay-hatch flex shrink-0 items-center gap-3 border-b border-dashed border-ink-muted px-4 py-2">
        <span aria-hidden className="size-2 shrink-0 bg-ink-secondary" />
        <span className="text-[11px] font-medium tracking-[0.18em] text-ink uppercase">
          Alert log
        </span>
        <span className="text-[11px] text-ink-secondary">{name}</span>
        <span className="tnum text-[11px] text-ink-muted">
          {alerts.length} alerts
        </span>
        <button
          onClick={onExit}
          className="ml-auto rounded border border-pit-border px-2 py-1 text-[11px] text-ink-secondary hover:text-ink"
        >
          ← Previous runs
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? (
          <p className="text-[12px] text-ink-muted">{error}</p>
        ) : (
          <div className="space-y-5">
            {GROUP_ORDER.map((tier) => {
              const group = grouped[tier];
              if (group.length === 0 && tier !== "2c") return null;
              return (
                <section key={tier}>
                  <header className="border-b border-pit-border pb-1.5">
                    <ProducerHeading tier={tier} />
                  </header>
                  {group.length === 0 ? (
                    <p className="pt-2 text-[11px] text-ink-muted">
                      Nothing flagged during this run.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {group.map((a) => (
                        <li
                          key={a.id}
                          className="rounded border border-pit-border bg-pit-panel/60 p-2.5"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <span className="tnum text-[11px] text-ink-muted">
                              Lap {a.lap}
                            </span>
                            <span className="flex-1 text-[13px] text-ink">
                              {a.title}
                            </span>
                            {a.sigma !== undefined && (
                              <span className="tnum text-[11px] text-ink-secondary">
                                {a.sigma.toFixed(1)}σ
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <StatusDot
                                level={
                                  a.status === "sent"
                                    ? "ok"
                                    : a.status === "pending"
                                      ? "warn"
                                      : "crit"
                                }
                              />
                              <span className="text-[10px] text-ink-secondary">
                                {OUTCOME[a.status]}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1.5 text-[12px] leading-snug text-ink-body">
                            {a.message}
                          </p>
                          {a.recommendation && (
                            <p className="mt-1.5 border-t border-pit-border pt-1.5 text-[12px] leading-snug text-ink-secondary">
                              <span className="text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                                To driver{" "}
                              </span>
                              {a.recommendation}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
