/**
 * KAI-219B — first deterministic admission cohort (final tooling hardening).
 *
 * Migrates the 150 records on trusted-transitional numeric admission to
 * EXPLICIT KAI-218 admission facts, reusing ONLY committed evidence.
 *
 * TRUE IDEMPOTENCY (final hardening):
 *   STATE A — every frozen baseline ID still matches the authoritative
 *     transitional cohort → migrate all 150 (writes the index).
 *   STATE B — all frozen baseline IDs already carry the EXPECTED explicit
 *     KAI-219B fact (deep-equal to the deterministic classifier) → validate
 *     → exit 0 → ZERO file changes (safe no-op).
 *   STATE C — mixed / partially migrated / unexpected classification →
 *     FAIL CLOSED (throws, no writes).
 * The script NEVER simply skips a destination with admission — it always
 * validates the expected post-migration state for all 150 IDs.
 *
 * Evidence hierarchy: destination-specific official/source-backed fact >
 * defensible bounded model > unavailable. verified-paid promotion asserts a
 * source-backed evidence kind + non-empty source URL. verified-free
 * promotion asserts an allowed free evidence kind AND ev.jpy === 0 AND a
 * non-empty source URL — a FREE_IDS entry alone is never enough; if the
 * committed evidence turns positive/non-free the script FAILS CLOSED rather
 * than synthesizing verified_free [0,0].
 *
 * Run: npx tsx scripts/kai-219b-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Destination,
  AdmissionCostFact,
} from "../src/shared/types/destination";
// KAI-219A authoritative transition semantics (dependency-safe: these
// modules are pure / importable by scripts).
import { normalizeBudgetState } from "../src/shared/services/budget/budgetState";
import { getEffectiveBudgetBreakdown } from "../src/shared/services/budget/BudgetService";

const INDEX_PATH = path.resolve(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const TRUTH_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-89-calibration-truth.json",
);
const BASELINE_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219-baseline-cohort.json",
);
const CHECKED_AT = "2026-08-14"; // kai-89 calibration truth generatedAt

const truth = JSON.parse(fs.readFileSync(TRUTH_PATH, "utf8"));
const ticketEvidence: Record<
  string,
  { jpy: number; kind: string; source?: string[]; evidence?: string }
> = truth.ticketEvidence || {};

/** Evidence kinds that are source-backed (allowed for verified_paid). */
const SOURCE_BACKED_KINDS = new Set([
  "LEDGER_VERIFIED",
  "FIXED_PAID",
  "FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL",
]);
/** Free-evidence kinds allowed for verified_free. */
const FREE_EVIDENCE_KINDS = new Set(["FREE_ENTRY", "LEDGER_VERIFIED"]);
/** Records expected to be verified_free (only ever validated against the
 *  ledger — never trusted by ID alone). */
const FREE_IDS = new Set(["farm-tomita", "ikebukuro-toshima", "odaiba-minato"]);
const KITARO = "kitaro-chaya";
const COSMO = "yokohama-cosmo-world";
/** Destination-specific source-backed overrides (committed notes/editorial;
 *  the source hierarchy ranks these ABOVE the peer-cell). */
const SPECIFIC_OVERRIDES: Record<string, { jpy: number; evidence: string }> = {
  // notes: "Site-wide viewing fee ¥500 adult since April 2019" (official)
  "sannai-maruyama-jomon-aomori": {
    jpy: 500,
    evidence:
      "Committed notes state site-wide adult viewing fee ¥500 (since Apr 2019); official site",
  },
};

type Evidence = {
  jpy: number;
  kind: string;
  source?: string[];
  evidence?: string;
};

function load(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
}

function loadBaseline(): string[] {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      "KAI-219B FAIL-CLOSED: baseline cohort file missing (scripts/audit/kai-219-baseline-cohort.json). Refusing to migrate without the frozen 150-ID baseline.",
    );
  }
  const baseline = JSON.parse(
    fs.readFileSync(BASELINE_PATH, "utf8"),
  ) as string[];
  if (baseline.length === 0) {
    throw new Error(
      "KAI-219B FAIL-CLOSED: baseline cohort file is EMPTY. Refusing to migrate.",
    );
  }
  return baseline;
}

/**
 * KAI-219A-authoritative cohort membership: admission fact ABSENT + KAI-214
 * trust is trusted/trusted_estimate + the transitional projection actually
 * serves a numeric legacy ticket.
 */
function isTransitionalNumericUsed(d: Destination): boolean {
  if (d.admission) return false;
  const norm = normalizeBudgetState(d);
  const trusted =
    norm.trustLevel === "trusted" || norm.trustLevel === "trusted_estimate";
  if (!trusted) return false;
  const projected = getEffectiveBudgetBreakdown(d);
  return (
    projected !== null &&
    typeof projected.tickets === "number" &&
    Number.isFinite(projected.tickets)
  );
}

/**
 * Deterministic classifier: the EXPECTED admission fact for a cohort record
 * given its committed evidence. Throws (fail-closed) when the committed
 * evidence no longer supports the intended classification.
 */
function buildExpectedFact(
  d: Destination,
  ev: Evidence | undefined,
): AdmissionCostFact {
  // Kitaro: free entry + paid purchases.
  if (d.id === KITARO) {
    if (!ev || ev.kind !== "FREE_ENTRY_PURCHASES_VARIABLE") {
      throw new Error(
        `KAI-219B FAIL-CLOSED: kitaro-chaya no longer has FREE_ENTRY_PURCHASES_VARIABLE evidence (got ${ev?.kind ?? "none"}).`,
      );
    }
    return {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: "free_area_with_optional_paid_components",
      cost: { kind: "not_applicable" },
      scope: "open_area",
      basis:
        "Free entry; purchases variable (ledger FREE_ENTRY_PURCHASES_VARIABLE)",
      sourceUrls: ev.source?.length
        ? ev.source
        : ([d.officialWebsite].filter(Boolean) as string[]),
      checkedAt: CHECKED_AT,
    };
  }

  // Cosmo World: free entry + paid individual attractions.
  if (d.id === COSMO) {
    if (!ev || ev.kind !== "FREE_ENTRY_PAY_PER_RIDE") {
      throw new Error(
        `KAI-219B FAIL-CLOSED: yokohama-cosmo-world no longer has FREE_ENTRY_PAY_PER_RIDE evidence (got ${ev?.kind ?? "none"}).`,
      );
    }
    return {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: "free_area_with_optional_paid_components",
      cost: { kind: "not_applicable" },
      scope: "open_area",
      basis:
        "Free admission; individual attractions optional and excluded from canonical admission",
      sourceUrls: ev.source?.length
        ? ev.source
        : ([d.officialWebsite].filter(Boolean) as string[]),
      checkedAt: CHECKED_AT,
    };
  }

  // City hubs → not_applicable (hub class convention).
  if (d.kind === "city") {
    return {
      state: "not_applicable",
      provenance: "none",
      reasonCode: "hub_budget_not_applicable",
      cost: { kind: "not_applicable" },
      scope: "general_entry",
      basis: "City hub — no single admission product (hub class convention)",
    };
  }

  // Verified-free promotion: FAIL-CLOSED on evidence — an ID in FREE_IDS is
  // NEVER sufficient. Require an allowed free kind AND jpy === 0 AND a
  // non-empty source URL. If the ledger turns positive/non-free → throw.
  if (FREE_IDS.has(d.id)) {
    if (!ev) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: ${d.id} has no ledger evidence — refusing to synthesize verified_free [0,0].`,
      );
    }
    if (!FREE_EVIDENCE_KINDS.has(ev.kind)) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: ${d.id} ledger kind ${ev.kind} is not free evidence — refusing verified_free.`,
      );
    }
    if (ev.jpy !== 0) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: ${d.id} ledger jpy=${ev.jpy} (>0) — free evidence turned positive; refusing verified_free [0,0].`,
      );
    }
    const srcs = ev.source?.length
      ? ev.source
      : ([d.officialWebsite].filter(Boolean) as string[]);
    if (srcs.length === 0) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: ${d.id} verified_free has no source URL.`,
      );
    }
    return {
      state: "verified_free",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: d.id === "farm-tomita" ? "whole_area" : "general_entry",
      basis: `Free admission (ledger ${ev.kind})`,
      sourceUrls: srcs,
      checkedAt: CHECKED_AT,
    };
  }

  // Source-backed paid: kai-89 evidence with an allowed kind + URL, or a
  // destination-specific override (sannai). Evidence hierarchy: this beats
  // the peer-cell scalar.
  const override = SPECIFIC_OVERRIDES[d.id];
  const sourceBackedPaid =
    ev &&
    SOURCE_BACKED_KINDS.has(ev.kind) &&
    Array.isArray(ev.source) &&
    ev.source.length > 0;
  if (sourceBackedPaid || override) {
    const jpy = override ? override.jpy : (ev!.jpy as number);
    if (typeof jpy !== "number" || !Number.isFinite(jpy) || jpy <= 0) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: ${d.id} source-backed paid value invalid (${jpy}).`,
      );
    }
    return {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: jpy, max: jpy },
      scope: "general_entry",
      basis: override
        ? override.evidence
        : `Verified admission ¥${jpy} (ledger ${ev!.kind}); source: ${ev!.source!.join(", ")}`,
      sourceUrls: override
        ? ([d.officialWebsite].filter(Boolean) as string[])
        : (ev!.source as string[]),
      checkedAt: CHECKED_AT,
    };
  }

  // No source-backed evidence: an explicit defensible range would require
  // new research — keep honest unavailable (never [X,X] from a scalar).
  return {
    state: "unavailable",
    provenance: "none",
    reasonCode: "legacy_provenance_unrecovered",
    cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
    scope: "general_entry",
    basis: "No source-backed admission evidence in committed data",
  };
}

/** Deep equality for the admission facts (deterministic). */
function factsEqual(
  a: AdmissionCostFact | undefined,
  b: AdmissionCostFact,
): boolean {
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const destinations = load();
  const baseline = loadBaseline();
  const baselineSet = new Set(baseline);
  const byId = new Map(destinations.map((d) => [d.id, d]));

  // Recompute the authoritative transitional cohort.
  const cohortIds = new Set(
    destinations.filter(isTransitionalNumericUsed).map((d) => d.id),
  );
  const allBaselineTransitional = baseline.every((id) => cohortIds.has(id));
  const noneBaselineTransitional =
    baseline.every((id) => !cohortIds.has(id)) && cohortIds.size === 0;
  const partiallyMigrated =
    !allBaselineTransitional && !noneBaselineTransitional;

  // STATE C (partial/mixed): fail closed.
  if (partiallyMigrated) {
    const migrated = baseline.filter((id) => !cohortIds.has(id));
    const pending = baseline.filter((id) => cohortIds.has(id));
    throw new Error(
      `KAI-219B FAIL-CLOSED: mixed migration state — ${migrated.length} already migrated, ${pending.length} still transitional. Expected all-or-nothing (STATE A or STATE B).`,
    );
  }

  // STATE B: all already migrated — validate every baseline ID's fact
  // against the expected classifier; zero writes on success.
  if (noneBaselineTransitional) {
    const mismatches: string[] = [];
    for (const id of baseline) {
      const d = byId.get(id)!;
      const expected = buildExpectedFact(d, ticketEvidence[id]);
      if (!factsEqual(d.admission, expected)) {
        mismatches.push(id);
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: STATE B validation found ${mismatches.length} unexpected classification(s): ${mismatches.slice(0, 8).join(", ")}. Fix the facts or the classifier — no writes performed.`,
      );
    }
    console.log(
      `STATE B: all ${baseline.length} baseline IDs already carry the expected explicit KAI-219B facts — validated, no changes (zero diff).`,
    );
    return; // ZERO file changes.
  }

  // STATE A: all still transitional → migrate all 150.
  if (allBaselineTransitional) {
    const cohortIdsAll = new Set([...cohortIds]);
    const extra = [...cohortIdsAll].filter((id) => !baselineSet.has(id));
    if (extra.length > 0) {
      throw new Error(
        `KAI-219B FAIL-CLOSED: cohort has ${extra.length} ID(s) outside the frozen baseline (${extra.slice(0, 5).join(", ")}).`,
      );
    }

    const counts = {
      verified_paid: 0,
      verified_free: 0,
      not_applicable_hub: 0,
      not_applicable_free_area: 0,
      unavailable: 0,
    };
    for (const id of baseline) {
      const d = byId.get(id)!;
      const fact = buildExpectedFact(d, ticketEvidence[id]);
      d.admission = fact;
      const state = fact.state;
      if (state === "verified_paid") counts.verified_paid += 1;
      else if (state === "verified_free") counts.verified_free += 1;
      else if (state === "not_applicable") {
        if (fact.reasonCode === "hub_budget_not_applicable")
          counts.not_applicable_hub += 1;
        else counts.not_applicable_free_area += 1;
      } else counts.unavailable += 1;
    }

    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          state: "A",
          cohort: baseline.length,
          ...counts,
          sum:
            counts.verified_paid +
            counts.verified_free +
            counts.not_applicable_hub +
            counts.not_applicable_free_area +
            counts.unavailable,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Unreachable (both branches above return/throw).
  throw new Error("KAI-219B FAIL-CLOSED: unreachable state detection.");
}

// CLI entry — only when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  buildExpectedFact,
  factsEqual,
  isTransitionalNumericUsed,
  main as runMigration,
  SOURCE_BACKED_KINDS,
  FREE_EVIDENCE_KINDS,
  FREE_IDS,
  KITARO,
  COSMO,
  SPECIFIC_OVERRIDES,
};
