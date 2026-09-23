import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildBaseline,
  buildProposals,
  parseJpyPrices,
  parseJpyText,
  type ExtractionRecord,
  type SourceRegistryEntry,
} from "../kai-323-admission-pilot";

type Fixture = {
  name: string;
  text: string;
  values: number[];
  minimum: number | null;
  maximum: number | null;
  fromOnly: boolean;
  semantics?: "observed_currency_tokens_only";
};

const ROOT = path.resolve(import.meta.dirname, "../../..");
const fixtures = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "qa/kai-323/fixtures/price-parser-fixtures.json"),
    "utf8",
  ),
) as Fixture[];

describe("KAI-323 price parser", () => {
  it.each(fixtures)(
    "parses fixture $name without inventing values",
    (fixture) => {
      const parsed = parseJpyText(fixture.text);
      expect(parsed.values).toEqual(fixture.values);
      expect(parsed.observedMinimum).toBe(fixture.minimum);
      expect(parsed.observedMaximum).toBe(fixture.maximum);
      expect(parsed.semantics).toBe("observed_currency_tokens_only");
      expect(parsed.fromOnly).toBe(fixture.fromOnly);
    },
  );

  it("does not interpret age or visitor counts as prices", () => {
    expect(parseJpyPrices("Adults 18 and above; children 4-12")).toEqual([]);
    expect(parseJpyPrices("USD 2,000 or EUR 20")).toEqual([]);
  });

  it("does not collapse distinct products into a single parser result", () => {
    expect(parseJpyPrices("Admission ¥500; factory voucher ¥500")).toEqual([
      500,
    ]);
    expect(parseJpyPrices("adult ¥3,600; flexible pass ¥1,800")).toEqual([
      1800, 3600,
    ]);
  });
});

function extraction(
  overrides: Partial<ExtractionRecord> = {},
): ExtractionRecord {
  return {
    destinationId: "x",
    sourceUrl: "https://example.com",
    sourceLanguage: "en",
    collectedAt: "2026-09-23",
    currency: "JPY",
    originalPriceText: null,
    adultPrice: null,
    childPrice: null,
    onlinePrice: null,
    counterPrice: null,
    minimumPrice: null,
    maximumPrice: null,
    validFrom: null,
    validUntil: null,
    weekdayOrWeekend: null,
    timeSlotConditions: null,
    ticketProduct: "admission",
    extractionStatus: "unresolved",
    failureReason: "ambiguous",
    manualVerified: false,
    ...overrides,
  };
}

describe("KAI-323 deterministic cohort reports", () => {
  it("builds a 25-record baseline with unique IDs", () => {
    const catalogue = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "src/shared/data/destinations-index.json"),
        "utf8",
      ),
    );
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "qa/kai-323/source-registry.json"),
        "utf8",
      ),
    ) as SourceRegistryEntry[];
    const baseline = buildBaseline(catalogue, registry);
    expect(baseline.cohortSize).toBe(25);
    expect((baseline.records as unknown[]).length).toBe(25);
    expect(
      new Set(
        (baseline.records as { destinationId: string }[]).map(
          (r) => r.destinationId,
        ),
      ).size,
    ).toBe(25);
  });

  it("rejects duplicate source IDs", () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "qa/kai-323/source-registry.json"),
        "utf8",
      ),
    ) as SourceRegistryEntry[];
    const catalogue = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "src/shared/data/destinations-index.json"),
        "utf8",
      ),
    );
    expect(() => buildBaseline(catalogue, [registry[0], registry[0]])).toThrow(
      /duplicate IDs/,
    );
  });

  it("keeps genuinely unknown admissions unknown when extraction fails", () => {
    const proposals = buildProposals(
      {
        records: [
          {
            destinationId: "x",
            currentClassification: "unknown",
            currentAdmission: null,
          },
        ],
      },
      [extraction()],
    );
    expect(
      (proposals.records as { proposedAction: string }[])[0].proposedAction,
    ).toBe("remain_unknown");
  });

  it("preserves existing fixed/variable/free/N/A facts on failed refresh", () => {
    const baseline = {
      records: [
        {
          destinationId: "fixed",
          currentClassification: "fixed",
          currentAdmission: { state: "verified_paid", costKind: "bounded" },
        },
        {
          destinationId: "variable",
          currentClassification: "variable",
          currentAdmission: { state: "variable_price", costKind: "variable" },
        },
        {
          destinationId: "free",
          currentClassification: "free",
          currentAdmission: { state: "verified_free", costKind: "bounded" },
        },
        {
          destinationId: "na",
          currentClassification: "not_applicable",
          currentAdmission: {
            state: "not_applicable",
            costKind: "not_applicable",
          },
        },
      ],
    };
    const proposals = buildProposals(
      baseline,
      ["fixed", "variable", "free", "na"].map((destinationId) =>
        extraction({ destinationId }),
      ),
    );
    expect(
      (proposals.records as { proposedAction: string }[]).map(
        (r) => r.proposedAction,
      ),
    ).toEqual([
      "no_new_evidence_keep_current",
      "no_new_evidence_keep_current",
      "no_new_evidence_keep_current",
      "no_new_evidence_keep_current",
    ]);
  });

  it("does not call equal adult numbers fully equivalent without scope evidence", () => {
    const proposals = buildProposals(
      {
        records: [
          {
            destinationId: "fixed",
            currentClassification: "fixed",
            currentAdmission: {
              state: "verified_paid",
              costKind: "bounded",
              minimumPrice: 1000,
              maximumPrice: 1000,
            },
          },
        ],
      },
      [
        extraction({
          destinationId: "fixed",
          extractionStatus: "verified",
          adultPrice: 1000,
          manualVerified: true,
          ticketProduct: "adult online admission",
        }),
      ],
    );
    expect(
      (proposals.records as { proposedAction: string }[])[0].proposedAction,
    ).toBe("price_matches_review_scope");
  });

  it("keeps variable/date-dependent facts variable", () => {
    const baseline = {
      records: [
        {
          destinationId: "variable",
          currentClassification: "variable",
          currentAdmission: { state: "variable_price", costKind: "variable" },
        },
      ],
    };
    const failed = buildProposals(baseline, [
      extraction({ destinationId: "variable" }),
    ]);
    expect(
      (failed.records as { proposedAction: string }[])[0].proposedAction,
    ).toBe("no_new_evidence_keep_current");
    const variable = buildProposals(baseline, [
      extraction({
        destinationId: "variable",
        extractionStatus: "verified_variable",
        adultPrice: 1800,
        manualVerified: true,
      }),
    ]);
    expect(
      (variable.records as { proposedAction: string }[])[0].proposedAction,
    ).toBe("review_required_variable_product");
  });
});
