import destinationsData from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import review from "./kai-151-seasonality-phase1-review.json";
import { buildPlanningAudit } from "./kai-87-planning-quality-audit";

type ReviewClassification =
  | "verified_correct"
  | "incorrect_bestSeason"
  | "incorrect_bestMonths"
  | "incorrect_structured_season"
  | "internally_inconsistent"
  | "insufficient_evidence";

type ReviewRecord = (typeof review.records)[number];

const EXPECTED_REVIEW_COUNT = 32;
const EXPECTED_BASE_SHA = "a182ce49dbc7a3c7d3e22aab2f5b239812fb540f";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`KAI-151 Phase 1 review validation failed: ${message}`);
  }
}

export function validateKAI151Phase1Review(
  destinations: Destination[],
  evidenceReview: typeof review,
): void {
  assert(evidenceReview.baseSha === EXPECTED_BASE_SHA, "unexpected base SHA");
  assert(
    evidenceReview.records.length === EXPECTED_REVIEW_COUNT,
    `expected ${EXPECTED_REVIEW_COUNT} records, got ${evidenceReview.records.length}`,
  );

  const destinationById = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const reviewIds = new Set<string>();

  for (const record of evidenceReview.records as ReviewRecord[]) {
    assert(!reviewIds.has(record.id), `duplicate review id ${record.id}`);
    reviewIds.add(record.id);

    const destination = destinationById.get(record.id);
    assert(
      destination,
      `review id is not in canonical catalogue: ${record.id}`,
    );
    assert(
      record.current.bestSeason === destination.bestSeason,
      `${record.id}: bestSeason drifted from canonical data`,
    );
    assert(
      stableJson(record.current.bestMonths) ===
        stableJson(destination.bestMonths),
      `${record.id}: bestMonths drifted from canonical data`,
    );
    assert(
      stableJson(record.current.season) === stableJson(destination.season),
      `${record.id}: season vector drifted from canonical data`,
    );
    assert(
      (record.classification as ReviewClassification) in
        {
          verified_correct: true,
          incorrect_bestSeason: true,
          incorrect_bestMonths: true,
          incorrect_structured_season: true,
          internally_inconsistent: true,
          insufficient_evidence: true,
        },
      `${record.id}: invalid classification`,
    );
    assert(
      record.proposedSemanticState.status === "unchanged" &&
        record.proposedChanges.length === 0,
      `${record.id}: Phase 1 report contains an unexpected mutation`,
    );
  }

  assert(
    evidenceReview.summary.canonicalMutations === 0,
    "Phase 1 must not claim canonical mutations",
  );
  assert(
    evidenceReview.scopeDecision.repairCohort.length === 0,
    "Phase 1 repair cohort must be empty",
  );
  assert(
    reviewIds.size === EXPECTED_REVIEW_COUNT,
    `expected ${EXPECTED_REVIEW_COUNT} unique review ids, got ${reviewIds.size}`,
  );
}

export function runKAI151Phase1Review(): void {
  const destinations = destinationsData as Destination[];
  const audit = buildPlanningAudit(destinations);
  validateKAI151Phase1Review(destinations, review);

  for (const record of review.records) {
    const seasonality = audit.destinations[record.id]?.seasonality;
    assert(seasonality, `${record.id}: missing KAI-87 audit destination`);
    assert(
      seasonality.issueCodes.includes("unverified_all_year_placeholder"),
      `${record.id}: no longer belongs to the KAI-87 suspicious All Year cohort; refresh the report`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ticket: review.ticket,
        phase: review.phase,
        reviewed: review.records.length,
        classifications: review.summary,
        canonicalMutations: review.summary.canonicalMutations,
        status: "PASS",
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runKAI151Phase1Review();
}
