/**
 * Read-only opening-hours audit for the destination catalogue.
 * Faithful to OpeningHoursPolicy.ts semantics (verified/sourced/stale/
 * unverified/not_required). Stable output: no timestamps, sorted IDs.
 * ALL time evaluation uses the single pinned AUDIT_NOW clock below, so
 * rerunning against the same catalogue is byte-identical — verification
 * that ages past the freshness window only shows up after a deliberate
 * AUDIT_NOW bump.
 * Usage: npx tsx scripts/audit/audit-opening-hours.ts [outdir]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import destinations from "../../src/shared/data/destinations-index.json";
import {
  getOpeningHoursAssessment,
  type OpeningHoursStatus,
} from "../../src/shared/services/recommendation/OpeningHoursPolicy";

const AUDIT_NOW = new Date("2026-09-05T00:00:00Z");

interface Recruitment {
  id: string;
  name: string;
  kind: string;
  status: OpeningHoursStatus;
  businessHours?: string;
  reason: string;
}

const list = (
  Array.isArray(destinations) ? destinations : Object.values(destinations)
) as Array<{
  id: string;
  name: string;
  kind?: string;
  role?: string;
  businessHours?: string;
  openingHours?: string;
  openingHoursMetadata?: { verifiedAt?: string; sourceUrl?: string };
  officialWebsite?: string;
}>;

const STATUS_ORDER: OpeningHoursStatus[] = [
  "verified",
  "sourced",
  "stale",
  "unverified",
  "not_required",
];

const rows = list
  .map((d) => ({ d, a: getOpeningHoursAssessment(d as never, AUDIT_NOW) }))
  .map(({ d, a }) => ({
    id: d.id,
    name: d.name,
    kind: d.kind ?? "(none)",
    status: a.status,
    displayText: a.displayText,
    hoursRaw: d.businessHours ?? d.openingHours,
    hasHours: Boolean(d.businessHours || d.openingHours),
    openingHoursMetadata: d.openingHoursMetadata,
    businessHoursRaw: Boolean(d.businessHours),
    openingHoursRaw: Boolean(d.openingHours),
    hasMeta: Boolean(d.openingHoursMetadata),
    metaSourceUrl: Boolean(d.openingHoursMetadata?.sourceUrl),
    officialWebsite: Boolean(d.officialWebsite),
  }));

const OPEN_AREA_KINDS = new Set([
  "nature",
  "beach",
  "lake",
  "park",
  "mountain",
  "viewpoint",
  "waterfall",
  "island",
  "cape",
  "cliff",
  "rock_formation",
  "onsen",
  "district",
  "street",
  "ward",
  "town",
  "village",
  "historic",
  "historic_town",
  "garden",
  "bridge",
  "entertainment",
]);
const SPECIFIC_WINDOW = /^\d{1,2}:\d{2}\s*[-\u2013\u2014]\s*\d{1,2}:\d{2}/;

const suspiciousCohort: Recruitment[] = [];
const nonsenseCohort: Recruitment[] = [];
const NO_VALID_ACCESS_KINDS = new Set([
  "street",
  "district",
  "ward",
  "town",
  "historic_town",
  "nature",
  "onsen",
  "lake",
  "island",
  "mountain",
  "beach",
  "cape",
  "cliff",
  "rock_formation",
  "waterfall",
  "bridge",
  "village",
]);

function hasFreshMetadata(
  d: {
    openingHoursMetadata?: { sourceUrl?: string; verifiedAt?: string };
  },
  now: Date = AUDIT_NOW,
): boolean {
  const meta = d.openingHoursMetadata;
  if (!meta?.sourceUrl || !meta.verifiedAt) return false;
  const date = new Date(meta.verifiedAt);
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime())
    return false;
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) <= 180;
}

for (const r of rows) {
  const hoursText = r.hoursRaw ?? "";
  if (
    OPEN_AREA_KINDS.has(r.kind) &&
    hoursText &&
    SPECIFIC_WINDOW.test(hoursText) &&
    !hasFreshMetadata(r) &&
    r.status !== "not_required"
  ) {
    suspiciousCohort.push({
      ...r,
      reason: "specific-window hours on open-area kind, no fresh metadata",
    });
  }
  if (
    NO_VALID_ACCESS_KINDS.has(r.kind) &&
    hoursText &&
    SPECIFIC_WINDOW.test(hoursText) &&
    r.status !== "not_required"
  ) {
    nonsenseCohort.push({
      ...r,
      reason: "blanket window semantically invalid for kind",
    });
  }
}

const statusCounts = Object.fromEntries(
  STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length]),
) as Record<OpeningHoursStatus, number>;

const sorted = (arr: unknown[]) =>
  [...arr].sort((a, b) => String(a).localeCompare(String(b)));

const report = {
  schemaVersion: "1.0.0",
  auditNow: AUDIT_NOW.toISOString(),
  generatedAt: AUDIT_NOW.toISOString(),
  input: {
    canonical: "src/shared/data/destinations-index.json",
    sha256: createHash("sha256")
      .update(readFileSync("src/shared/data/destinations-index.json"))
      .digest("hex"),
    records: rows.length,
  },
  statusDistribution: statusCounts,
  fields: {
    withBusinessHours: rows.filter((r) => r.businessHoursRaw).length,
    withOpeningHours: rows.filter((r) => r.openingHoursRaw).length,
    withOpeningHoursMetadata: rows.filter((r) => r.hasMeta).length,
    withMetaSourceUrl: rows.filter((r) => r.metaSourceUrl).length,
    withOfficialWebsite: rows.filter((r) => r.officialWebsite).length,
  },
  findings: {
    suspiciousCohort: suspiciousCohort.length,
    nonsenseCohort: nonsenseCohort.length,
  },
  cohorts: {
    suspicious: sorted(suspiciousCohort.map((c) => c.id)),
    nonsense: sorted(nonsenseCohort.map((c) => c.id)),
    verified: sorted(
      rows.filter((r) => r.status === "verified").map((r) => r.id),
    ),
    unverifiedWithHours: sorted(
      rows
        .filter((r) => r.status === "unverified" && r.hasHours)
        .map((r) => r.id),
    ),
  },
  systemicCauses: [
    "no validator in the CI chain checks businessHours/openingHours shape, kind fit, or verification metadata",
    "sourced status is granted for any officialWebsite presence, conflating link presence with hours evidence",
    `${rows.filter((r) => r.hasHours && !r.hasMeta).length} records carry hours with no openingHoursMetadata, leaving status unverified with no stale/verified distinction`,
    "destination detail page renders raw businessHours as a fact with no unverified caveat (plan widget is honest; detail page is not)",
  ],
  residualLedger: {
    needsSourceBackedCheck: rows.filter(
      (r) => r.status === "unverified" && r.hasHours && !r.hasMeta,
    ).length,
    noHoursAtAll: rows.filter((r) => !r.hasHours && r.status !== "not_required")
      .length,
  },
};

// All report numbers below are computed from the audit rows — no
// hard-coded counts that can drift from the actual ledger.
const unverifiedWithHoursCount = rows.filter(
  (r) => r.status === "unverified" && r.hasHours,
).length;
const notFreshPercentage =
  report.input.records === 0
    ? 0
    : ((report.input.records - statusCounts.verified) / report.input.records) *
      100;

const md = [
  "# Opening-hours data audit (canonical catalogue)",
  "",
  `- Baseline: \`${report.input.sha256.slice(0, 12)}\` (${report.input.records} records, ${report.input.canonical})`,
  `- Audit clock: ${report.auditNow} (single pinned \`AUDIT_NOW\` — reruns are byte-identical against the same catalogue)`,
  `- Status distribution: ${STATUS_ORDER.map((s) => `${s}=${statusCounts[s]}`).join(", ")}`,
  `- Fields: businessHours=${report.fields.withBusinessHours}, openingHoursMetadata=${report.fields.withOpeningHoursMetadata}, meta.sourceUrl=${report.fields.withMetaSourceUrl}, officialWebsite=${report.fields.withOfficialWebsite}`,
  "",
  "## Findings",
  "",
  `1. **Suspicious cohort (${suspiciousCohort.length})** — specific-window hours on open-area kinds with no fresh metadata: ${report.cohorts.suspicious.join(", ")}`,
  `2. **Semantic nonsense subset (${nonsenseCohort.length})** — blanket windows invalid for kind (streets, districts, towns, nature, onsen, beaches…): ${report.cohorts.nonsense.join(", ")}`,
  `3. **Verified only ${statusCounts.verified}** of ${report.input.records} records → ${notFreshPercentage.toFixed(1)}% of records show hours without fresh evidence.`,
  `4. **Sourced grants** ${statusCounts.sourced} records — policy treats an hours-specific metadata source URL as evidence (general website links no longer certify hours).`,
  `5. **Detail page truthfulness gate**: unverified/stale hours now carry a 'Not yet verified' caveat (mirrors DayPlanWidget disclosures).`,
  "",
  "## Prevention (ordered)",
  "",
  "1. CI validator gate: specific-window hours on open-area kinds must carry fresh metadata (sourceUrl + verifiedAt); allowlisted debt is enforced (stale entries fail).",
  "2. Tighten `sourced`: only `openingHoursMetadata.sourceUrl` certifies hours (DONE in #336).",
  "3. Detail page: 'Not yet verified' caveat when assessment is stale/unverified (DONE in #336).",
  `4. Repair cohort source-backed: nonsense IDs → kind-appropriate 'Open access (…)' text or verified metadata (27→47 with the en-dash format gate).`,
  `5. Reuse the 2026-08 batch verification process on the ${unverifiedWithHoursCount}-record unverified remainder (long tail).`,
  "",
].join("\n");

const json = JSON.stringify(report, null, 2) + "\n";
const out = resolve(process.argv[2] ?? "/tmp/trip-audit-oh");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "opening-hours-audit.json"), json);
writeFileSync(join(out, "opening-hours-audit.md"), md);
console.log(`wrote ${join(out, "opening-hours-audit.json")} (${json.length}b)`);
console.log(`wrote ${join(out, "opening-hours-audit.md")} (${md.length}b)`);
