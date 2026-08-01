import Link from "next/link";
import { ReactNode } from "react";

/**
 * Shell for the behind-the-scenes views. Explore is built; Models and Config
 * are listed as not built rather than hidden, so the section describes its own
 * shape.
 */

const TABS = [
  { href: "/internals/explore", label: "Explore", ready: true },
  { href: "/internals/models", label: "Models", ready: false },
  { href: "/internals/config", label: "Config", ready: false },
];

export default function InternalsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-pit-border px-4 py-2.5">
        <div className="flex items-baseline gap-4">
          <Link
            href="/"
            className="text-[13px] tracking-[0.2em] text-ink transition-colors hover:text-ink-secondary"
          >
            RACEMIND
          </Link>
          <span className="text-[10px] tracking-[0.16em] text-ink-muted uppercase">
            Behind the scenes
          </span>
        </div>

        <nav className="flex items-center gap-1 text-[11px]">
          {TABS.map((tab) =>
            tab.ready ? (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded px-2 py-1 text-ink-secondary transition-colors hover:bg-pit-panel hover:text-ink"
              >
                {tab.label}
              </Link>
            ) : (
              <span
                key={tab.href}
                className="cursor-not-allowed rounded px-2 py-1 text-ink-muted"
                title="Not built yet"
              >
                {tab.label}
                <span className="ml-1 text-[9px] tracking-[0.1em] uppercase">
                  soon
                </span>
              </span>
            ),
          )}
          <span className="mx-1 h-3 w-px bg-pit-border" />
          <Link
            href="/dashboard"
            className="rounded px-2 py-1 text-ink-secondary transition-colors hover:bg-pit-panel hover:text-ink"
          >
            Pit Wall
          </Link>
        </nav>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
