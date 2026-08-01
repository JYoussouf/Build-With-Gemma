"use client";

import gemmaConfig from "@data/config/gemma.json";
import { AlertTier } from "@/lib/types";

/**
 * Says what produced a piece of output, and marks model-generated text as
 * such (feedback round-01 F4/F5).
 *
 * The point of the entry is that Gemma is reading the telemetry and writing
 * the recommendation. Until this existed a viewer could not tell a model's
 * reading from a threshold firing, because both arrived as the same grey card.
 *
 * The model name comes from `/data/config/gemma.json`, never a literal in a
 * component (Q3). While that config is unverified the name is rendered muted
 * with a marker, so the UI never asserts a version nothing has confirmed.
 */

const PRODUCERS = gemmaConfig.producers;
const MODEL = gemmaConfig.model;

export type ProducerKey = "2a" | "2b" | "2c";

export function producerFor(tier: AlertTier): ProducerKey {
  return tier;
}

/** Full attribution line, for a card header. */
export function ProducerBadge({ tier }: { tier: AlertTier }) {
  const p = PRODUCERS[tier];
  const isModel = p.kind === "model";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded-sm border px-1.5 py-[1px] text-[9px] tracking-[0.12em] uppercase ${
          isModel
            ? "border-ink text-ink"
            : "border-pit-border text-ink-secondary"
        }`}
      >
        {tier}
      </span>
      <span className="text-[10px] text-ink-secondary">{p.label}</span>
      {isModel && <ModelName />}
    </span>
  );
}

/**
 * The model identity. Muted and marked while unverified, so an unconfirmed
 * version string never reads as a claim — Q3 is explicit that an inaccurate
 * model name in a Gemma-sponsored competition is worse than a hedged one.
 */
export function ModelName() {
  if (!MODEL.verified) {
    return (
      <span
        className="text-[10px] text-ink-muted"
        title="Model identity is not yet confirmed against a live call (feedback round-01 Q3)."
      >
        {MODEL.display_name} <span className="opacity-70">· unverified</span>
      </span>
    );
  }
  return <span className="text-[10px] text-ink">{MODEL.display_name}</span>;
}

/** Group heading for the model-first alerts panel. */
export function ProducerHeading({ tier }: { tier: AlertTier }) {
  const p = PRODUCERS[tier];
  const isModel = p.kind === "model";

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span
        className={`text-[11px] tracking-[0.14em] uppercase ${
          isModel ? "text-ink" : "text-ink-secondary"
        }`}
      >
        {p.label}
      </span>
      <span className="text-[10px] text-ink-muted">
        {tier} · {p.detail}
      </span>
    </div>
  );
}

/**
 * Gemma working. Shown between TimesFM flagging a deviation and the
 * interpretation arriving, so the model's contribution is visible as it
 * happens rather than only in its finished output (F4).
 */
export function ThinkingLine() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot size-[3px] rounded-full bg-ink-secondary"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span className="text-[11px] text-ink-secondary">
        <ModelName /> is interpreting the deviation
      </span>
    </span>
  );
}
