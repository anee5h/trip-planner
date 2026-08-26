/**
 * KAI-204 — deterministic catalogue on-site budget audit (Phase 1, refined).
 *
 * Classifies every catalogue record by on-site budget provenance state and
 * root cause, using ONLY committed repo data (no network, no mutations):
 *
 *   A. VERIFIED_SOURCE_BACKED     budgetMetadata.method=manual + numeric
 *   B. MODEL_DECLARED             budgetMetadata.method=model + numeric
 *   C. SOURCE_EXISTS_META_LOST    evidence ledger has a ticket price, but the
 *                                 record's metadata is unknown/absent (the
 *                                 source-backed price never reached the
 *                                 record, or provenance was lost)
 *   D. NUMERIC_WITHOUT_PROVENANCE numeric budget, no budgetMetadata, no ledger
 *   E. EXPLICIT_UNKNOWN           budgetMetadata.method=unknown, no numeric,
 *                                 no evidence, not hub (deliberate neutral)
 *   F. EXPLICIT_VERIFIED_FREE     evidence ledger says free (jpy=0)
 *   G. POSSIBLY_FREE_UNVERIFIED   free-looking category/tag, no ledger proof
 *   H. GENUINE_UNKNOWN            no metadata, no numeric, no evidence
 *   I. NOT_APPLICABLE             hub/ward/town/village (no single admission
 *                                 product, class convention)
 *   J. MALFORMED_INCONSISTENT     numeric + unknown metadata, invalid method,
 *                                 or broken ranges
 *
 * Deterministic: sorted output, no timestamps, no randomness. Run twice and
 * the bytes are identical.
 *
 * Run:
 *   npx tsx scripts/qa/kai-204-onsite-budget-audit.ts        (human report)
 *   npx tsx scripts/qa/kai-204-onsite-budget-audit.ts --json (machine JSON)
 */

import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../../src/shared/types/destination";

const rootDir = process.cwd();
const indexPath = path.join(rootDir, "src/shared/data/destinations-index.json");
const truthPath = path.join(
  rootDir,
  "scripts/audit/kai-89-calibration-truth.json",
);

type Method = "manual" | "model" | "unknown" | "legacy";
type AuditClass =
  | "A_VERIFIED_SOURCE_BACKED"
  | "B_MODEL_DECLARED"
  | "C_SOURCE_EXISTS_META_LOST"
  | "D_NUMERIC_WITHOUT_PROVENANCE"
  | "E_EXPLICIT_UNKNOWN"
  | "F_EXPLICIT_VERIFIED_FREE"
  | "G_POSSIBLY_FREE_UNVERIFIED"
  | "H_GENUINE_UNKNOWN"
  | "I_NOT_APPLICABLE"
  | "J_MALFORMED_INCONSISTENT"
  | "K_LEGACY_UNVERIFIED";

interface EvidenceEntry {
  jpy?: number;
  source?: string[];
  kind?: string;
  evidence?: string;
}

const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const truth = JSON.parse(fs.readFileSync(truthPath, "utf8")) as {
  trusted?: { budget?: string[] };
  ticketEvidence?: Record<string, EvidenceEntry>;
};

const ticket = truth.ticketEvidence ?? {};
const trustedBudget = new Set(truth.trusted?.budget ?? []);
const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function hasNumericBudget(d: Destination): boolean {
  return [d.budgetMin, d.budgetMax, d.budgetRecommended].some(
    isFiniteNonNegative,
  );
}

function hasBreakdown(d: Destination): boolean {
  return Boolean(
    d.budgetBreakdown &&
    ["transport", "tickets", "food", "cafe"].every((k) =>
      isFiniteNonNegative((d.budgetBreakdown as Record<string, unknown>)[k]),
    ),
  );
}

function hasValidRange(d: Destination): boolean {
  return (
    isFiniteNonNegative(d.budgetMin) &&
    isFiniteNonNegative(d.budgetMax) &&
    d.budgetMin! <= d.budgetMax!
  );
}

function isHub(d: Destination): boolean {
  return HUB_KINDS.has(d.kind ?? "") || d.role === "hub";
}

function looksFreeUnverified(d: Destination): boolean {
  const hay = [
    ...(d.categories ?? []),
    ...(d.tags ?? []),
    d.description ?? "",
    d.name ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return /(^|\s)(free|no admission|no entrance fee|free entry|public access|open access|free observatory)(\s|$|,)/.test(
    hay,
  );
}

interface Record {
  id: string;
  cls: AuditClass;
  reason: string;
  metadata?: Method | "absent";
  numeric: boolean;
  ledger?: EvidenceEntry;
}

const records: Record[] = [];

for (const d of destinations) {
  const bm = d.budgetMetadata;
  const method = (bm?.method ?? "absent") as Method | "absent";
  const numeric = hasNumericBudget(d);
  const breakdown = hasBreakdown(d);
  const range = hasValidRange(d);
  const ev = ticket[d.id];
  const hub = isHub(d);

  let cls: AuditClass;
  let reason: string;

  if (bm && !["manual", "model", "unknown", "legacy"].includes(bm.method)) {
    cls = "J_MALFORMED_INCONSISTENT";
    reason = `invalid budgetMetadata.method '${bm.method}'`;
  } else if (numeric && method === "unknown") {
    cls = "J_MALFORMED_INCONSISTENT";
    reason =
      "numeric budget values coexist with authoritative unknown metadata";
  } else if (numeric && !range && !breakdown) {
    cls = "J_MALFORMED_INCONSISTENT";
    reason = `invalid range min=${d.budgetMin} max=${d.budgetMax} without breakdown`;
  } else if (method === "manual") {
    cls =
      numeric || breakdown
        ? "A_VERIFIED_SOURCE_BACKED"
        : "J_MALFORMED_INCONSISTENT";
    reason =
      numeric || breakdown
        ? `manual provenance: ${bm?.basis ?? "no basis"}`
        : "manual metadata but no numeric budget or breakdown";
  } else if (ev?.jpy === 0) {
    // F. explicit verified free (ledger proof), regardless of metadata state.
    // NOTE: "free" means admission is free (tickets=0); discretionary
    // components (food/transport) may still carry legacy values — that is
    // accepted debt, not a fabricated free claim.
    cls = "F_EXPLICIT_VERIFIED_FREE";
    reason = `ledger verified free: ${ev.kind ?? "?"}${ev.evidence ? ` — ${ev.evidence}` : ""}${method !== "absent" ? `; metadata=${method}` : "; metadata absent"}`;
  } else if (ev) {
    // C. source-backed price exists in ledger but metadata is unknown/absent.
    cls = "C_SOURCE_EXISTS_META_LOST";
    reason = `ledger jpy=${ev.jpy} (${ev.kind ?? "?"}) but metadata ${method}: ${ev.evidence ?? "no evidence text"}`;
  } else if (method === "model") {
    cls = "B_MODEL_DECLARED";
    reason = `model ${bm?.modelVersion ?? "?"} confidence ${bm?.confidence ?? "?"}: ${bm?.basis ?? "no basis"}`;
  } else if (method === "unknown") {
    if (looksFreeUnverified(d)) {
      cls = "G_POSSIBLY_FREE_UNVERIFIED";
      reason =
        "unknown metadata, free-looking description/category/tag, no ledger evidence";
    } else if (hub) {
      cls = "I_NOT_APPLICABLE";
      reason =
        "hub/ward/town/village with no admission product (class convention), explicit unknown";
    } else {
      cls = "E_EXPLICIT_UNKNOWN";
      reason = `explicit unknown (${bm?.basis ?? "no basis"})`;
    }
  } else if (method === "legacy") {
    // K_LEGACY_UNVERIFIED: numeric values with explicit legacy provenance —
    // numbers preserved in storage but NOT trustworthy for consumption.
    cls = "K_LEGACY_UNVERIFIED";
    reason = `legacy numeric budget without recoverable provenance: ${bm?.basis ?? "no basis"}`;
  } else {
    // absent metadata
    if (numeric || breakdown) {
      cls = "D_NUMERIC_WITHOUT_PROVENANCE";
      reason = "numeric budget without any provenance metadata";
    } else if (looksFreeUnverified(d)) {
      cls = "G_POSSIBLY_FREE_UNVERIFIED";
      reason =
        "absent metadata, free-looking description/category/tag, no ledger evidence";
    } else if (hub) {
      cls = "I_NOT_APPLICABLE";
      reason =
        "hub/ward/town/village no single admission product; no numeric budget";
    } else {
      cls = "H_GENUINE_UNKNOWN";
      reason =
        "no metadata, no numeric budget, no ledger evidence, not free-looking, not hub";
    }
  }

  records.push({
    id: d.id,
    cls,
    reason,
    metadata: method,
    numeric,
    ledger: ev,
  });
}

// ---- Aggregate ----
const byClass = new Map<AuditClass, Record[]>();
for (const r of records) {
  const arr = byClass.get(r.cls) ?? [];
  arr.push(r);
  byClass.set(r.cls, arr);
}
const classOrder: AuditClass[] = [
  "A_VERIFIED_SOURCE_BACKED",
  "B_MODEL_DECLARED",
  "C_SOURCE_EXISTS_META_LOST",
  "D_NUMERIC_WITHOUT_PROVENANCE",
  "E_EXPLICIT_UNKNOWN",
  "F_EXPLICIT_VERIFIED_FREE",
  "G_POSSIBLY_FREE_UNVERIFIED",
  "H_GENUINE_UNKNOWN",
  "I_NOT_APPLICABLE",
  "J_MALFORMED_INCONSISTENT",
  "K_LEGACY_UNVERIFIED",
];

const baseline = {
  total: destinations.length,
  manual: records.filter((r) => r.metadata === "manual").length,
  model: records.filter((r) => r.metadata === "model").length,
  unknown: records.filter((r) => r.metadata === "unknown").length,
  legacy: records.filter((r) => r.metadata === "legacy").length,
  absent: records.filter((r) => r.metadata === "absent").length,
  invalid: records.filter((r) => r.cls === "J_MALFORMED_INCONSISTENT").length,
};

// Root-cause grouping for the 470 unknown (Phase 2): group by the model's
// clear-to-unknown basis, plus ledger/free/hub overrides.
const unknownRecords = records.filter((r) => r.metadata === "unknown");
const unknownRootCauses: Record<string, number> = {};
const unknownRootCauseSamples: Record<string, string[]> = {};
for (const r of unknownRecords) {
  let cause: string;
  if (r.cls === "C_SOURCE_EXISTS_META_LOST")
    cause = "LEDGER_HAS_PRICE_META_UNKNOWN";
  else if (r.cls === "F_EXPLICIT_VERIFIED_FREE") cause = "LEDGER_VERIFIED_FREE";
  else if (r.cls === "G_POSSIBLY_FREE_UNVERIFIED")
    cause = "FREE_LOOKING_UNVERIFIED";
  else if (r.cls === "I_NOT_APPLICABLE") cause = "HUB_NO_ADMISSION_CLASS";
  else {
    const basis =
      destinations.find((x) => x.id === r.id)?.budgetMetadata?.basis ?? "";
    if (/no source-verified admission|UNKNOWN_NOT_FREE/.test(basis))
      cause = "NO_SOURCE_ADMISSION_CLEARED";
    else if (/peer cell .* < 5|dispersion too high/.test(basis))
      cause = "INSUFFICIENT_PEER_CELL";
    else cause = `OTHER: ${basis.slice(0, 60)}`;
  }
  unknownRootCauses[cause] = (unknownRootCauses[cause] ?? 0) + 1;
  (unknownRootCauseSamples[cause] ??= []).push(r.id);
}

const absentRecords = records.filter((r) => r.metadata === "absent");
const absentRootCauses: Record<string, number> = {};
const absentRootCauseSamples: Record<string, string[]> = {};
for (const r of absentRecords) {
  let cause: string;
  if (r.cls === "C_SOURCE_EXISTS_META_LOST")
    cause = "LEDGER_HAS_PRICE_META_ABSENT";
  else if (r.cls === "F_EXPLICIT_VERIFIED_FREE") cause = "LEDGER_VERIFIED_FREE";
  else if (r.cls === "D_NUMERIC_WITHOUT_PROVENANCE")
    cause = "NUMERIC_LEGACY_UNTAGGED";
  else if (r.cls === "G_POSSIBLY_FREE_UNVERIFIED")
    cause = "FREE_LOOKING_UNVERIFIED";
  else if (r.cls === "I_NOT_APPLICABLE") cause = "HUB_NO_ADMISSION_CLASS";
  else if (r.cls === "H_GENUINE_UNKNOWN") cause = "NO_DATA_NO_EVIDENCE";
  else cause = r.cls;
  absentRootCauses[cause] = (absentRootCauses[cause] ?? 0) + 1;
  (absentRootCauseSamples[cause] ??= []).push(r.id);
}

const report = {
  baseline,
  classCounts: Object.fromEntries(
    classOrder
      .filter((c) => byClass.has(c))
      .map((c) => [c, byClass.get(c)!.length]),
  ),
  classes: Object.fromEntries(
    classOrder
      .filter((c) => byClass.has(c))
      .map((c) => [
        c,
        byClass.get(c)!.map((r) => ({ id: r.id, reason: r.reason })),
      ]),
  ),
  unknownRootCauses,
  absentRootCauses,
  verifiedFree: records
    .filter((r) => r.ledger?.jpy === 0)
    .map((r) => ({
      id: r.id,
      metadata: r.metadata,
      kind: r.ledger?.kind ?? "?",
      source: r.ledger?.source ?? [],
    })),
  numericWithoutProvenance: records
    .filter((r) => r.cls === "D_NUMERIC_WITHOUT_PROVENANCE")
    .map((r) => ({ id: r.id })),
  trustedCalibrationIds: {
    unknown: records
      .filter((r) => r.metadata === "unknown" && trustedBudget.has(r.id))
      .map((r) => r.id),
    absent: records
      .filter((r) => r.metadata === "absent" && trustedBudget.has(r.id))
      .map((r) => r.id),
  },
  hubs: {
    total: destinations.filter(isHub).length,
    withMetadata: destinations.filter((d) => isHub(d) && d.budgetMetadata)
      .length,
    unknown: destinations.filter(
      (d) => isHub(d) && d.budgetMetadata?.method === "unknown",
    ).length,
    model: destinations.filter(
      (d) => isHub(d) && d.budgetMetadata?.method === "model",
    ).length,
    absent: destinations.filter((d) => isHub(d) && !d.budgetMetadata).length,
    manual: destinations.filter(
      (d) => isHub(d) && d.budgetMetadata?.method === "manual",
    ).length,
  },
};

const out = JSON.stringify(report, null, 2);
if (process.argv.includes("--json")) {
  process.stdout.write(`${out}\n`);
} else {
  console.log("KAI-204 catalogue on-site budget audit");
  console.log("=======================================");
  console.log(`total: ${baseline.total}`);
  console.log(
    `manual: ${baseline.manual}  model: ${baseline.model}  unknown: ${baseline.unknown}  legacy: ${baseline.legacy}  absent: ${baseline.absent}  invalid: ${baseline.invalid}`,
  );
  console.log("\nclass counts:");
  for (const c of classOrder) {
    if (report.classCounts[c] !== undefined) {
      console.log(`  ${c}: ${report.classCounts[c]}`);
    }
  }
  console.log("\nunknown root causes:");
  for (const [k, v] of Object.entries(unknownRootCauses))
    console.log(`  ${k}: ${v}`);
  console.log("\nabsent root causes:");
  for (const [k, v] of Object.entries(absentRootCauses))
    console.log(`  ${k}: ${v}`);
  console.log("\nverified free (ledger jpy=0):", report.verifiedFree.length);
  console.log(
    "numeric without provenance:",
    report.numericWithoutProvenance.length,
  );
  console.log(
    "trusted-calibration with unknown metadata:",
    report.trustedCalibrationIds.unknown.length,
  );
  console.log(
    "trusted-calibration with absent metadata:",
    report.trustedCalibrationIds.absent.length,
  );
  console.log("\nhubs:", JSON.stringify(report.hubs));
}
