import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import catalogue from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { TransportMode } from "@/shared/services/transport/types";
import type {
  DayPlan,
  DayPlanStep,
} from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";
import { calculateTripEstimate } from "../tripEstimateEngine";
import baselineJson from "./fixtures/legacyCatalogueGolden.baseline.json";

const MODES = [
  "train",
  "shinkansen",
  "car",
  "my_car",
  "bus",
  "flight",
  "ferry",
] as const satisfies readonly TransportMode[];
const PLAN_MODES = ["car", "train"] as const;
const PARTY_SIZES = [1, 2, 4] as const;
const DURATIONS = ["fullDay", "2d1n", "3d2n"] as const;
const ORIGIN = { lat: 35.6812, lng: 139.7671 };
const VISIT_DATE = "2026-11-02";
const ADMISSION_NOTE_KEYS = {
  assumingAdults: "planner.budgetEstimate.admissionAssumingAdults",
  selectedDate: "planner.budgetEstimate.admissionVerifiedForDate",
  fixedPrice: "planner.budgetEstimate.admissionFixedPrice",
  supportedRange: "planner.budgetEstimate.admissionPublishedRange",
} as const;
const INPUT_SPEC = {
  modes: MODES,
  partySizes: PARTY_SIZES,
  durations: DURATIONS,
  origin: ORIGIN,
  visitDate: VISIT_DATE,
  admissionSelection: "omitted",
  childCount: "omitted",
  runtimeCatalogueLoader:
    "Vitest setup: loadLiteIndex and loadRelationshipIndex",
  planCostModes: PLAN_MODES,
  repeatPlans: "same destination on day 1 and day 2 (or day 3 for 3d2n)",
};

type GoldenCase = {
  caseKey: string;
  destinationId: string;
  operation: "calculateTripEstimate" | "calculateGeneratedPlanCost";
  output: unknown;
  widgetNotes: unknown;
};

type GoldenBaseline = {
  schemaVersion: number;
  baselineCommit: string;
  inputSpec: Record<string, unknown>;
  destinationCount: number;
  caseCount: number;
  fieldHashes: Record<string, Record<string, string>>;
  sampleCases: GoldenCase[];
};

const baseline = baselineJson as unknown as GoldenBaseline;

type AdmissionNoteEvidence = {
  admissionCompositionAssumed?: boolean;
  admissionPricingBasis?: "selected_date" | "fixed_price" | "supported_range";
};

function admissionNoteKey(
  admission: AdmissionNoteEvidence | undefined,
): string | undefined {
  if (admission?.admissionCompositionAssumed === true) {
    return ADMISSION_NOTE_KEYS.assumingAdults;
  }
  switch (admission?.admissionPricingBasis) {
    case "selected_date":
      return ADMISSION_NOTE_KEYS.selectedDate;
    case "fixed_price":
      return ADMISSION_NOTE_KEYS.fixedPrice;
    case "supported_range":
      return ADMISSION_NOTE_KEYS.supportedRange;
    default:
      return undefined;
  }
}

function estimateWidgetNotes(result: ReturnType<typeof calculateTripEstimate>) {
  const admission = result.components.find(
    (component) => component.evidence.scope === "admission",
  );
  return {
    admissionPricingNoteKey: admissionNoteKey(admission?.evidence),
    quality: result.estimateQuality,
    missingComponents: result.missingComponents,
  };
}

function planWidgetNotes(
  result: ReturnType<typeof calculateGeneratedPlanCost>,
) {
  return {
    admissionPricingNoteKey: admissionNoteKey(result.admission),
    quality: result.estimateQuality,
    completeness: result.completeness,
  };
}

function makeStep(
  destination: Destination,
  id: string,
  day: number,
): DayPlanStep {
  return {
    id,
    day,
    type: "destination",
    timeBlock: "morning",
    startTime: "09:00",
    endTime: "11:00",
    durationMinutes: 120,
    destination,
    title: { en: destination.name, ja: destination.nameJa ?? destination.name },
  };
}

function makePlan(
  destination: Destination,
  duration: (typeof DURATIONS)[number],
  repeat: boolean,
): DayPlan {
  const secondDay = duration === "3d2n" ? 3 : 2;
  return {
    id: `legacy-golden-${destination.id}-${duration}-${repeat ? "repeat" : "single"}`,
    duration,
    travelDate: VISIT_DATE,
    title: { en: "Golden baseline", ja: "Golden baseline" },
    steps: repeat
      ? [
          makeStep(destination, "visit-day-1", 1),
          makeStep(destination, `visit-day-${secondDay}`, secondDay),
        ]
      : [makeStep(destination, "visit-day-1", 1)],
    routeLegs: [],
    totalDurationMinutes: repeat ? 240 : 120,
    totalBudgetRange: [0, 0],
    isOverfilled: false,
    uncertainHoursDisclosures: [],
    assumptions: [],
  };
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : canonical(item)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashFields(records: readonly GoldenCase[]): Record<string, string> {
  const sortedRecords = [...records].sort((left, right) =>
    compareText(left.caseKey, right.caseKey),
  );
  const fieldValues = new Map<string, Map<string, unknown>>();

  for (const record of sortedRecords) {
    const output = canonical(record.output) as Record<string, unknown>;
    const widgetNotes = canonical(record.widgetNotes) as Record<
      string,
      unknown
    >;
    const prefix =
      record.operation === "calculateTripEstimate" ? "estimate" : "planCost";
    for (const [key, value] of Object.entries(output)) {
      const field = `${prefix}.output.${key}`;
      const values = fieldValues.get(field) ?? new Map<string, unknown>();
      values.set(record.caseKey, value);
      fieldValues.set(field, values);
    }
    for (const [key, value] of Object.entries(widgetNotes)) {
      const field = `${prefix}.widgetNotes.${key}`;
      const values = fieldValues.get(field) ?? new Map<string, unknown>();
      values.set(record.caseKey, value);
      fieldValues.set(field, values);
    }
  }

  const hashes: Record<string, string> = {};
  for (const field of [...fieldValues.keys()].sort(compareText)) {
    const values = fieldValues.get(field)!;
    const hash = createHash("sha256");
    for (const record of sortedRecords) {
      hash.update(record.caseKey).update("\0");
      hash.update(
        values.has(record.caseKey)
          ? JSON.stringify({ present: true, value: values.get(record.caseKey) })
          : '{"present":false}',
      );
      hash.update("\n");
    }
    hashes[field] = hash.digest("hex");
  }
  return hashes;
}

function makeCases(destination: Destination): GoldenCase[] {
  const cases: GoldenCase[] = [];
  for (const mode of MODES) {
    for (const partySize of PARTY_SIZES) {
      for (const duration of DURATIONS) {
        const output = calculateTripEstimate({
          dest: destination,
          mode,
          partySize,
          homeCoords: ORIGIN,
          includeOriginTravel: true,
          duration,
          visitDate: VISIT_DATE,
        });
        cases.push({
          caseKey: `estimate|${destination.id}|mode=${mode}|party=${partySize}|duration=${duration}`,
          destinationId: destination.id,
          operation: "calculateTripEstimate",
          output,
          widgetNotes: estimateWidgetNotes(output),
        });
      }
    }
  }
  for (const mode of PLAN_MODES) {
    for (const partySize of PARTY_SIZES) {
      for (const duration of DURATIONS) {
        const repeatCases = duration === "fullDay" ? [false] : [false, true];
        for (const repeat of repeatCases) {
          const output = calculateGeneratedPlanCost(
            makePlan(destination, duration, repeat),
            partySize,
            mode,
            true,
            ORIGIN,
          );
          cases.push({
            caseKey: `planCost|${destination.id}|mode=${mode}|party=${partySize}|duration=${duration}|visit=${repeat ? "repeat" : "single"}`,
            destinationId: destination.id,
            operation: "calculateGeneratedPlanCost",
            output,
            widgetNotes: planWidgetNotes(output),
          });
        }
      }
    }
  }
  return cases.sort((left, right) => compareText(left.caseKey, right.caseKey));
}

describe("legacy catalogue zero-change golden", () => {
  it("matches main estimate and plan-cost outputs for every catalogue destination", () => {
    const destinations = [...(catalogue as Destination[])].sort((left, right) =>
      compareText(left.id, right.id),
    );
    const destinationIds = destinations.map((destination) => destination.id);
    const baselineIds = Object.keys(baseline.fieldHashes).sort(compareText);
    const ticketOptionIds = destinations
      .filter((destination) => destination.admission?.priceOptions?.length)
      .map((destination) => destination.id);

    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.baselineCommit).toBe("d0ef053f");
    expect(baseline.inputSpec).toEqual(INPUT_SPEC);
    expect(
      ticketOptionIds,
      "The legacy baseline requires no priceOptions entries",
    ).toEqual([]);
    expect(destinationIds).toEqual(baselineIds);
    expect(destinations).toHaveLength(baseline.destinationCount);

    const samples = new Map(
      baseline.sampleCases.map((record) => [record.caseKey, record]),
    );
    const actualSamples = new Map<string, GoldenCase>();
    let caseCount = 0;

    for (const destination of destinations) {
      const cases = makeCases(destination);
      caseCount += cases.length;
      const actualHashes = hashFields(cases);
      const expectedHashes = baseline.fieldHashes[destination.id];
      const fields = [
        ...new Set([
          ...Object.keys(expectedHashes),
          ...Object.keys(actualHashes),
        ]),
      ].sort(compareText);

      for (const field of fields) {
        expect(
          actualHashes[field],
          `Legacy catalogue output changed for destination "${destination.id}", field "${field}": main=${expectedHashes[field] ?? "[missing]"}, current=${actualHashes[field] ?? "[missing]"}`,
        ).toBe(expectedHashes[field]);
      }

      for (const record of cases) {
        if (samples.has(record.caseKey)) {
          actualSamples.set(record.caseKey, record);
        }
      }
    }

    expect(caseCount).toBe(baseline.caseCount);
    for (const [caseKey, expected] of samples) {
      expect(
        actualSamples.get(caseKey),
        `Full sample output differs from main for ${caseKey}`,
      ).toEqual(expected);
    }
  }, 60_000);
});
