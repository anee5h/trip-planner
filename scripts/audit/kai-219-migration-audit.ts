#!/usr/bin/env tsx
/**
 * KAI-219 — Budget v2 catalogue migration audit (deterministic).
 *
 * Reports the catalogue's state against the KAI-218 scoped cost facts
 * (admission / localTransport) and the legacy-field debt, so every PR in
 * the KAI-219 migration has identical before/after evidence.
 *
 * Deterministic: same input catalogue → byte-identical output. No clock,
 * no network, no ordering dependence (cohorts are sorted).
 *
 *   npx tsx scripts/audit/kai-219-migration-audit.ts
 *
 * Exit code 0 always (this is an inventory, not a gate). The DEPRECATION
 * ratchet (check:catalog-ci) remains the CI gate.
 */
import * as fs from "node:fs";
import * as path from "node:path";
// KAI-214 normalizer — authoritative trust/state semantics (relative
// import so this script stays runnable via plain tsx, no @/ alias).
import {
  normalizeBudgetState,
  isVerifiedFree,
} from "../../src/shared/services/budget/budgetState";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

interface AdmissionFact {
  state?: string;
  provenance?: string;
  cost?: { kind?: string; min?: number; max?: number; from?: number };
}
interface LocalTransportFact {
  kind?: string;
  reason?: string;
  fare?: [number, number];
}
interface BudgetMetadata {
  state?: string;
  method?: string;
  provenance?: string;
  basis?: string;
}
interface Destination {
  id: string;
  admission?: AdmissionFact;
  localTransport?: LocalTransportFact;
  budgetMetadata?: BudgetMetadata;
  budgetBreakdown?: {
    transport?: number;
    tickets?: number;
    food?: number;
    cafe?: number;
  };
  budgetMin?: number;
  budgetRecommended?: number;
  budgetMax?: number;
}

function load(): Destination[] {
  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  return JSON.parse(raw) as Destination[];
}

export function runAudit(destinations: Destination[]) {
  const total = destinations.length;

  // ── ADMISSION ─────────────────────────────────────────────────────────
  const admission = {
    explicit: 0,
    verified_paid: 0,
    verified_free: 0,
    documented_estimate: 0,
    variable_price: 0,
    not_applicable: 0,
    unavailable: 0,
    absent: 0,
    transitional_legacy_fallback: 0,
  };
  const admissionIds: Record<string, string[]> = {};

  // ── LOCAL TRANSPORT ───────────────────────────────────────────────────
  const localTransport = {
    explicit: 0,
    verified_required_access: 0,
    bounded_defensible_access: 0,
    verified_walking: 0,
    not_applicable: 0,
    unavailable: 0,
    absent: 0,
  };
  const localTransportIds: Record<string, string[]> = {};

  // ── DEBT ──────────────────────────────────────────────────────────────
  const debt = {
    legacy_unverified_numeric: 0,
    numeric_without_provenance: 0,
    free_without_evidence: 0,
    deprecated_budget_field_authoring: 0,
  };
  const debtIds: Record<string, string[]> = {};

  const push = (map: Record<string, string[]>, key: string, id: string) => {
    (map[key] ??= []).push(id);
  };

  for (const d of destinations) {
    // ── Admission cohort ────────────────────────────────────────────────
    const fact = d.admission;
    if (fact) {
      admission.explicit += 1;
      const st = fact.state ?? "unknown";
      if (st in admission) {
        admission[st as keyof typeof admission] += 1;
      }
      push(admissionIds, `admission:${st}`, d.id);
    } else {
      admission.absent += 1;
      // Transitional legacy fallback: any record WITHOUT an explicit fact
      // still relies on the KAI-214 normalized legacy admission path.
      admission.transitional_legacy_fallback += 1;
      push(admissionIds, "admission:transitional_legacy_fallback", d.id);
    }

    // ── Local transport cohort ──────────────────────────────────────────
    const lt = d.localTransport;
    if (lt) {
      localTransport.explicit += 1;
      const k = lt.kind ?? "unknown";
      if (k in localTransport) {
        localTransport[k as keyof typeof localTransport] += 1;
      }
      push(localTransportIds, `localTransport:${k}`, d.id);
    } else {
      localTransport.absent += 1;
      push(localTransportIds, "localTransport:absent", d.id);
    }

    // ── Debt cohorts ────────────────────────────────────────────────────
    const bm = d.budgetMetadata;
    const tickets = d.budgetBreakdown?.tickets;
    // KAI-219A (Luna MINOR 4): use the AUTHORITATIVE KAI-214 normalizer
    // (normalizeBudgetState) instead of raw budgetMetadata.state — it
    // correctly classifies transitional manual/model records and treats
    // contradictory provenance as untrusted.
    const norm = normalizeBudgetState(d);
    const trusted = norm.trustLevel !== "untrusted";
    const verifiedFree = isVerifiedFree(d);

    // Legacy/unverified numeric authoring: numeric tickets with an
    // untrusted/absent KAI-214 state.
    if (tickets !== undefined && Number.isFinite(tickets) && !trusted) {
      debt.legacy_unverified_numeric += 1;
      push(debtIds, "debt:legacy_unverified_numeric", d.id);
    }
    // Numeric without provenance: numeric budget with no provenance axis.
    if (
      (d.budgetMin !== undefined ||
        d.budgetMax !== undefined ||
        tickets !== undefined) &&
      !bm?.provenance
    ) {
      debt.numeric_without_provenance += 1;
      push(debtIds, "debt:numeric_without_provenance", d.id);
    }
    // Free without evidence: ¥0 tickets without verified_free evidence.
    if (tickets === 0 && !verifiedFree) {
      debt.free_without_evidence += 1;
      push(debtIds, "debt:free_without_evidence", d.id);
    }
    // Deprecated generic budget-field authoring (DEPRECATION.md §1).
    if (
      d.budgetMin !== undefined ||
      d.budgetRecommended !== undefined ||
      d.budgetMax !== undefined ||
      d.budgetBreakdown?.transport !== undefined
    ) {
      debt.deprecated_budget_field_authoring += 1;
      push(debtIds, "debt:deprecated_budget_field_authoring", d.id);
    }
  }

  const sortIds = (v: string[]) => [...v].sort();
  const clean = (m: Record<string, string[]>) =>
    Object.fromEntries(
      Object.entries(m)
        .map(([k, v]) => [k, sortIds(v)])
        // Locale-independent comparator (Luna NIT 6): byte-order is stable
        // across environments, unlike localeCompare.
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );

  return {
    generatedAt: "KAI-219 deterministic audit (no clock)",
    total,
    admission,
    localTransport,
    debt,
    ids: {
      admission: clean(admissionIds),
      localTransport: clean(localTransportIds),
      debt: clean(debtIds),
    },
  };
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runAudit(load());
  console.log(JSON.stringify(result, null, 2));
}
