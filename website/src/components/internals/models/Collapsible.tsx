"use client";

import { ReactNode, useState } from "react";

/**
 * A section of a model that opens on click.
 *
 * A model page laid out flat presented its inputs, every parameter group and
 * its rule table at once, which is a wall of numbers whether or not you came
 * for any of it. Collapsed by default, each header states what is inside and
 * how much of it, so the page reads as a contents list and you open only the
 * part you are actually checking.
 *
 * The count in the header is the point of keeping them closed: it tells you
 * whether a section is worth opening without opening it.
 */
export function Collapsible({
  title,
  count,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** How many rows are inside. Shown so a closed section still informs. */
  count?: number;
  /** Provenance or units, shown muted on the right of the header. */
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-md border border-pit-border bg-pit-panel/80">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-pit-panel-2/60"
      >
        <span
          aria-hidden
          className={`text-[9px] text-ink-muted transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-ink-secondary uppercase">
          {title}
        </h3>
        {count !== undefined && (
          <span className="tnum text-[10px] text-ink-muted">{count}</span>
        )}
        {meta && (
          <span className="ml-auto truncate pl-3 font-mono text-[10px] text-ink-muted">
            {meta}
          </span>
        )}
      </button>

      {open && <div className="border-t border-pit-border">{children}</div>}
    </section>
  );
}
