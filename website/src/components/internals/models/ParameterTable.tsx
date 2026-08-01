import { ParameterGroup } from "@/lib/models/registry";

/**
 * One group of parameters. Every group names where its values came from, so a
 * reader can go and check them rather than taking the view's word for it.
 */
export function ParameterTable({ group }: { group: ParameterGroup }) {
  return (
    <section className="rounded-md border border-pit-border bg-pit-panel/80">
      <header className="flex items-baseline justify-between gap-3 border-b border-pit-border px-3 py-2">
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-ink-secondary uppercase">
          {group.title}
        </h3>
        <span className="truncate font-mono text-[10px] text-ink-muted">
          {group.source}
        </span>
      </header>

      <dl className="divide-y divide-pit-border/60">
        {group.rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 px-3 py-1.5"
          >
            <dt className="text-[12px] text-ink-body">{row.label}</dt>
            <dd className="text-right font-mono text-[12px] whitespace-nowrap text-ink">
              {row.value}
            </dd>
            {row.note && (
              <p className="col-span-2 mt-0.5 text-[10px] text-ink-muted">
                {row.note}
              </p>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
