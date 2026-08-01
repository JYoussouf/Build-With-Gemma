import { Collapsible } from "@/components/internals/models/Collapsible";
import { ParameterGroup } from "@/lib/models/registry";

/**
 * One group of parameters, collapsed until asked for. Every group still names
 * where its values came from in the header, so the provenance is readable
 * without opening it.
 */
export function ParameterTable({ group }: { group: ParameterGroup }) {
  return (
    <Collapsible
      title={group.title}
      count={group.rows.length}
      meta={group.source}
    >
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
    </Collapsible>
  );
}
