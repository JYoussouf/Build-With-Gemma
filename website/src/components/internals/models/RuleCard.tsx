"use client";

import { useState } from "react";

import { FilterRule, SUPPORT_THRESHOLD } from "@/lib/models/filter";

/**
 * One learned rule, collapsed to its claim and expandable to everything behind
 * it: the predicate it compiled to and the individual engineer decisions that
 * justify it. A rule you cannot trace back to the decisions that produced it is
 * exactly the black box this layer is meant not to be.
 */

const STATUS_LABEL: Record<FilterRule["status"], string> = {
  active: "ACTIVE",
  proposed: "PROPOSED",
  seeded: "CARRIED IN",
};

const STATUS_CLASS: Record<FilterRule["status"], string> = {
  active: "border-status-ok/50 text-status-ok",
  proposed: "border-status-warn/50 text-status-warn",
  seeded: "border-pit-border text-ink-muted",
};

const DECISION_CLASS: Record<string, string> = {
  approved: "text-status-ok",
  modified: "text-status-warn",
  dismissed: "text-ink-muted",
};

export function RuleCard({
  rule,
  wouldSuppressCount,
}: {
  rule: FilterRule;
  wouldSuppressCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-pit-border bg-pit-panel/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-pit-panel-2"
      >
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 font-mono text-[10px] text-ink-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[12px] leading-snug text-ink-body">
            {rule.statement}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-muted">
            <span
              className={`rounded-sm border px-1 py-px tracking-[0.1em] ${STATUS_CLASS[rule.status]}`}
            >
              {STATUS_LABEL[rule.status]}
            </span>
            <span>
              {rule.status === "seeded"
                ? "no support this session"
                : `${rule.support.length} of ${SUPPORT_THRESHOLD} decisions`}
            </span>
            <span>confidence {rule.confidence.toFixed(2)}</span>
            <span>would have cut {wouldSuppressCount}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-pit-border px-3 py-2.5">
          <Field label="Predicate">
            <pre className="overflow-x-auto rounded border border-pit-border bg-pit-black/60 p-2 font-mono text-[11px] text-ink-body">
              {JSON.stringify(
                { predicate: rule.predicate, action: rule.action },
                null,
                2,
              )}
            </pre>
          </Field>

          <Field label="Evidence">
            {rule.status === "seeded" ? (
              <p className="text-[11px] leading-relaxed text-ink-secondary">
                {rule.note}
              </p>
            ) : (
              <ul className="divide-y divide-pit-border/60 rounded border border-pit-border">
                {rule.support.map((d) => (
                  <li
                    key={d.alertId}
                    className="flex flex-wrap items-baseline gap-x-3 px-2 py-1 text-[11px]"
                  >
                    <span className="font-mono text-ink-muted">lap {d.lap}</span>
                    <span
                      className={`font-mono tracking-[0.08em] ${DECISION_CLASS[d.kind]}`}
                    >
                      {d.kind.toUpperCase()}
                    </span>
                    <span className="text-ink-body">{d.title}</span>
                    {d.sigma !== null && (
                      <span className="font-mono text-ink-muted">
                        {d.sigma.toFixed(1)}σ
                      </span>
                    )}
                    <span className="font-mono text-ink-muted">{d.alertId}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1 text-[10px] tracking-[0.14em] text-ink-muted uppercase">
        {label}
      </h4>
      {children}
    </div>
  );
}
