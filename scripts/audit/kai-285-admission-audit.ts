import fs from "node:fs";
import path from "node:path";
import { calculateTripEstimate } from "../../src/shared/services/budget/tripEstimateEngine";
import type {
  AdmissionCostFact,
  Destination,
  DestinationKind,
} from "../../src/shared/types/destination";

const ROOT = process.cwd();
const CATALOGUE_PATH = path.join(
  ROOT,
  "src/shared/data/destinations-index.json",
);
const OUTPUT_DIR = path.join(ROOT, "qa/kai-285");
const JSON_OUTPUT = path.join(OUTPUT_DIR, "admission-audit.json");
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, "admission-audit.md");

const MUNICIPAL_KINDS = new Set<DestinationKind>([
  "city",
  "town",
  "village",
  "ward",
]);
const OPEN_GEOGRAPHIC_KINDS = new Set<DestinationKind>([
  "nature",
  "natural",
  "lake",
  "waterfall",
  "cliff",
  "rock_formation",
  "cape",
  "island",
  "mountain",
]);
const ATTRACTION_KINDS = new Set<DestinationKind>([
  "aquarium",
  "castle",
  "garden",
  "museum",
  "onsen",
  "palace",
  "shrine",
  "temple",
  "theme_park",
  "tower",
  "viewpoint",
  "zoo",
  "amusement_park",
  "observation",
]);
const BLOCKED_OPEN_AREA_CATEGORIES =
  /museum|castle|palace|temple|shrine|garden|zoo|aquarium|theme park|amusement|observation|tower|resort|onsen|station|railway|facility|attraction/i;

const REQUESTED_CATEGORIES = [
  "city_town_village_ward",
  "city_travel_hub",
  "neighbourhood_district_area",
  "beach",
  "hiking_trail_region",
  "open_scenic_nature_area",
  "public_open_park",
  "market_street_public_area",
  "normal_paid_attraction",
  "verified_free_attraction",
] as const;

type RequestedCategory = (typeof REQUESTED_CATEGORIES)[number];
type AdmissionAssessment =
  | "deterministic_na_candidate"
  | "review_candidate"
  | "applicable_attraction"
  | "unclassified";

type Audited = {
  destination: Destination;
  estimate: ReturnType<typeof calculateTripEstimate>;
  admissionComponent: ReturnType<
    typeof calculateTripEstimate
  >["components"][number];
  classes: RequestedCategory[];
  assessment: AdmissionAssessment;
};

function readCatalogue(): Destination[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(CATALOGUE_PATH, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("destinations-index.json must contain an array");
  }
  return parsed as Destination[];
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizedCategories(destination: Destination): string {
  return (destination.categories ?? []).join(" | ").toLowerCase();
}

function hasCategory(destination: Destination, pattern: RegExp): boolean {
  return pattern.test(normalizedCategories(destination));
}

function classifyCategories(destination: Destination): RequestedCategory[] {
  const kind = destination.kind;
  const categories = new Set<RequestedCategory>();

  if (
    destination.role === "hub" ||
    (kind !== undefined && MUNICIPAL_KINDS.has(kind))
  ) {
    categories.add("city_town_village_ward");
    if (destination.role === "hub") categories.add("city_travel_hub");
  }
  if (
    kind === "district" ||
    hasCategory(destination, /district|neighbou?rhood|urban area/)
  ) {
    categories.add("neighbourhood_district_area");
  }
  if (kind === "beach" || hasCategory(destination, /beach|coast/)) {
    categories.add("beach");
  }
  if (hasCategory(destination, /hiking|trail|trek|pilgrimage route|mountain/)) {
    categories.add("hiking_trail_region");
  }
  if (
    (kind !== undefined && OPEN_GEOGRAPHIC_KINDS.has(kind)) ||
    hasCategory(
      destination,
      /nature|scenic|lake|waterfall|valley|gorge|wetland/,
    )
  ) {
    categories.add("open_scenic_nature_area");
  }
  if (kind === "park" || hasCategory(destination, /public park|parks|park/)) {
    categories.add("public_open_park");
  }
  if (
    kind === "market" ||
    kind === "street" ||
    hasCategory(destination, /market|public area|street|shopping|yokocho|alley/)
  ) {
    categories.add("market_street_public_area");
  }
  if (
    (kind !== undefined && ATTRACTION_KINDS.has(kind)) ||
    hasCategory(
      destination,
      /museum|castle|palace|aquarium|zoo|theme park|amusement|observation deck|tower|garden|temple|shrine|onsen|attraction|facility/,
    )
  ) {
    if (destination.admission?.state === "verified_paid") {
      categories.add("normal_paid_attraction");
    }
    if (destination.admission?.state === "verified_free") {
      categories.add("verified_free_attraction");
    }
  }

  return REQUESTED_CATEGORIES.filter((category) => categories.has(category));
}

function isDeterministicNaCandidate(destination: Destination): boolean {
  const kind = destination.kind;
  const structural =
    destination.role === "hub" ||
    (kind !== undefined &&
      (MUNICIPAL_KINDS.has(kind) ||
        kind === "district" ||
        kind === "beach" ||
        kind === "market" ||
        kind === "street"));
  if (structural) return true;

  const openGeographic =
    destination.role === "standalone" &&
    kind !== undefined &&
    OPEN_GEOGRAPHIC_KINDS.has(kind) &&
    !BLOCKED_OPEN_AREA_CATEGORIES.test(normalizedCategories(destination));
  return openGeographic;
}

function assessmentFor(destination: Destination): AdmissionAssessment {
  if (isDeterministicNaCandidate(destination)) {
    return "deterministic_na_candidate";
  }
  if (
    classifyCategories(destination).some((category) =>
      [
        "open_scenic_nature_area",
        "public_open_park",
        "market_street_public_area",
      ].includes(category),
    )
  ) {
    return "review_candidate";
  }
  if (
    classifyCategories(destination).some((category) =>
      ["normal_paid_attraction", "verified_free_attraction"].includes(category),
    )
  ) {
    return "applicable_attraction";
  }
  return "unclassified";
}

function admissionState(destination: Destination): string {
  const fact = destination.admission;
  return fact ? `${fact.state}/${fact.cost.kind}` : "absent";
}

function compactAdmission(fact: AdmissionCostFact | undefined) {
  if (!fact) return null;
  return {
    state: fact.state,
    provenance: fact.provenance,
    reasonCode: fact.reasonCode ?? null,
    costKind: fact.cost.kind,
    scope: fact.scope,
  };
}

function compactRecord(record: Audited) {
  const destination = record.destination;
  return {
    id: destination.id,
    name: destination.name,
    kind: destination.kind ?? null,
    role: destination.role ?? null,
    categories: [...(destination.categories ?? [])].sort(),
    admission: compactAdmission(destination.admission),
    assessment: record.assessment,
    classes: record.classes,
    estimate: {
      completeness: record.estimate.completeness,
      evidenceCompleteness: record.estimate.evidenceCompleteness,
      estimateQuality: record.estimate.estimateQuality,
      knownSubtotal: record.estimate.knownSubtotal,
      missingComponents: record.estimate.missingComponents,
    },
  };
}

function categoryAudit(
  records: readonly Audited[],
  category: RequestedCategory,
) {
  const matching = records.filter((record) =>
    record.classes.includes(category),
  );
  return {
    records: matching.length,
    admissionStates: countBy(
      matching.map((record) => admissionState(record.destination)),
    ),
    completeEstimates: matching.filter(
      (record) => record.estimate.completeness === "complete",
    ).length,
    admissionDrivenIncompleteEstimates: matching.filter((record) =>
      record.estimate.missingComponents.some(
        (item) => item.scope === "admission",
      ),
    ).length,
  };
}

function fixture(destination: Partial<Destination>): Destination {
  return {
    id: "kai-285-fixture",
    name: "KAI-285 fixture",
    nameJa: "KAI-285フィクスチャ",
    prefecture: "Tokyo",
    region: "Kanto",
    kind: "museum",
    role: "poi",
    coordinates: { lat: 35.68, lng: 139.76 },
    transportOptions: { train: 45 },
    recommendedVisitHours: { min: 1, max: 3 },
    admission: {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 1000, max: 1000 },
      scope: "general_entry",
      basis: "fixture admission",
      sourceUrls: ["https://example.test/admission"],
      checkedAt: "2026-09-09",
    },
    ...destination,
  } as Destination;
}

function fixtureMatrix() {
  const cases = [
    [
      "city_hub_no_destination_ticket",
      fixture({
        role: "hub",
        kind: "city",
        admission: {
          state: "not_applicable",
          provenance: "verified_source",
          reasonCode: "hub_budget_not_applicable",
          cost: { kind: "not_applicable" },
          scope: "whole_area",
          basis: "fixture city hub",
          sourceUrls: ["https://example.test/city"],
          checkedAt: "2026-09-09",
        },
      }),
    ],
    [
      "municipality",
      fixture({
        kind: "town",
        admission: {
          state: "not_applicable",
          provenance: "verified_source",
          reasonCode: "hub_budget_not_applicable",
          cost: { kind: "not_applicable" },
          scope: "whole_area",
          basis: "fixture municipality",
          sourceUrls: ["https://example.test/town"],
          checkedAt: "2026-09-09",
        },
      }),
    ],
    [
      "open_scenic_nature",
      fixture({
        kind: "lake",
        role: "standalone",
        admission: {
          state: "not_applicable",
          provenance: "verified_source",
          reasonCode: "no_single_admission_product",
          cost: { kind: "not_applicable" },
          scope: "open_area",
          basis: "fixture open scenic area",
          sourceUrls: ["https://example.test/lake"],
          checkedAt: "2026-09-09",
        },
      }),
    ],
    ["genuinely_paid_poi", fixture({ kind: "museum" })],
    [
      "verified_free_poi",
      fixture({
        kind: "garden",
        admission: {
          state: "verified_free",
          provenance: "verified_source",
          cost: { kind: "bounded", min: 0, max: 0 },
          scope: "general_entry",
          basis: "fixture verified free entry",
          sourceUrls: ["https://example.test/free"],
          checkedAt: "2026-09-09",
        },
      }),
    ],
    [
      "applicable_unknown_poi",
      fixture({ kind: "museum", admission: undefined }),
    ],
  ] as const;

  return cases.map(([name, destination]) => {
    const result = calculateTripEstimate({
      dest: destination,
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    const admission = result.components.find(
      (component) => component.evidence.scope === "admission",
    );
    return {
      name,
      admissionCostKind: admission?.cost.kind ?? null,
      completeness: result.completeness,
      evidenceCompleteness: result.evidenceCompleteness,
      missingAdmission: result.missingComponents.some(
        (component) => component.scope === "admission",
      ),
    };
  });
}

function markdown(report: ReturnType<typeof buildReport>): string {
  const lines = [
    "# KAI-285 admission applicability audit",
    "",
    `Base: ${report.base.commit} (` + report.base.branch + ")",
    "",
    "## Phase 0 result",
    "",
    "Current main already stores explicit admission facts, including `not_applicable`, and Budget v2 preserves unknown/free/N/A as distinct states. It does **not** yet have one canonical admission-applicability boundary: `TripEstimateEngine` still owns an internal mandatory-kind list plus broad fallback profiles, and the generated-plan UI renders `Not applicable` as an admission row. Therefore the stop condition for an equivalent canonical N/A implementation does not apply.",
    "",
    "The current traveller-facing failure is concentrated in 68 records whose admission component is unresolved: 43 `unavailable` and 25 `variable_price`. The engine marks all 68 estimates partial. Fourteen are deterministic N/A candidates by entity semantics; they are not changed in PR A because catalogue cleanup is reserved for PR B.",
    "",
    "## Canonical representation and consumers",
    "",
    "- Canonical persisted fact: `Destination.admission` (`AdmissionCostFact`) with shared Budget v2 state/provenance/reason-code axes and `DestinationCostFact` value shapes.",
    "- Legacy compatibility: `getEffectiveBudgetBreakdown()` projects only validated bounded admission facts; N/A, variable, unavailable, and malformed facts fail closed instead of becoming scalar zero.",
    "- TripEstimateEngine: `admissionComponent()` handles the persisted fact, otherwise uses legacy metadata and an internal `isMandatoryAdmissionDestination()` / `defaultAdmissionProfile()` fallback.",
    "- Destination-detail cost breakdown: `DestinationPlanningSection` → `calculateGeneratedPlanCost()` → `TripCostBreakdownWidget`.",
    "- Planner totals: `GeneratedPlanCostService` aggregates canonical components, excludes N/A components, and deduplicates destination steps; route legs remain separate curated components.",
    "- Explore/recommendations: `Destinations.tsx`, `RecommendationPipeline.ts`, and `RecommendationScorer.ts` call `calculateTripEstimate()` and the canonical affordability evaluators.",
    "- Compact destination cards and detail glances consume the same estimate or validated legacy projection; they do not own admission arithmetic.",
    "",
    "## Catalogue totals",
    "",
    `- Total records audited: **${report.catalogue.totalRecords}**; unique IDs: **${report.catalogue.uniqueIds}**.`,
    `- Admission facts present: **${report.catalogue.admissionFactsPresent}**; absent: **${report.catalogue.admissionFactsAbsent}**.`,
    `- Current admission states: ${Object.entries(
      report.catalogue.admissionStates,
    )
      .map(([state, count]) => `\`${state}\` ${count}`)
      .join(", ")}.`,
    `- Current estimate completeness: **${report.catalogue.engineCompleteness.complete} complete**, **${report.catalogue.engineCompleteness.partial} partial**.`,
    `- Admission-driven incomplete estimates: **${report.impact.admissionDrivenIncompleteEstimates} / ${report.catalogue.engineCompleteness.partial}**.`,
    "",
    "## Requested semantic cohorts",
    "",
    "| Cohort | Records | Admission states | Complete estimates | Admission-driven incomplete |",
    "|---|---:|---|---:|---:|",
    ...REQUESTED_CATEGORIES.map((category) => {
      const row = report.cohorts[category];
      return `| ${category} | ${row.records} | ${Object.entries(
        row.admissionStates,
      )
        .map(([state, count]) => `${state}: ${count}`)
        .join(
          ", ",
        )} | ${row.completeEstimates} | ${row.admissionDrivenIncompleteEstimates} |`;
    }),
    "",
    "## High-confidence N/A projection (PR B candidate set)",
    "",
    `- Deterministic N/A candidates: **${report.impact.deterministicNaCandidates}**.`,
    `- Of those, currently admission-unknown/unavailable: **${report.impact.deterministicNaUnknownCandidates}**.`,
    `- Currently incomplete estimates in that candidate set: **${report.impact.deterministicNaIncompleteEstimates}**.`,
    `- Projected recovered estimates if only those explicit records are corrected to N/A: **${report.impact.projectedRecoveredEstimates}**.`,
    `- Projected admission-driven incomplete estimates: **${report.impact.projectedAdmissionDrivenIncompleteEstimates}**; reduction **${report.impact.projectedReductionPercent}%**.`,
    "",
    "This is a bounded projection, not a data mutation. PR A leaves the 14 records unchanged. PR B may update only the high-confidence rows after review; medium-confidence nature/park/onsen/temple/shrine cases remain untouched until source review.",
    "",
    "## Current failure examples",
    "",
    ...report.examples.map(
      (example) =>
        `- **${example.name}** \`${example.id}\`: ${example.kind ?? "kind absent"}/${example.role ?? "role absent"}, admission \`${example.admissionState}\`, estimate **${example.completeness}**, assessment **${example.assessment}**.`,
    ),
    "",
    "## Parent-area review",
    "",
    `- Parent-like records with a non-N/A admission fact: **${report.parentReview.nonNaParentRecords}**.`,
    `- Verified-paid parent-like records: **${report.parentReview.verifiedPaidParentRecords}**.`,
    `- Verified-free parent-like records requiring semantic review: **${report.parentReview.verifiedFreeParentRecords}**.`,
    "- These are review candidates, not proof of inherited child fees. No parent-area paid fact was found in this audit.",
    "",
    "## Deterministic regression matrix",
    "",
    "| Fixture | Admission representation | Estimate completeness | Admission missing |",
    "|---|---|---|---|",
    ...report.fixtureMatrix.map(
      (row) =>
        `| ${row.name} | \`${row.admissionCostKind}\` | ${row.completeness} | ${row.missingAdmission ? "yes" : "no"} |`,
    ),
    "",
    "The matrix preserves the invariant `unknown admission ≠ ¥0 ≠ not applicable`; it also confirms that explicit N/A is excluded from completeness requirements without creating an exact zero-cost admission fact.",
    "",
    "## Deferred",
    "",
    "- PR A: canonical applicability boundary, engine/UI integration, deterministic audit tooling/artifact, and representative fixtures only; no catalogue cleanup beyond what is required to prove the contract.",
    "- PR B: reviewed high-confidence N/A corrections and any separately evidenced parent-area corrections. Ambiguous records remain unchanged.",
    "- No broad external research was performed; existing suspicious or ambiguous facts are listed for bounded follow-up.",
    "",
  ];
  return lines.join("\n");
}

function buildReport() {
  const destinations = readCatalogue().sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const records: Audited[] = destinations.map((destination) => {
    const estimate = calculateTripEstimate({
      dest: destination,
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    const admissionComponent = estimate.components.find(
      (component) => component.evidence.scope === "admission",
    );
    if (!admissionComponent) {
      throw new Error(`Missing admission component for ${destination.id}`);
    }
    return {
      destination,
      estimate,
      admissionComponent,
      classes: classifyCategories(destination),
      assessment: assessmentFor(destination),
    };
  });

  const incomplete = records.filter(
    (record) => record.estimate.completeness !== "complete",
  );
  const admissionDrivenIncomplete = incomplete.filter((record) =>
    record.estimate.missingComponents.some(
      (item) => item.scope === "admission",
    ),
  );
  const deterministicNaCandidates = records.filter(
    (record) => record.assessment === "deterministic_na_candidate",
  );
  const deterministicNaIncomplete = deterministicNaCandidates.filter(
    (record) => record.estimate.completeness !== "complete",
  );
  const parentLike = records.filter(
    ({ destination }) =>
      destination.role === "hub" ||
      (destination.kind !== undefined &&
        (MUNICIPAL_KINDS.has(destination.kind) ||
          destination.kind === "district")),
  );
  const nonNaParents = parentLike.filter(
    ({ destination }) => destination.admission?.cost.kind !== "not_applicable",
  );

  const admissionStates = countBy(
    records.map(({ destination }) => admissionState(destination)),
  );
  const report = {
    schemaVersion: 1,
    base: {
      branch: "fix/kai-285-admission-na-semantics",
      commit: "29aaaa3a5fc20501c023e12f5d0347540537c5bd",
      source: "origin/main",
    },
    methodology: {
      estimateContext: {
        duration: "fullDay",
        partySize: 2,
        includeOriginTravel: false,
      },
      admissionUnknownDefinition:
        "Admission component cost.kind unavailable or variable/open-ended when the engine cannot produce a bounded total; variable price is reported separately from unknown/unavailable.",
      deterministicNaDefinition:
        "Explicit municipality/hub/district/beach/market/street semantics, or standalone geographic nature/mountain/lake/waterfall/rock-form destination without facility markers. Parks, temples, shrines, gardens, onsens, resorts, and attraction-like records are not auto-converted.",
      noMutation: true,
    },
    catalogue: {
      totalRecords: destinations.length,
      uniqueIds: new Set(destinations.map((destination) => destination.id))
        .size,
      admissionFactsPresent: destinations.filter((destination) =>
        Boolean(destination.admission),
      ).length,
      admissionFactsAbsent: destinations.filter(
        (destination) => !destination.admission,
      ).length,
      admissionStates,
      engineCompleteness: countBy(
        records.map(({ estimate }) => estimate.completeness),
      ),
      evidenceCompleteness: countBy(
        records.map(({ estimate }) => estimate.evidenceCompleteness),
      ),
      estimateQuality: countBy(
        records.map(({ estimate }) => estimate.estimateQuality),
      ),
      semanticClassCounts: Object.fromEntries(
        REQUESTED_CATEGORIES.map((category) => [
          category,
          records.filter((record) => record.classes.includes(category)).length,
        ]),
      ),
    },
    impact: {
      incompleteEstimates: incomplete.length,
      admissionDrivenIncompleteEstimates: admissionDrivenIncomplete.length,
      deterministicNaCandidates: deterministicNaCandidates.length,
      deterministicNaUnknownCandidates: deterministicNaCandidates.filter(
        ({ destination }) => destination.admission?.state === "unavailable",
      ).length,
      deterministicNaIncompleteEstimates: deterministicNaIncomplete.length,
      projectedRecoveredEstimates: deterministicNaIncomplete.length,
      projectedAdmissionDrivenIncompleteEstimates:
        admissionDrivenIncomplete.length - deterministicNaIncomplete.length,
      projectedReductionPercent: Number(
        (
          (deterministicNaIncomplete.length /
            admissionDrivenIncomplete.length) *
          100
        ).toFixed(2),
      ),
    },
    cohorts: Object.fromEntries(
      REQUESTED_CATEGORIES.map((category) => [
        category,
        categoryAudit(records, category),
      ]),
    ) as Record<RequestedCategory, ReturnType<typeof categoryAudit>>,
    parentReview: {
      parentLikeRecords: parentLike.length,
      nonNaParentRecords: nonNaParents.length,
      verifiedPaidParentRecords: nonNaParents.filter(
        ({ destination }) => destination.admission?.state === "verified_paid",
      ).length,
      verifiedFreeParentRecords: nonNaParents.filter(
        ({ destination }) => destination.admission?.state === "verified_free",
      ).length,
      records: nonNaParents.map(compactRecord),
    },
    examples: incomplete
      .filter((record) =>
        [
          "matsumoto-nakamachi-nawate",
          "yanagimachi-street-ueda",
          "ikaho-stone-steps",
          "disneysea",
          "onioshidashi-park",
        ].includes(record.destination.id),
      )
      .map((record) => ({
        id: record.destination.id,
        name: record.destination.name,
        kind: record.destination.kind ?? null,
        role: record.destination.role ?? null,
        admissionState: admissionState(record.destination),
        completeness: record.estimate.completeness,
        assessment: record.assessment,
      })),
    incompleteRecords: incomplete.map(compactRecord),
    deterministicNaCandidates: deterministicNaCandidates.map(compactRecord),
    fixtureMatrix: fixtureMatrix(),
  };

  return report;
}

const report = buildReport();
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(MARKDOWN_OUTPUT, markdown(report));
console.log(
  JSON.stringify(
    {
      json: JSON_OUTPUT,
      markdown: MARKDOWN_OUTPUT,
      totalRecords: report.catalogue.totalRecords,
      incomplete: report.impact.incompleteEstimates,
      admissionDrivenIncomplete:
        report.impact.admissionDrivenIncompleteEstimates,
      deterministicNaCandidates: report.impact.deterministicNaCandidates,
      deterministicNaIncomplete:
        report.impact.deterministicNaIncompleteEstimates,
      projectedReductionPercent: report.impact.projectedReductionPercent,
    },
    null,
    2,
  ),
);
