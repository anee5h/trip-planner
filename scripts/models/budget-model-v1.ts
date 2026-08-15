/**
 * budget-model-v1 — KAI-89 discretionary budget model.
 *
 * Tickets are FACTUAL (source-verified evidence only; never estimated from
 * kind). Discretionary components (transport/food/cafe) are peer-cell medians
 * over the TRUSTED calibration set, rounded to ¥100, with minimum sample
 * size and dispersion caps; confidence is capped (Tier A medium / broader
 * low) because the trusted spend values are legacy-rescaled (AgentE).
 *
 * Override precedence is enforced by the generator: this model only emits a
 * value for records it is allowed to fill (unknown/template), never for
 * source-verified or trusted records.
 */
import type { Destination } from "../../src/shared/types/destination";
import {
  durationBucket,
  iqr,
  kindGroup,
  loadTruth,
  median,
  quantile,
  roundTo,
  type CalibrationTruth,
} from "./calibration";

export interface BudgetModelOutput {
  action: "fill" | "clear-to-unknown" | "keep";
  reason: string;
  confidence: "high" | "medium" | "low" | "unknown";
  tickets?: number;
  budget?: {
    budgetMin: number;
    budgetRecommended: number;
    budgetMax: number;
    breakdown: {
      transport: number;
      tickets: number;
      food: number;
      cafe: number;
    };
  };
  modelVersion: "budget-model-v1";
}

interface PeerCell {
  n: number;
  transport: number[];
  food: number[];
  cafe: number[];
  /** Per-record discretionary totals (transport+food+cafe), used for the
   *  range spread. The pooled component arrays are for component medians
   *  only — the pooled CONCATENATION is never used as a total distribution
   *  (it mixes component scales and has no meaning for the total). */
  totals: number[];
}

export const MIN_CELL_SAMPLES = 5;
export const MAX_CELL_DISPERSION = 1.5; // IQR/median per component

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

function buildPeerCells(
  destinations: Destination[],
  truth: CalibrationTruth,
): Map<string, PeerCell> {
  const trusted = new Set(truth.trusted.budget ?? []);
  const cells = new Map<string, PeerCell>();
  const add = (key: string, d: Destination) => {
    const cell = cells.get(key) ?? {
      n: 0,
      transport: [],
      food: [],
      cafe: [],
      totals: [],
    };
    cell.n += 1;
    cell.transport.push(d.budgetBreakdown!.transport);
    cell.food.push(d.budgetBreakdown!.food);
    cell.cafe.push(d.budgetBreakdown!.cafe);
    cell.totals.push(
      d.budgetBreakdown!.transport +
        d.budgetBreakdown!.food +
        d.budgetBreakdown!.cafe,
    );
    cells.set(key, cell);
  };
  for (const d of destinations) {
    if (!trusted.has(d.id) || !d.budgetBreakdown) continue;
    const base = [
      kindGroup(d),
      durationBucket(d.recommendedVisitHours?.max),
      d.role ?? "poi",
    ].join("|");
    // Base cell (kind+duration+role) AND the importance-split cell
    // (kind+duration+role+importance). The model prefers the split cell and
    // falls back to the base cell when it is too small; both must exist or
    // the split lookup is dead code.
    const importanceGroup =
      d.importance === "major"
        ? "major"
        : d.importance === "notable"
          ? "notable"
          : "standard";
    add(base, d);
    add(`${base}|${importanceGroup}`, d);
  }
  return cells;
}

function cellMedians(cell: PeerCell): {
  transport: number;
  food: number;
  cafe: number;
  dispersionOk: boolean;
} {
  const med = (vals: number[]) => median(vals);
  const dispOk = (vals: number[]) => {
    const m = med(vals);
    return m > 0 && iqr(vals) / m <= MAX_CELL_DISPERSION;
  };
  return {
    transport: med(cell.transport),
    food: med(cell.food),
    cafe: med(cell.cafe),
    dispersionOk:
      dispOk(cell.transport) && dispOk(cell.food) && dispOk(cell.cafe),
  };
}

/**
 * Decide the budget treatment for one destination.
 * @param eligibleIds records this model is allowed to touch (template or
 *   unknown budget set computed by the generator under override precedence).
 */
export function budgetModel(
  dest: Destination,
  eligibleIds: Set<string>,
  destinations: Destination[],
  truth: CalibrationTruth,
): BudgetModelOutput {
  if (!eligibleIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: "unknown",
      modelVersion: "budget-model-v1",
    };
  }

  // ---- Tickets: factual only ----
  const ticket = truth.ticketEvidence[dest.id];
  const isHub = HUB_KINDS.has(dest.kind ?? "");
  let tickets: number | undefined;
  if (ticket) {
    tickets = ticket.jpy;
  } else if (isHub) {
    // Class convention, not source-verified: city hubs have no single
    // admission product (4 verified exemplars in the evidence set).
    tickets = 0;
  }

  if (tickets === undefined) {
    // No admission evidence and not a hub: the daily estimate would be
    // misleading without admission, so the record returns to UNKNOWN
    // (owner policy: unknown never coerced; admission stays unknown unless
    // a source verifies it).
    return {
      action: "clear-to-unknown",
      reason:
        "no source-verified admission; budget returned to unknown (UNKNOWN_NOT_FREE)",
      confidence: "unknown",
      modelVersion: "budget-model-v1",
    };
  }

  // ---- Discretionary components: peer-cell medians ----
  // Cell = kind-group + duration-bucket + role + importance-group, so
  // legitimate inputs (importance) produce explainable dispersion instead of
  // one identical median for an entire peer class. Falls back to the
  // importance-agnostic cell when the split cell is too small.
  const cells = buildPeerCells(destinations, truth);
  const importanceGroup =
    dest.importance === "major"
      ? "major"
      : dest.importance === "notable"
        ? "notable"
        : "standard";
  const cellKey = [
    kindGroup(dest),
    durationBucket(dest.recommendedVisitHours?.max),
    dest.role ?? "poi",
  ].join("|");
  const importanceKey = `${cellKey}|${importanceGroup}`;
  let cell = cells.get(importanceKey);
  if (!cell || cell.n < MIN_CELL_SAMPLES) cell = cells.get(cellKey);
  const fallbackKey = [kindGroup(dest), dest.role ?? "poi"].join("|");
  let cell2: PeerCell | undefined;
  if (!cell || cell.n < MIN_CELL_SAMPLES) {
    const merged = new Map<string, PeerCell>();
    for (const [k, c] of cells) {
      // Merge only the base (3-part) cells: importance-split cells would
      // double-count their members in the merged bucket.
      if (k.split("|").length !== 3) continue;
      const base = k.split("|").slice(0, 1).join("|") + "|" + k.split("|")[2];
      const m = merged.get(base) ?? {
        n: 0,
        transport: [],
        food: [],
        cafe: [],
        totals: [],
      };
      m.n += c.n;
      m.transport.push(...c.transport);
      m.food.push(...c.food);
      m.cafe.push(...c.cafe);
      m.totals.push(...c.totals);
      merged.set(base, m);
    }
    cell2 = merged.get(fallbackKey);
  }
  const effective = cell && cell.n >= MIN_CELL_SAMPLES ? cell : cell2;
  if (!effective || effective.n < MIN_CELL_SAMPLES) {
    if (ticket) {
      // Override precedence: a source-verified ticket must be preserved even
      // when no sufficient peer cell exists for the discretionary
      // components. The record's existing budget is the accepted final-pass
      // state (components are legacy/manual-review debt); the model must not
      // regress a corrected record.
      return {
        action: "keep",
        reason: `verified ticket ¥${tickets} preserved; peer cell '${cellKey}' has ${effective?.n ?? 0} samples (< ${MIN_CELL_SAMPLES}); components left as accepted debt`,
        confidence: "unknown",
        modelVersion: "budget-model-v1",
      };
    }
    return {
      action: "clear-to-unknown",
      reason: `peer cell '${cellKey}' has ${effective?.n ?? 0} samples (< ${MIN_CELL_SAMPLES}); unknown preserved`,
      confidence: "unknown",
      modelVersion: "budget-model-v1",
    };
  }
  const est = cellMedians(effective);
  if (!est.dispersionOk) {
    if (ticket) {
      return {
        action: "keep",
        reason: `verified ticket ¥${tickets} preserved; peer cell '${cellKey}' dispersion too high (IQR/median > ${MAX_CELL_DISPERSION}); components left as accepted debt`,
        confidence: "unknown",
        modelVersion: "budget-model-v1",
      };
    }
    return {
      action: "clear-to-unknown",
      reason: `peer cell '${cellKey}' dispersion too high (IQR/median > ${MAX_CELL_DISPERSION}); unknown preserved`,
      confidence: "unknown",
      modelVersion: "budget-model-v1",
    };
  }

  const transport = roundTo(est.transport, 100);
  const food = roundTo(est.food, 100);
  const cafe = roundTo(est.cafe, 100);
  // recommended = exact component sum (all components are model-generated
  // for this record; no unrelated field is altered to preserve a total).
  const budgetRecommended = transport + tickets + food + cafe;
  // Range spread from PER-RECORD discretionary totals in the effective cell
  // (half the IQR, rounded to ¥500, floor ¥500): each peer record's
  // transport+food+cafe total is one observation, so the band describes the
  // spread of plausible per-person totals. The legacy code quantiled the
  // POOLED component array (transport ∥ food ∥ cafe), mixing component
  // scales into a meaningless distribution. min/max stay symmetric around
  // recommended (documented midpoint model round((min+max)/2) holds).
  const q25 = quantile(effective.totals, 0.25);
  const q75 = quantile(effective.totals, 0.75);
  const spread = Math.max(roundTo((q75 - q25) / 2, 500), 500);
  let budgetMin = budgetRecommended - spread;
  if (budgetMin < tickets) budgetMin = tickets;
  const budgetMax = budgetRecommended + spread;

  return {
    action: "fill",
    reason: `peer cell '${cellKey}' n=${effective.n}; tickets source-verified${isHub && !ticket ? " (hub class convention)" : ""}`,
    confidence: effective.n >= 30 ? "medium" : "low",
    tickets,
    budget: {
      budgetMin,
      budgetRecommended,
      budgetMax,
      breakdown: { transport, tickets, food, cafe },
    },
    modelVersion: "budget-model-v1",
  };
}
