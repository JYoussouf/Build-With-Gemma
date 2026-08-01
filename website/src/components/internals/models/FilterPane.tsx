"use client";

import { useState } from "react";

import {
  Decision,
  FilterRule,
  renderPrompt,
  SuppressionPreview,
} from "@/lib/models/filter";

import { RuleCard } from "./RuleCard";

/**
 * The Agent-In-The-Loop filter.
 *
 * Four sections, in the order the loop runs: what the engineer decided, the
 * prompt those decisions feed, the rules that come back, and what those rules
 * would have cut. Each one is inspectable, because a filter that silently
 * decides what a race engineer never sees has to be answerable for it.
 *
 * Nothing here suppresses anything. This demonstrates the layer; the alert path
 * is untouched.
 */

interface Props {
  decisions: Decision[];
  rules: FilterRule[];
  suppressions: SuppressionPreview[];
  connected: boolean;
}

const DECISION_CLASS: Record<Decision["kind"], string> = {
  approved: "text-status-ok",
  modified: "text-status-warn",
  dismissed: "text-ink-muted",
};

const DECISION_LEARNED: Record<Decision["kind"], string> = {
  approved: "kept — protects this shape from suppression",
  modified: "kept — wording, not the finding",
  dismissed: "noise — counts toward a suppression rule",
};

export function FilterPane({
  decisions,
  rules,
  suppressions,
  connected,
}: Props) {
  return (
    <article className="flex flex-col gap-4 p-4">
      <header>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[15px] tracking-[0.06em] text-ink">
            Agent-In-The-Loop Filter
          </h1>
          <span className="text-[10px] tracking-[0.14em] text-ink-muted uppercase">
            feedback layer · shadow
          </span>
        </div>
        <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed text-ink-body">
          Every decision the engineer makes on an anomaly is feedback. Approving
          one says it was worth their attention; dismissing one says it was
          noise. Gemma condenses that history into suppression rules, which
          would act as a final unsupervised filter on what the Optimization
          Explorer raises — so the system gets quieter the more it is corrected,
          without anyone writing a rule by hand.
        </p>
      </header>

      <Pipeline />
      <Section
        n={1}
        title="Decisions"
      >
        {!connected ? (
          <Empty>Leave alert feedback to collect decisions.</Empty>
        ) : decisions.length === 0 ? (
          <Empty>
            No decisions yet. Approve or dismiss an anomaly on the Pit Wall and
            it appears here.
          </Empty>
        ) : (
          <ul className="divide-y divide-pit-border/60 rounded-md border border-pit-border bg-pit-panel/80">
            {decisions.map((d) => (
              <li
                key={d.alertId}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-[11px]"
              >
                <span className="font-mono text-ink-muted">lap {d.lap}</span>
                <span
                  className={`w-[74px] font-mono tracking-[0.08em] ${DECISION_CLASS[d.kind]}`}
                >
                  {d.kind.toUpperCase()}
                </span>
                <span className="text-ink-body">{d.title}</span>
                {d.sigma !== null && (
                  <span className="font-mono text-ink-muted">
                    {d.sigma.toFixed(1)}σ
                  </span>
                )}
                <span className="w-full pl-[6.5rem] text-[10px] text-ink-muted">
                  {DECISION_LEARNED[d.kind]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        n={2}
        title="The prompt"
      >
        <Prompt text={renderPrompt(decisions)} />
      </Section>
      <Section
        n={3}
        title="Derived rules"
      >
        {rules.length === 0 ? (
          <Empty>No rules yet. Dismissals are what produce them.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                wouldSuppressCount={
                  suppressions.filter((s) => s.rule.id === rule.id).length
                }
              />
            ))}
          </ul>
        )}
      </Section>
    </article>
  );
}

/** The loop, drawn once so the pane's four sections have somewhere to sit. */
function Pipeline() {
  const steps = [
    { label: "TimesFM Search Model", note: "searches the space" },
    { label: "Agent-In-The-Loop Filter", note: "learned suppression" },
    { label: "Engineer Panel", note: "approve · modify · dismiss" },
  ];

  return (
    <div className="rounded-md border border-pit-border bg-pit-panel-2 px-3 py-3">
      <div className="flex flex-wrap items-stretch gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="rounded border border-pit-border bg-pit-panel px-3 py-1.5">
              <div className="text-[11px] text-ink">{step.label}</div>
              <div className="text-[10px] text-ink-muted">{step.note}</div>
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden className="font-mono text-[12px] text-ink-muted">
                →
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-2 text-[10px] text-ink-muted">
        <span aria-hidden className="font-mono">
          ↺
        </span>
        every decision the engineer makes feeds back into the filter
      </p>
    </div>
  );
}

/** Long, and worth reading in full — so it collapses rather than truncating. */
function Prompt({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-pit-border bg-pit-black/60">
      <div className="flex items-center justify-between border-b border-pit-border px-3 py-1.5">
        <span className="font-mono text-[10px] text-ink-muted">
          agent-filter.json · prompt_template
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded px-2 py-0.5 text-[10px] tracking-[0.1em] text-ink-secondary uppercase transition-colors hover:bg-pit-panel hover:text-ink"
        >
          {open ? "Collapse" : "Expand"}
        </button>
      </div>
      <pre
        className={`overflow-x-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-body ${
          open ? "" : "max-h-40 overflow-y-hidden"
        }`}
      >
        {text}
      </pre>
      {!open && (
        <div className="border-t border-pit-border px-3 py-1 text-[10px] text-ink-muted">
          truncated
        </div>
      )}
    </div>
  );
}

function Section({
  n,
  title,
  blurb,
  children,
}: {
  n: number;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header>
        <h2 className="flex items-baseline gap-2 text-[12px] tracking-[0.1em] text-ink uppercase">
          <span className="font-mono text-[10px] text-ink-muted">{n}</span>
          {title}
        </h2>
        {blurb && (
          <p className="mt-0.5 max-w-[70ch] text-[11px] leading-relaxed text-ink-muted">
            {blurb}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-pit-border px-3 py-2 text-[11px] text-ink-muted">
      {children}
    </p>
  );
}
