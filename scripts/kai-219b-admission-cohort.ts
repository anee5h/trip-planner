/**
 * KAI-219B — first deterministic admission cohort.
 *
 * Migrates the 150 records currently on trusted-transitional numeric
 * admission to EXPLICIT KAI-218 admission facts, reusing ONLY committed
 * evidence (kai-89 calibration truth + budgetMetadata basis + peer-cell
 * model output). NO new research; NO fabricated sources.
 *
 * Cohort design (all defensible from committed data):
 *   - 34 manual paid  → verified_paid (bounded from kai-89 ledger jpy,
 *     sourceUrls from ledger, checkedAt = ledger generatedAt 2026-08-14)
 *   - 3 manual free   → verified_free (farm-tomita, ikebukuro-toshima,
 *     odaiba-minato — ledger FREE_ENTRY/LEDGER_VERIFIED free basis;
 *     sourceUrls from ledger or officialWebsite)
 *   - 1 manual mixed  → not_applicable + free_area_with_optional_paid_
 *     components (kitaro-chaya — free entry, paid purchases)
 *   - 106 city hubs   → not_applicable + hub_budget_not_applicable
 *     (no single admission product; ¥0 is the hub class convention)
 *   - 5 non-city model→ documented_estimate (model provenance, bounded
 *     from the committed peer-cell tickets value)
 *   - 1 model artifact→ unavailable + legacy_provenance_unrecovered
 *     (yokohama-cosmo-world: peer-cell ¥0 is a class artifact for a paid
 *     park — must NOT become a fake verified ¥0)
 *
 * Run: npx tsx scripts/kai-219b-admission-cohort.ts
 * Then: npm run sync-destination-details
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Destination } from "../src/shared/types/destination";

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

const destinations = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf8"),
) as Destination[];

// The 150 cohort ids (trusted-transitional numeric admission).
const cohortIds = new Set<string>();
for (const d of destinations) {
  // Recompute the audit's transitional_legacy_numeric_used membership:
  // absent admission fact + trusted/trusted_estimate KAI-214 state +
  // a valid numeric legacy ticket consumed via the projection.
  const bm = d.budgetMetadata;
  const method = bm?.method;
  const trusted = method === "manual" || method === "model";
  const tickets = d.budgetBreakdown?.tickets;
  if (
    !d.admission &&
    trusted &&
    typeof tickets === "number" &&
    Number.isFinite(tickets)
  ) {
    cohortIds.add(d.id);
  }
}
console.log("cohort size (recomputed):", cohortIds.size);

// Deterministic per-record classification.
const HUB_REASON = "hub_budget_not_applicable";
const FREE_AREA_REASON = "free_area_with_optional_paid_components";
const FREE_IDS = new Set(["farm-tomita", "ikebukuro-toshima", "odaiba-minato"]);
const KITARO_CHAYA = "kitaro-chaya";
const COSMO_WORLD = "yokohama-cosmo-world";

let verifiedPaid = 0;
let verifiedFree = 0;
let notApplicableHub = 0;
let notApplicableFreeArea = 0;
let documentedEstimate = 0;
let unavailable = 0;

function makeVerifiedPaid(
  d: Destination,
  ev: { jpy: number; source?: string[] },
) {
  verifiedPaid += 1;
  return {
    state: "verified_paid" as const,
    provenance: "verified_source" as const,
    cost: { kind: "bounded" as const, min: ev.jpy, max: ev.jpy },
    scope: "general_entry" as const,
    basis: `Verified admission ¥${ev.jpy} (ledger ${ev.kind}); source: ${(ev.source || []).join(", ")}`,
    sourceUrls: ev.source?.length
      ? ev.source
      : d.officialWebsite
        ? [d.officialWebsite]
        : [],
    checkedAt: CHECKED_AT,
    reviewIntervalMonths: 12,
  };
}

for (const d of destinations) {
  if (!cohortIds.has(d.id)) continue;
  const bm = d.budgetMetadata;
  const tickets = d.budgetBreakdown?.tickets;
  const ev = ticketEvidence[d.id];

  if (d.id === KITARO_CHAYA) {
    notApplicableFreeArea += 1;
    d.admission = {
      state: "not_applicable",
      provenance: "verified_source",
      reasonCode: FREE_AREA_REASON,
      cost: { kind: "not_applicable" },
      scope: "open_area",
      basis:
        "Free entry; purchases variable (ledger FREE_ENTRY_PURCHASES_VARIABLE)",
      sourceUrls: [d.officialWebsite].filter(Boolean) as string[],
      checkedAt: CHECKED_AT,
    };
    continue;
  }
  if (d.id === COSMO_WORLD) {
    // Peer-cell ¥0 is a class artifact for a paid amusement park — the
    // honest classification is unavailable (never a fake verified ¥0).
    unavailable += 1;
    d.admission = {
      state: "unavailable",
      provenance: "none",
      reasonCode: "legacy_provenance_unrecovered",
      cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
      scope: "general_entry",
      basis:
        "Peer-cell ¥0 is a class artifact for a paid attraction; no source-verified admission",
    };
    continue;
  }
  if (d.kind === "city" || bm?.method === "model") {
    if (bm?.method === "manual") {
      // Manual non-city paid → verified_paid via ledger.
      if (ev) {
        d.admission = makeVerifiedPaid(d, ev);
      } else {
        unavailable += 1;
        d.admission = {
          state: "unavailable",
          provenance: "none",
          reasonCode: "legacy_provenance_unrecovered",
          cost: {
            kind: "unavailable",
            reason: "legacy_provenance_unrecovered",
          },
          scope: "general_entry",
          basis: "No ledger evidence for this manual record",
        };
      }
      continue;
    }
    // Model method: city hubs → not_applicable; non-city model with real
    // tickets → documented_estimate; else unavailable.
    if (d.kind === "city") {
      notApplicableHub += 1;
      d.admission = {
        state: "not_applicable",
        provenance: "none",
        reasonCode: HUB_REASON,
        cost: { kind: "not_applicable" },
        scope: "general_entry",
        basis: "City hub — no single admission product (hub class convention)",
      };
      continue;
    }
    if (typeof tickets === "number" && tickets > 0) {
      documentedEstimate += 1;
      d.admission = {
        state: "documented_estimate",
        provenance: "model",
        cost: { kind: "bounded", min: tickets, max: tickets },
        scope: "general_entry",
        basis: `Peer-cell model estimate (${bm?.basis ?? "budget-model-v1"})`,
      };
      continue;
    }
    unavailable += 1;
    d.admission = {
      state: "unavailable",
      provenance: "none",
      reasonCode: "legacy_provenance_unrecovered",
      cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
      scope: "general_entry",
      basis: "Peer-cell model produced no defensible admission value",
    };
    continue;
  }
  // Manual non-city records (museums/parks/gardens/towers/castles).
  if (FREE_IDS.has(d.id)) {
    verifiedFree += 1;
    d.admission = {
      state: "verified_free",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 0, max: 0 },
      scope: d.id === "farm-tomita" ? "whole_area" : "general_entry",
      basis: `Free admission (ledger ${ev?.kind ?? "LEDGER_VERIFIED"})`,
      sourceUrls: ev?.source?.length
        ? ev.source
        : d.officialWebsite
          ? [d.officialWebsite]
          : [],
      checkedAt: CHECKED_AT,
    };
    continue;
  }
  if (ev && typeof ev.jpy === "number" && ev.jpy > 0) {
    d.admission = makeVerifiedPaid(d, ev);
    continue;
  }
  // Manual record with ¥0 but no free evidence → not applicable to
  // verified_free; keep honest unavailable (never a fake free).
  unavailable += 1;
  d.admission = {
    state: "unavailable",
    provenance: "none",
    reasonCode: "legacy_provenance_unrecovered",
    cost: { kind: "unavailable", reason: "legacy_provenance_unrecovered" },
    scope: "general_entry",
    basis: "Legacy ¥0 without verified-free evidence",
  };
}

fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      cohort: cohortIds.size,
      verified_paid: verifiedPaid,
      verified_free: verifiedFree,
      not_applicable_hub: notApplicableHub,
      not_applicable_free_area: notApplicableFreeArea,
      documented_estimate: documentedEstimate,
      unavailable: unavailable,
      sum:
        verifiedPaid +
        verifiedFree +
        notApplicableHub +
        notApplicableFreeArea +
        documentedEstimate +
        unavailable,
    },
    null,
    2,
  ),
);
