import { describe, expect, it } from "vitest";
import type {
  AdmissionPriceOption,
  Destination,
} from "@/shared/types/destination";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";
import { calculateTripEstimate } from "../tripEstimateEngine";

const sourceUrls = ["https://example.test/admission"];

function destination(
  id: string,
  admission: Destination["admission"],
  overrides: Partial<Destination> = {},
): Destination {
  return {
    id,
    name: id,
    nameJa: id,
    prefecture: "Tokyo",
    region: "Kanto",
    role: "poi",
    kind: "museum",
    categories: ["Culture"],
    coordinates: { lat: 35.68, lng: 139.76 },
    transportOptions: { train: 60 },
    admission,
    ...overrides,
  } as Destination;
}

function variableAdmission(
  priceOptions?: readonly AdmissionPriceOption[],
): Destination["admission"] {
  return {
    state: "variable_price",
    provenance: "verified_source",
    reasonCode: "price_variable_by_date",
    cost: { kind: "variable" },
    scope: "general_entry",
    basis: "Synthetic verified-price fixture.",
    sourceUrls,
    checkedAt: "2026-10-01",
    ...(priceOptions ? { priceOptions } : {}),
  };
}

function admission(result: ReturnType<typeof calculateTripEstimate>) {
  return result.components.find(
    (component) => component.evidence.scope === "admission",
  )!;
}

function estimate(
  dest: Destination,
  partySize: number,
  options: {
    visitDate?: string;
    admissionSelection?: {
      productId?: string;
      adultCount?: number;
      childCount?: number;
      channel?: "online" | "counter";
      timeSlot?: string;
      addOnProductIds?: readonly string[];
    };
  } = {},
) {
  return calculateTripEstimate({
    dest,
    partySize,
    duration: "fullDay",
    includeOriginTravel: false,
    ...options,
  });
}

describe("reviewed admission price options", () => {
  it("uses the selected Shibuya-Sky-like time tier and shows a range without a slot", () => {
    const deck = destination(
      "shibuya-sky-like",
      variableAdmission([
        {
          productId: "standard",
          variantId: "morning",
          category: "adult",
          min: 1800,
          max: 1800,
          timeSlot: "10:00",
        },
        {
          productId: "standard",
          variantId: "evening",
          category: "adult",
          min: 2500,
          max: 2500,
          timeSlot: "18:00",
        },
      ]),
    );

    const selected = admission(
      estimate(deck, 2, {
        visitDate: "2026-11-14",
        admissionSelection: { adultCount: 2, childCount: 0, timeSlot: "18:00" },
      }),
    );
    expect(selected.cost).toEqual({ kind: "bounded", min: 5000, max: 5000 });
    expect(selected.evidence.admissionPricingBasis).toBe("selected_date");

    const unselectedSlot = admission(
      estimate(deck, 2, { visitDate: "2026-11-14" }),
    );
    expect(unselectedSlot.cost).toEqual({
      kind: "bounded",
      min: 3600,
      max: 5000,
    });
    expect(unselectedSlot.evidence.admissionPricingBasis).toBe(
      "supported_range",
    );
  });

  it("uses the applicable USJ-like date tier instead of the cheapest date", () => {
    const themePark = destination(
      "usj-like",
      variableAdmission([
        {
          productId: "studio-pass",
          variantId: "early-november",
          category: "adult",
          min: 8900,
          max: 8900,
          validFrom: "2026-11-01",
          validUntil: "2026-11-07",
        },
        {
          productId: "studio-pass",
          variantId: "busy-november",
          category: "adult",
          min: 11900,
          max: 11900,
          validFrom: "2026-11-08",
          validUntil: "2026-11-30",
        },
      ]),
    );

    expect(
      admission(estimate(themePark, 1, { visitDate: "2026-11-14" })).cost,
    ).toEqual({ kind: "bounded", min: 11900, max: 11900 });
    expect(
      admission(estimate(themePark, 1, { visitDate: "2026-11-05" })).cost,
    ).toEqual({ kind: "bounded", min: 8900, max: 8900 });
    expect(admission(estimate(themePark, 1)).cost).toEqual({
      kind: "bounded",
      min: 8900,
      max: 11900,
    });
  });

  it("honors adult, child, online, and counter choices while excluding optional add-ons", () => {
    const museum = destination(
      "teamlab-like",
      variableAdmission([
        {
          productId: "standard",
          variantId: "online",
          category: "adult",
          min: 2600,
          max: 2600,
          channel: "online",
        },
        {
          productId: "standard",
          variantId: "online",
          category: "child",
          min: 1000,
          max: 1000,
          channel: "online",
        },
        {
          productId: "standard",
          variantId: "counter",
          category: "adult",
          min: 2800,
          max: 2800,
          channel: "counter",
        },
        {
          productId: "standard",
          variantId: "counter",
          category: "child",
          min: 1200,
          max: 1200,
          channel: "counter",
        },
        {
          productId: "audio-guide",
          variantId: "online-addon",
          category: "adult",
          min: 700,
          max: 700,
          channel: "online",
          optional: true,
        },
        {
          productId: "audio-guide",
          variantId: "online-addon",
          category: "child",
          min: 350,
          max: 350,
          channel: "online",
          optional: true,
        },
      ]),
    );
    const party = { adultCount: 1, childCount: 1 };

    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: { ...party, channel: "online" },
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 3600, max: 3600 });
    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: {
            ...party,
            channel: "online",
            addOnProductIds: ["audio-guide"],
          },
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 4650, max: 4650 });
    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: {
            ...party,
            addOnProductIds: ["audio-guide"],
          },
        }),
      ).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_product" });
    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: { ...party, channel: "counter" },
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 4000, max: 4000 });
    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: party,
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 3600, max: 4000 });

    const unknownComposition = admission(
      estimate(museum, 2, {
        visitDate: "2026-11-14",
        admissionSelection: { channel: "online" },
      }),
    );
    expect(unknownComposition.cost).toEqual({
      kind: "bounded",
      min: 2000,
      max: 5200,
    });
    expect(unknownComposition.evidence.admissionPricingBasis).toBe(
      "supported_range",
    );

    expect(
      admission(
        estimate(museum, 2, {
          visitDate: "2026-11-14",
          admissionSelection: {
            productId: "",
            adultCount: 1,
            childCount: 1,
          },
        }),
      ).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_product" });
  });

  it("keeps unknown admission incomplete when no reviewed price options exist", () => {
    const unresolved = destination("unknown-ticket", variableAdmission());
    const result = estimate(unresolved, 2, {
      visitDate: "2026-11-14",
    });

    expect(admission(result).cost).toEqual({ kind: "variable" });
    expect(result.total).toBeUndefined();
    expect(result.knownSubtotal).not.toEqual([0, 0]);
  });

  it("prices each paid itinerary stop once, skips hubs, and applies the stop date", () => {
    const city = destination(
      "tokyo-hub",
      {
        state: "not_applicable",
        provenance: "verified_source",
        reasonCode: "no_single_admission_product",
        cost: { kind: "not_applicable" },
        scope: "whole_area",
        basis: "The city hub has no single admission product.",
      },
      { role: "hub", kind: "city" },
    );
    const observatory = destination(
      "dated-attraction",
      variableAdmission([
        {
          productId: "standard",
          variantId: "selected-saturday",
          category: "adult",
          min: 10000,
          max: 10000,
          validFrom: "2026-11-14",
          validUntil: "2026-11-30",
        },
      ]),
    );
    const plan: DayPlan = {
      id: "kai-325-plan",
      duration: "2d1n",
      travelDate: "2026-11-13",
      title: { en: "Test plan", ja: "テストプラン" },
      steps: [
        {
          id: "hub",
          day: 1,
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "10:00",
          durationMinutes: 60,
          destination: city,
          title: { en: "Tokyo", ja: "東京" },
        },
        {
          id: "observatory",
          day: 2,
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "11:00",
          durationMinutes: 120,
          destination: observatory,
          title: { en: "Observatory", ja: "展望台" },
        },
        {
          id: "duplicate-observatory",
          day: 2,
          type: "destination",
          timeBlock: "afternoon",
          startTime: "13:00",
          endTime: "15:00",
          durationMinutes: 120,
          destination: observatory,
          title: { en: "Observatory", ja: "展望台" },
        },
      ],
      totalDurationMinutes: 300,
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };

    const cost = calculateGeneratedPlanCost(plan, 2);
    expect(cost.admission).toMatchObject({
      min: 20000,
      max: 20000,
      source: "curated",
      admissionPricingBasis: "selected_date",
    });
    expect(cost.accommodation).toMatchObject({
      applicable: true,
      source: "estimated",
    });
    expect(cost.localTransit.applicable).toBe(true);
    expect(cost.totalRange).toBeDefined();
  });

  it("retains verified-free park admission as zero with explicit evidence", () => {
    const park = destination(
      "free-park",
      {
        state: "verified_free",
        provenance: "verified_source",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
        basis: "Official source confirms free admission to the park.",
        sourceUrls,
        checkedAt: "2026-10-01",
      },
      { kind: "park" },
    );
    const price = admission(estimate(park, 2)).cost;

    expect(price).toEqual({ kind: "bounded", min: 0, max: 0 });
  });
});
