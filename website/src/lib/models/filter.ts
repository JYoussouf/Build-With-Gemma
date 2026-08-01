import anomalyConfig from "@data/config/anomaly-detection.json";
import filterConfig from "@data/config/agent-filter.json";

import { Alert, Severity } from "@/lib/types";

/**
 * The Agent-In-The-Loop filter.
 *
 * Every decision the engineer makes on a TimesFM anomaly is feedback: approving
 * one says it was worth their attention, dismissing one says it was noise.
 * Gemma condenses that history into suppression rules, which would act as a
 * final unsupervised filter on TimesFM output before anything reaches a human.
 *
 * Two things this module is deliberately not:
 *
 *   It does not call Gemma. `compileRules` is a canned stand-in that recognises
 *   the rule shapes declared in `agent-filter.json`. The prompt that would be
 *   sent is built by `renderPrompt` and shown verbatim in the view, so swapping
 *   the stub for a real call later changes nothing the engineer reads.
 *
 *   It does not suppress anything. Nothing in this module is wired into the
 *   alert path, and `wouldSuppress` is named for what it is. The Models view
 *   demonstrates the layer; the product does not yet run it.
 */

export const SUPPORT_THRESHOLD = filterConfig.support_threshold;
export const MAX_RULES = filterConfig.max_rules;

export type DecisionKind = "approved" | "modified" | "dismissed";

export interface Decision {
  alertId: string;
  lap: number;
  kind: DecisionKind;
  title: string;
  severity: Severity;
  /** Anomaly template this alert came from, where one can be identified. */
  tag: string | null;
  /** Peak deviation across the alert's channels. */
  sigma: number | null;
  /** Channel family the alert fired on, e.g. `brake_temp_*`. */
  channelFamily: string | null;
  createdAt: number;
}

export type Predicate =
  | { channel: string; sigma: { "<": number } }
  | { severity: Severity }
  | { tag: string };

export interface FilterRule {
  id: string;
  kind: "channel-sigma" | "severity" | "tag";
  statement: string;
  predicate: Predicate;
  action: "suppress";
  /** The decisions that justify the rule. Empty for seeded rules. */
  support: Decision[];
  confidence: number;
  /**
   * Active rules have reached `SUPPORT_THRESHOLD`. Proposed ones have not, and
   * are shown anyway so the learning is watchable rather than instantaneous.
   */
  status: "active" | "proposed" | "seeded";
  /** Why a seeded rule exists, since it has no support to point at. */
  note?: string;
}

const TEMPLATES = anomalyConfig.templates;

/**
 * Corner suffixes collapse to a family: dismissing `brake_temp_fl` is a
 * judgement about brake temperature, not about the left front specifically.
 */
const CORNER_SUFFIX = /_(fl|fr|rl|rr)$/;

export function channelFamily(name: string): string {
  return CORNER_SUFFIX.test(name) ? `${name.replace(CORNER_SUFFIX, "")}_*` : name;
}

export function matchesFamily(name: string, family: string): boolean {
  if (!family.endsWith("_*")) return name === family;
  return name.startsWith(family.slice(0, -1));
}

/**
 * Reads the engineer's decisions off the alert list.
 *
 * The store carries no decision log, so `status` is the record: `sent` means
 * approved, `dismissed` means dismissed. A `sent` alert whose message no longer
 * matches its template's interpretation was edited on the way through, which is
 * a third kind of feedback — the anomaly was worth raising, but not as worded.
 */
export function decisionsFromAlerts(alerts: Alert[]): Decision[] {
  return alerts
    .filter((a) => a.tier === "2c" && a.status !== "pending")
    .map((a) => {
      const template = TEMPLATES.find((t) => t.title === a.title);
      const edited =
        template !== undefined && a.message.trim() !== template.interpretation.trim();
      const peak = a.channels?.reduce(
        (max, c) => (c.sigma > max ? c.sigma : max),
        0,
      );
      return {
        alertId: a.id,
        lap: a.lap,
        kind:
          a.status === "dismissed"
            ? "dismissed"
            : edited
              ? "modified"
              : "approved",
        title: a.title,
        severity: a.severity,
        tag: template?.id ?? null,
        sigma: a.sigma ?? (peak && peak > 0 ? peak : null),
        channelFamily: a.channels?.[0]
          ? channelFamily(a.channels[0].name)
          : null,
        createdAt: a.createdAt,
      } satisfies Decision;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Rules must never suppress something the engineer chose to act on. */
function kept(decisions: Decision[]): Decision[] {
  return decisions.filter((d) => d.kind !== "dismissed");
}

function groupBy<K extends string>(
  decisions: Decision[],
  key: (d: Decision) => K | null,
): Map<K, Decision[]> {
  const out = new Map<K, Decision[]>();
  for (const d of decisions) {
    const k = key(d);
    if (k === null) continue;
    const list = out.get(k);
    if (list) list.push(d);
    else out.set(k, [d]);
  }
  return out;
}

/**
 * Confidence rises with support and saturates: four consistent dismissals are
 * meaningfully better evidence than two, forty are not meaningfully better
 * than four.
 */
function confidenceFor(support: number): number {
  return Math.round(Math.min(0.95, 0.45 + support * 0.12) * 100) / 100;
}

function statusFor(support: number): FilterRule["status"] {
  return support >= SUPPORT_THRESHOLD ? "active" : "proposed";
}

/**
 * The canned Gemma call: decision history in, suppression rules out.
 *
 * Deterministic, offline, and limited to the three predicate forms the prompt
 * asks for. A rule is only emitted when every decision behind it was a
 * dismissal and nothing the engineer kept would be caught by it — the same
 * constraint the prompt puts on the model.
 */
export function compileRules(decisions: Decision[]): FilterRule[] {
  const dismissed = decisions.filter((d) => d.kind === "dismissed");
  const keep = kept(decisions);
  const rules: FilterRule[] = [];

  // Template tags: one recurring diagnosis the engineer judges benign.
  for (const [tag, support] of groupBy(dismissed, (d) => d.tag)) {
    if (keep.some((d) => d.tag === tag)) continue;
    rules.push({
      id: `tag-${tag}`,
      kind: "tag",
      statement: `Anomalies tagged ${tag} are not worth surfacing.`,
      predicate: { tag },
      action: "suppress",
      support,
      confidence: confidenceFor(support.length),
      status: statusFor(support.length),
    });
  }

  // Channel families: suppress the quiet end of a noisy channel. The bound sits
  // above every dismissal and below anything the engineer kept, so the rule
  // cannot reach work they acted on.
  for (const [family, support] of groupBy(dismissed, (d) =>
    d.sigma === null ? null : d.channelFamily,
  )) {
    const loudestDismissed = Math.max(...support.map((d) => d.sigma ?? 0));
    const quietestKept = keep
      .filter((d) => d.channelFamily === family && d.sigma !== null)
      .reduce((min, d) => Math.min(min, d.sigma ?? Infinity), Infinity);
    // Round up off the dismissals so the rule covers them with a little room,
    // then give way to anything the engineer kept.
    const bound = Math.min(
      Math.ceil((loudestDismissed + 0.05) * 10) / 10,
      quietestKept,
    );
    if (!Number.isFinite(bound) || bound <= 0) continue;
    if (support.every((d) => (d.sigma ?? 0) >= bound)) continue;
    const covered = support.filter((d) => (d.sigma ?? 0) < bound);
    rules.push({
      id: `channel-${family}`,
      kind: "channel-sigma",
      statement: `${family} anomalies below ${bound.toFixed(1)} sigma are not worth surfacing.`,
      predicate: { channel: family, sigma: { "<": bound } },
      action: "suppress",
      support: covered,
      confidence: confidenceFor(covered.length),
      status: statusFor(covered.length),
    });
  }

  // Severity bands the engineer has shown they do not act on. This is the
  // broadest rule the prompt allows, so it needs the broadest evidence:
  // dismissals spanning more than one template. Two dismissals of a single
  // anomaly type say something about that anomaly, not about every medium
  // severity finding on the car, and the tag rule already says it better.
  for (const [severity, support] of groupBy(dismissed, (d) => d.severity)) {
    if (keep.some((d) => d.severity === severity)) continue;
    const templates = new Set(support.map((d) => d.tag ?? d.title));
    if (templates.size < 2) continue;
    rules.push({
      id: `severity-${severity}`,
      kind: "severity",
      statement: `${severity} severity anomalies are not worth surfacing.`,
      predicate: { severity },
      action: "suppress",
      support,
      confidence: confidenceFor(support.length),
      status: statusFor(support.length),
    });
  }

  // Active rules first, then the strongest proposals, so the list reads as
  // what the filter believes before what it suspects.
  return rules
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return b.support.length - a.support.length;
    })
    .slice(0, MAX_RULES);
}

/** Rules carried in from previous sessions, so the pane is legible from cold. */
export function seededRules(): FilterRule[] {
  return filterConfig.seeded_rules.map((r) => ({
    id: r.id,
    kind: r.kind as FilterRule["kind"],
    statement: r.statement,
    predicate: r.predicate as Predicate,
    action: "suppress" as const,
    support: [],
    confidence: r.confidence,
    status: "seeded" as const,
    note: r.note,
  }));
}

function templateFor(alert: Alert) {
  return TEMPLATES.find((t) => t.title === alert.title);
}

/** Whether a rule's predicate catches an alert. */
export function ruleMatches(rule: FilterRule, alert: Alert): boolean {
  const p = rule.predicate;
  if ("tag" in p) return templateFor(alert)?.id === p.tag;
  if ("severity" in p) return alert.severity === p.severity;
  const peak =
    alert.sigma ??
    alert.channels?.reduce((max, c) => (c.sigma > max ? c.sigma : max), 0) ??
    null;
  if (peak === null) return false;
  return (
    (alert.channels ?? []).some((c) => matchesFamily(c.name, p.channel)) &&
    peak < p.sigma["<"]
  );
}

export interface SuppressionPreview {
  alert: Alert;
  rule: FilterRule;
}

/**
 * What the active rules would have caught, had this layer been running.
 *
 * Nothing here is withheld from anyone. The Engineer Panel and the HUD show
 * every alert regardless of what this returns.
 */
export function wouldSuppress(
  alerts: Alert[],
  rules: FilterRule[],
): SuppressionPreview[] {
  const live = rules.filter((r) => r.status !== "proposed");
  const out: SuppressionPreview[] = [];
  for (const alert of alerts) {
    if (alert.tier !== "2c") continue;
    const rule = live.find((r) => ruleMatches(r, alert));
    if (rule) out.push({ alert, rule });
  }
  return out;
}

const DECISION_LABEL: Record<DecisionKind, string> = {
  approved: "APPROVED",
  modified: "MODIFIED",
  dismissed: "DISMISSED",
};

/**
 * The prompt exactly as it would be sent, with the live decision history
 * interpolated. Shown verbatim in the view: the point of the pane is that the
 * engineer can read what the model was asked, not just what it answered.
 */
export function renderPrompt(decisions: Decision[]): string {
  const body =
    decisions.length === 0
      ? "  (no decisions yet this session)"
      : decisions
          .slice()
          .reverse()
          .map(
            (d) =>
              `  lap ${String(d.lap).padStart(2, " ")}  ${DECISION_LABEL[d.kind].padEnd(9, " ")}  ${d.alertId}  ${d.title}` +
              `${d.sigma === null ? "" : `  (${d.sigma.toFixed(1)}σ`}` +
              `${d.sigma !== null && d.channelFamily ? ` on ${d.channelFamily}` : ""}` +
              `${d.sigma === null ? "" : ")"}`,
          )
          .join("\n");

  return filterConfig.prompt_template
    .replace("{{decisions}}", body)
    .replace("{{support_threshold}}", String(SUPPORT_THRESHOLD));
}
