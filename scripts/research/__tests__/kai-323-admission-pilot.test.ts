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
      expect(parsed.minimum).toBe(fixture.minimum);
      expect(parsed.maximum).toBe(fixture.maximum);
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

  it("keeps unresolved results as review states", () => {
    const baseline = {
      records: [
        {
          destinationId: "x",
          currentAdmission: { state: "unavailable", costKind: "unavailable" },
        },
      ],
    };
    const extraction = {
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
    } as ExtractionRecord;
    const proposals = buildProposals(baseline, [extraction]);
    expect(
      (proposals.records as { proposedAction: string }[])[0].proposedAction,
    ).toBe("remain_unknown");
  });
});
