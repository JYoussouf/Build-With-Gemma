import { Activity } from "@/lib/models/activity";
import { ruleFireCounts } from "@/lib/models/activity";
import { ModelDescriptor } from "@/lib/models/registry";
import { Telemetry } from "@/lib/types";

import { ParameterTable } from "./ParameterTable";

import alertRules from "@data/config/alert-rules.json";

/**
 * One model, in full: what it is for, what it takes in, what it is tuned to,
 * and — through the activity strip — that it is running rather than described.
 */

interface Props {
  model: ModelDescriptor;
  activity: Activity | null;
  telemetry: Telemetry | null;
}

export function ModelDetail({ model, activity, telemetry }: Props) {
  return (
    <article className="flex flex-col gap-4 p-4">
      <header>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[15px] tracking-[0.06em] text-ink">{model.name}</h1>
          <span className="text-[10px] tracking-[0.14em] text-ink-muted uppercase">
            {model.kind}
          </span>
        </div>
        <p className="mt-2 max-w-[70ch] text-[12px] leading-relaxed text-ink-body">
          {model.summary}
        </p>
        <p className="mt-2 font-mono text-[10px] text-ink-muted">
          {model.implementation}
        </p>
      </header>

      <ActivityStrip activity={activity} />

      <section className="rounded-md border border-pit-border bg-pit-panel/80">
        <header className="border-b border-pit-border px-3 py-2">
          <h2 className="text-[11px] font-medium tracking-[0.14em] text-ink-secondary uppercase">
            Inputs
          </h2>
        </header>
        <ul className="divide-y divide-pit-border/60">
          {model.inputs.map((input) => (
            <li
              key={input.name}
              className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5"
            >
              <span className="font-mono text-[12px] text-ink">{input.name}</span>
              <span className="text-[10px] text-ink-muted">{input.unit}</span>
              <span className="text-[11px] text-ink-secondary">{input.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {model.groups.map((group) => (
          <ParameterTable key={group.title} group={group} />
        ))}
      </div>

      {model.id === "rules" && <RuleFires telemetry={telemetry} />}
    </article>
  );
}

/**
 * The line that separates a model that is running from one that is documented.
 * With no race connected it says so rather than showing zeros, which would read
 * as a measurement.
 */
function ActivityStrip({ activity }: { activity: Activity | null }) {
  if (!activity) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed border-pit-border px-3 py-2 text-[11px] text-ink-muted">
        <span aria-hidden className="size-1.5 rounded-full bg-ink-muted" />
        Idle. Start a race to see this model stepping.
      </p>
    );
  }

  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border border-pit-border bg-pit-panel-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-status-ok" />
        <dt className="sr-only">Rate</dt>
        <dd className="font-mono text-[11px] text-ink">{activity.rate}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
          Scanning
        </dt>
        <dd className="text-[11px] text-ink-body">{activity.scanning}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-[10px] tracking-[0.12em] text-ink-muted uppercase">
          Output
        </dt>
        <dd className="font-mono text-[11px] text-ink-body">{activity.output}</dd>
      </div>
    </dl>
  );
}

/** Which rules actually trip, rather than which ones exist. */
function RuleFires({ telemetry }: { telemetry: Telemetry | null }) {
  const counts = ruleFireCounts(telemetry);

  return (
    <section className="rounded-md border border-pit-border bg-pit-panel/80">
      <header className="border-b border-pit-border px-3 py-2">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-ink-secondary uppercase">
          Fires this session
        </h2>
      </header>
      {telemetry === null ? (
        <p className="px-3 py-2 text-[11px] text-ink-muted">
          Start a race to see which rules trip.
        </p>
      ) : (
        <ul className="divide-y divide-pit-border/60">
          {alertRules.rules.map((rule) => {
            const count = counts.get(rule.id) ?? 0;
            return (
              <li
                key={rule.id}
                className="flex items-baseline justify-between gap-4 px-3 py-1.5"
              >
                <span
                  className={`text-[12px] ${rule.enabled ? "text-ink-body" : "text-ink-muted line-through"}`}
                >
                  {rule.label}
                </span>
                <span
                  className={`font-mono text-[12px] ${count > 0 ? "text-ink" : "text-ink-muted"}`}
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
