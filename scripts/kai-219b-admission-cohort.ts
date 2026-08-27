/**
 * KAI-219B — first deterministic admission cohort (review-repair v2).
 *
 * Migrates the 150 records on trusted-transitional numeric admission to
 * EXPLICIT KAI-218 admission facts, reusing ONLY committed evidence.
 *
 * Review-repair changes (v2):
 *   - Cohort detection uses the AUTHORITATIVE KAI-219A transition
 *     semantics (normalizeBudgetState + getEffectiveBudgetBreakdown) — NOT
 *     an approximation via method/numeric-tickets.
 *   - The intended 150-ID baseline cohort is FROZEN; the script asserts
 *     exact ID-set equality with it and FAILS LOUDLY otherwise.
 *   - Evidence hierarchy respected: destination-specific official/
 *     source-backed fact > defensible bounded model > unavailable. The 5
 *     non-city model records have kai-89 SOURCE-BACKED evidence
 *     (FIXED_PAID / FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL with official
 *     URLs) → promoted to verified_paid, NOT documented_estimate [X,X]
 *     from a peer-cell scalar. sannai-maruyama's committed notes say
 *     ¥500 adult (since Apr 2019) → ¥500, not the ¥410 peer-cell value.
 *   - yokohama-cosmo-world: official free entry + paid individual
 *     attractions → not_applicable + free_area_with_optional_paid_
 *     components (kai-89 FREE_ENTRY_PAY_PER_RIDE), NOT unavailable.
 *   - verified-paid promotion asserts the kai-89 evidence kind is
 *     source-backed and has a non-empty source URL; verified-free asserts
 *     the free evidence; kitaro asserts FREE_ENTRY_PURCHASES_VARIABLE.
 *     The script FAILS CLOSED when committed evidence no longer matches.
 *
 * Run: npx tsx scripts/kai-219b-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Destination } from "../src/shared/types/destination";
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
const FREE_EVIDENCE_KINDS = new Set([
  "FREE_ENTRY",
  "LEDGER_VERIFIED", // only when the record basis says free
]);

/** FROZEN KAI-219A baseline cohort (the 150 trusted-transitional records). */
const BASELINE_COHORT: string[] = [
  // 34 manual paid + 3 manual free + 1 kitaro + 106 hubs + 5 model + 1 cosmo
  // (full list computed from main@71d37f17; the script asserts equality)
];

// The intended cohort is loaded from the KAI-219A baseline audit output
// committed in the repo (scripts/audit/kai-219-baseline-cohort.json), so
// the script never approximates it.
const BASELINE_PATH = path.resolve(
  process.cwd(),
  "scripts/audit/kai-219-baseline-cohort.json",
);

function load(): Destination[] {
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Destination[];
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

function main() {
  const destinations = load();

  // 1. Recompute the cohort with the authoritative semantics.
  const cohortIds = new Set(
    destinations.filter(isTransitionalNumericUsed).map((d) => d.id),
  );

  // 2. Assert exact ID-set equality with the frozen baseline.
  let baseline: string[] = [];
  if (fs.existsSync(BASELINE_PATH)) {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as string[];
  }
  if (baseline.length === 0) {
    throw new Error(
      "KAI-219B FAIL-CLOSED: baseline cohort file missing (scripts/audit/kai-219-baseline-cohort.json). Refusing to migrate without the frozen 150-ID baseline.",
    );
  }
  const baselineSet = new Set(baseline);
  const extra = [...cohortIds].filter((id) => !baselineSet.has(id));
  const missing = baseline.filter((id) => !cohortIds.has(id));
  if (extra.length > 0 || missing.length > 0) {
    throw new Error(
      `KAI-219B FAIL-CLOSED: cohort mismatch vs frozen baseline. ` +
        `extra=${extra.length} (${extra.slice(0, 5).join(", ")}), ` +
        `missing=${missing.length} (${missing.slice(0, 5).join(", ")}). ` +
        `Expected exactly ${baseline.length} records.`,
    );
  }
  console.log("cohort (authoritative, == baseline):", cohortIds.size);

  // 3. Per-record classification (evidence hierarchy; fail-closed).
  const FREE_IDS = new Set([
    "farm-tomita",
    "ikebukuro-toshima",
    "odaiba-minato",
  ]);
  const KITARO = "kitaro-chaya";
  const COSMO = "yokohama-cosmo-world";
  // Destination-specific source-backed overrides (from committed notes /
  // editorial; the source hierarchy ranks these ABOVE the peer-cell).
  const SPECIFIC_OVERRIDES: Record<string, { jpy: number; evidence: string }> =
    {
      // notes: "Site-wide viewing fee ¥500 adult since April 2019" (official)
      "sannai-maruyama-jomon-aomori": {
        jpy: 500,
        evidence:
          "Committed notes state site-wide adult viewing fee ¥500 (since Apr 2019); official site",
      },
    };

  let counts = {
    verified_paid: 0,
    verified_free: 0,
    not_applicable_hub: 0,
    not_applicable_free_area: 0,
    unavailable: 0,
  };

  for (const d of destinations) {
    if (!cohortIds.has(d.id)) continue;
    const ev = ticketEvidence[d.id];

    // Kitaro: free entry + paid purchases (ledger FREE_ENTRY_PURCHASES_VARIABLE).
    if (d.id === KITARO) {
      if (!ev || ev.kind !== "FREE_ENTRY_PURCHASES_VARIABLE") {
        throw new Error(
          `KAI-219B FAIL-CLOSED: kitaro-chaya no longer has FREE_ENTRY_PURCHASES_VARIABLE evidence (got ${ev?.kind ?? "none"}).`,
        );
      }
      counts.not_applicable_free_area += 1;
      d.admission = {
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
      continue;
    }

    // Cosmo World: free entry + paid individual attractions (official).
    if (d.id === COSMO) {
      if (!ev || ev.kind !== "FREE_ENTRY_PAY_PER_RIDE") {
        throw new Error(
          `KAI-219B FAIL-CLOSED: yokohama-cosmo-world no longer has FREE_ENTRY_PAY_PER_RIDE evidence (got ${ev?.kind ?? "none"}).`,
        );
      }
      counts.not_applicable_free_area += 1;
      d.admission = {
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
      continue;
    }

    // City hubs → not_applicable (hub class convention).
    if (d.kind === "city") {
      counts.not_applicable_hub += 1;
      d.admission = {
        state: "not_applicable",
        provenance: "none",
        reasonCode: "hub_budget_not_applicable",
        cost: { kind: "not_applicable" },
        scope: "general_entry",
        basis: "City hub — no single admission product (hub class convention)",
      };
      continue;
    }

    // Manual free (ledger free basis).
    if (FREE_IDS.has(d.id)) {
      if (!ev || !FREE_EVIDENCE_KINDS.has(ev.kind)) {
        throw new Error(
          `KAI-219B FAIL-CLOSED: ${d.id} no longer has free ledger evidence (got ${ev?.kind ?? "none"}).`,
        );
      }
      counts.verified_free += 1;
      d.admission = {
        state: "verified_free",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: d.id === "farm-tomita" ? "whole_area" : "general_entry",
        basis: `Free admission (ledger ${ev.kind})`,
        sourceUrls: ev.source?.length
          ? ev.source
          : ([d.officialWebsite].filter(Boolean) as string[]),
        checkedAt: CHECKED_AT,
      };
      continue;
    }

    // Source-backed paid: kai-89 evidence with an allowed kind + URL, or a
    // destination-specific override (sannai). Evidence hierarchy: this
    // beats the peer-cell scalar.
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
      counts.verified_paid += 1;
      d.admission = {
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
      continue;
    }

    // No source-backed evidence: an explicit defensible range would require
    // new research — keep honest unavailable (never [X,X] from a scalar).
    counts.unavailable += 1;
    d.admission = {
      state: "unavailable",
      provenance: "none",
      reasonCode: "legacy_provenance_unrecovered",
      cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
      scope: "general_entry",
      basis: "No source-backed admission evidence in committed data",
    };
  }

  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        cohort: cohortIds.size,
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
}

main();
