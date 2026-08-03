"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The application's primary navigation.
 *
 * Previously each view carried its own: the dashboard had two text links
 * wedged between telemetry readouts, and the internals section had a separate
 * tab row of its own. Neither told you where you were. This is one bar, in one
 * place, on every view.
 */

interface Tab {
  href: string;
  label: string;
  /** Views that exist. Everything else is listed but not yet linked. */
  ready: boolean;
  /** Matches nested routes, so /internals/explore lights up Explore. */
  match?: string;
}

const TABS: Tab[] = [
  { href: "/live", label: "Live", ready: true },
  { href: "/dashboard", label: "Replays", ready: true },
  { href: "/track-trace", label: "Track & Trace", ready: true },
  { href: "/internals/explore", label: "Explore", ready: true, match: "/internals/explore" },
  { href: "/internals/models", label: "Models", ready: true, match: "/internals/models" },
  { href: "/internals/config", label: "Config", ready: false },
];

export function AppTabs() {
  const pathname = usePathname();

  return (
    // Deliberately slim: the dashboard below it is tightly budgeted for
    // vertical space, so the bar takes as little as it can while staying
    // legible.
    <header className="flex h-9 shrink-0 items-stretch border-b border-pit-border bg-pit-black/70">
      {/* Straight to Live rather than to `/`, which only redirects here. */}
      <Link
        href="/live"
        className="flex items-center border-r border-pit-border px-5 text-[13px] font-semibold tracking-[0.22em] text-ink transition-colors hover:text-ink-secondary"
      >
        RACEMIND
      </Link>

      <nav className="flex items-stretch" aria-label="Primary">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.match ?? tab.href);
          return tab.ready ? (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center border-r border-pit-border px-5 text-[11px] tracking-[0.16em] uppercase transition-colors ${
                active
                  ? "bg-pit-panel-2 text-ink"
                  : "text-ink-muted hover:bg-pit-panel/60 hover:text-ink-secondary"
              }`}
            >
              {tab.label}
              {/* A rule across the top of the active tab. Greyscale, per the
                  pit-wall palette: colour is reserved for data meaning. */}
              {active && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink" />
              )}
            </Link>
          ) : (
            <span
              key={tab.href}
              title="Not built yet"
              className="flex cursor-not-allowed items-center gap-2 border-r border-pit-border px-5 text-[11px] tracking-[0.16em] text-ink-muted/50 uppercase"
            >
              {tab.label}
              <span className="rounded-sm border border-pit-border px-1 py-px text-[8px] tracking-[0.1em]">
                soon
              </span>
            </span>
          );
        })}
      </nav>
    </header>
  );
}
