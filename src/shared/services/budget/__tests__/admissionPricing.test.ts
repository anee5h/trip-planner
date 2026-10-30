import { describe, expect, it } from "vitest";
import type {
  AdmissionPriceSelection,
  AdmissionPriceOption,
  Destination,
} from "@/shared/types/destination";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { calculateGeneratedPlanCost } from "../GeneratedPlanCostService";
import { calculateTripEstimate } from "../tripEstimateEngine";
import { validateAdmissionFact } from "../factValidation";

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
): NonNullable<Destination["admission"]> {
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
  it("treats an empty price-options array like an absent one", () => {
    const legacyFact = {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 1000, max: 1000 },
      sourceUrls,
      checkedAt: "2026-10-01",
    };

    expect(validateAdmissionFact({ ...legacyFact, priceOptions: [] })).toEqual(
      validateAdmissionFact(legacyFact),
    );
  });

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
    expect(selected.evidence.admissionPricingBasis).toBe("supported_range");

    const unselectedSlot = admission(
      estimate(deck, 2, {
        visitDate: "2026-11-14",
        admissionSelection: { adultCount: 2, childCount: 0 },
      }),
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

    const adult = { adultCount: 1, childCount: 0 };
    expect(
      admission(
        estimate(themePark, 1, {
          visitDate: "2026-11-14",
          admissionSelection: adult,
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 11900, max: 11900 });
    expect(
      admission(
        estimate(themePark, 1, {
          visitDate: "2026-11-05",
          admissionSelection: adult,
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 8900, max: 8900 });
    expect(
      admission(estimate(themePark, 1, { admissionSelection: adult })).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_date" });
  });

  it("keeps variable facts and date-bounded price ranges from reading as exact", () => {
    const genericVariable = destination(
      "generic-variable-price",
      variableAdmission([
        {
          productId: "standard",
          variantId: "general",
          category: "adult",
          min: 1500,
          max: 1500,
        },
      ]),
    );
    expect(
      admission(
        estimate(genericVariable, 1, {
          admissionSelection: { adultCount: 1, childCount: 0 },
        }),
      ).evidence.admissionPricingBasis,
    ).toBe("supported_range");

    const datedRange = destination("dated-range", {
      ...variableAdmission([
        {
          productId: "standard",
          variantId: "selected-date-range",
          category: "adult",
          min: 1500,
          max: 2200,
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
        },
      ]),
      state: "verified_paid",
      reasonCode: undefined,
      cost: { kind: "bounded", min: 1500, max: 2200 },
    });
    const selectedRange = admission(
      estimate(datedRange, 1, {
        visitDate: "2026-11-14",
        admissionSelection: { adultCount: 1, childCount: 0 },
      }),
    );
    expect(selectedRange.cost).toEqual({
      kind: "bounded",
      min: 1500,
      max: 2200,
    });
    expect(selectedRange.evidence.admissionPricingBasis).toBe(
      "supported_range",
    );
  });

  it("does not merge unrelated base products when the product is unspecified", () => {
    const venue = destination(
      "multiple-products",
      variableAdmission([
        {
          productId: "standard",
          variantId: "entry",
          category: "adult",
          min: 1000,
          max: 1000,
        },
        {
          productId: "combo",
          variantId: "entry-and-exhibit",
          category: "adult",
          min: 3000,
          max: 3000,
        },
      ]),
    );
    expect(
      admission(
        estimate(venue, 1, {
          admissionSelection: { adultCount: 1, childCount: 0 },
        }),
      ).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_product" });
    expect(
      admission(
        estimate(venue, 1, {
          admissionSelection: {
            productId: "standard",
            adultCount: 1,
            childCount: 0,
          },
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 1000, max: 1000 });
  });

  it("keeps exact date variants of variable-price facts in a supported range", () => {
    const venue = destination(
      "variable-exact-date-option",
      variableAdmission([
        {
          productId: "standard",
          variantId: "selected-day",
          category: "adult",
          min: 1500,
          max: 1500,
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
        },
      ]),
    );
    const result = admission(
      estimate(venue, 1, {
        visitDate: "2026-11-14",
        admissionSelection: { adultCount: 1, childCount: 0 },
      }),
    );
    expect(result.cost).toEqual({ kind: "bounded", min: 1500, max: 1500 });
    expect(result.evidence.admissionPricingBasis).toBe("supported_range");
  });

  it("derives holiday tiers from the reviewed calendar and preserves overlapping weekend tiers", () => {
    const venue = destination(
      "holiday-tier-venue",
      variableAdmission([
        {
          productId: "standard",
          variantId: "weekday",
          category: "adult",
          min: 1000,
          max: 1000,
          dayType: "weekday",
        },
        {
          productId: "standard",
          variantId: "weekend",
          category: "adult",
          min: 1500,
          max: 1500,
          dayType: "weekend",
        },
        {
          productId: "standard",
          variantId: "holiday",
          category: "adult",
          min: 2000,
          max: 2000,
          dayType: "holiday",
        },
      ]),
    );
    const party = { adultCount: 1, childCount: 0 };

    const misclassifiedHoliday = admission(
      estimate(venue, 1, {
        visitDate: "2026-11-23",
        admissionSelection: {
          ...party,
          dayTypesByDate: { "2026-11-23": "weekday" },
        } as AdmissionPriceSelection,
      }),
    );
    expect(misclassifiedHoliday.cost).toEqual({
      kind: "bounded",
      min: 2000,
      max: 2000,
    });
    expect(misclassifiedHoliday.evidence.admissionPricingBasis).toBe(
      "supported_range",
    );

    expect(
      admission(
        estimate(venue, 1, {
          visitDate: "2026-05-03",
          admissionSelection: party,
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 1500, max: 2000 });
    expect(
      admission(
        estimate(venue, 1, {
          visitDate: "2026-11-24",
          admissionSelection: party,
        }),
      ).evidence.admissionPricingBasis,
    ).toBe("supported_range");
    expect(
      admission(
        estimate(venue, 1, {
          visitDate: "2027-01-04",
          admissionSelection: party,
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 1000, max: 1000 });
    expect(
      admission(
        estimate(venue, 1, {
          visitDate: "2028-01-03",
          admissionSelection: party,
        }),
      ).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_date" });

    const weekdayWeekendOnly = destination(
      "weekday-weekend-only",
      variableAdmission([
        {
          productId: "standard",
          variantId: "weekday",
          category: "adult",
          min: 1000,
          max: 1000,
          dayType: "weekday",
        },
        {
          productId: "standard",
          variantId: "weekend",
          category: "adult",
          min: 1500,
          max: 1500,
          dayType: "weekend",
        },
      ]),
    );
    expect(
      admission(
        estimate(weekdayWeekendOnly, 1, {
          visitDate: "2026-11-23",
          admissionSelection: party,
        }),
      ).cost,
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_date" });
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

    const channelVariantBaseWithSimpleAddOn = destination(
      "channel-base-simple-addon",
      variableAdmission([
        {
          productId: "standard",
          variantId: "online",
          category: "adult",
          min: 1000,
          max: 1000,
          channel: "online",
        },
        {
          productId: "standard",
          variantId: "counter",
          category: "adult",
          min: 1200,
          max: 1200,
          channel: "counter",
        },
        {
          productId: "guide",
          variantId: "guide",
          category: "adult",
          min: 300,
          max: 300,
          optional: true,
        },
      ]),
    );
    expect(
      admission(
        estimate(channelVariantBaseWithSimpleAddOn, 1, {
          admissionSelection: {
            adultCount: 1,
            childCount: 0,
            addOnProductIds: ["guide"],
          },
        }),
      ).cost,
    ).toEqual({ kind: "bounded", min: 1300, max: 1500 });

    const conditionalAddOn = destination(
      "conditional-addon",
      variableAdmission([
        {
          productId: "standard",
          variantId: "online-evening",
          category: "adult",
          min: 2600,
          max: 2600,
          channel: "online",
          timeSlot: "18:00",
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
        },
        {
          productId: "audio-guide",
          variantId: "online-evening-addon",
          category: "adult",
          min: 700,
          max: 700,
          channel: "online",
          timeSlot: "18:00",
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
          optional: true,
        },
      ]),
    );
    const selectedAddOn = {
      productId: "standard",
      adultCount: 1,
      childCount: 0,
      addOnProductIds: ["audio-guide"],
    };
    const resolution = (
      selection: AdmissionPriceSelection,
      visitDate?: string,
    ) =>
      admission(
        estimate(conditionalAddOn, 1, {
          visitDate,
          admissionSelection: selection,
        }),
      ).cost;

    expect(resolution(selectedAddOn)).toEqual({
      kind: "unavailable",
      reason: "price_variable_by_product",
    });
    expect(resolution({ ...selectedAddOn, channel: "online" })).toEqual({
      kind: "unavailable",
      reason: "price_variable_by_time",
    });
    expect(
      resolution({ ...selectedAddOn, channel: "online", timeSlot: "18:00" }),
    ).toEqual({ kind: "unavailable", reason: "price_variable_by_date" });
    expect(
      resolution(
        { ...selectedAddOn, channel: "online", timeSlot: "18:00" },
        "2026-11-14",
      ),
    ).toEqual({ kind: "bounded", min: 3300, max: 3300 });

    const fixedBaseWithDatedAddOn = destination(
      "fixed-base-dated-addon",
      variableAdmission([
        {
          productId: "standard",
          variantId: "fixed-entry",
          category: "adult",
          min: 2600,
          max: 2600,
        },
        {
          productId: "audio-guide",
          variantId: "dated-addon",
          category: "adult",
          min: 500,
          max: 500,
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
          optional: true,
        },
      ]),
    );
    const fixedAndDated = admission(
      estimate(fixedBaseWithDatedAddOn, 1, {
        visitDate: "2026-11-14",
        admissionSelection: selectedAddOn,
      }),
    );
    expect(fixedAndDated.cost).toEqual({
      kind: "bounded",
      min: 3100,
      max: 3100,
    });
    expect(fixedAndDated.evidence.admissionPricingBasis).toBe(
      "supported_range",
    );
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

    const unknownPartyEstimate = estimate(museum, 2, {
      visitDate: "2026-11-14",
      admissionSelection: { channel: "online" },
    });
    const unknownComposition = admission(unknownPartyEstimate);
    expect(unknownComposition.cost).toEqual({
      kind: "bounded",
      min: 5200,
      max: 5200,
    });
    expect(unknownComposition.evidence.derivation).toBe("model_estimate");
    expect(unknownComposition.evidence.admissionCompositionAssumed).toBe(true);
    expect(unknownComposition.evidence.admissionPricingBasis).toBeUndefined();
    expect(unknownPartyEstimate.estimateQuality).toBe("rough");

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

  it("uses an explicitly labelled adult assumption for an unknown solo party", () => {
    const adultTicket = destination(
      "adult-only-ticket",
      variableAdmission([
        {
          productId: "standard",
          variantId: "adult",
          category: "adult",
          min: 1000,
          max: 1000,
        },
      ]),
    );

    const assumed = admission(estimate(adultTicket, 1));
    expect(assumed.cost).toEqual({ kind: "bounded", min: 1000, max: 1000 });
    expect(assumed.evidence.derivation).toBe("model_estimate");
    expect(assumed.evidence.state).toBe("documented_estimate");
    expect(assumed.evidence.provenance).toBe("model");
    expect(assumed.evidence.admissionCompositionAssumed).toBe(true);
    expect(assumed.evidence.admissionPricingBasis).toBeUndefined();
    const explicit = admission(
      estimate(adultTicket, 1, {
        admissionSelection: { adultCount: 1, childCount: 0 },
      }),
    );
    expect(explicit.cost).toEqual({ kind: "bounded", min: 1000, max: 1000 });
    expect(explicit.evidence.admissionPricingBasis).toBe("supported_range");
  });

  it("rejects price options that disagree with the fact-level cost envelope", () => {
    const inconsistent = destination("inconsistent-options", {
      ...variableAdmission([
        {
          productId: "standard",
          variantId: "adult",
          category: "adult",
          min: 1000,
          max: 1000,
        },
      ]),
      state: "verified_paid",
      cost: { kind: "bounded", min: 1200, max: 1200 },
    });
    expect(
      admission(
        estimate(inconsistent, 1, {
          admissionSelection: { adultCount: 1, childCount: 0 },
        }),
      ).cost.kind,
    ).toBe("unavailable");

    const inconsistentFrom = destination("inconsistent-from", {
      ...variableAdmission([
        {
          productId: "standard",
          variantId: "adult",
          category: "adult",
          min: 1000,
          max: 1500,
        },
      ]),
      cost: { kind: "open_ended", from: 1200 },
    });
    expect(
      admission(
        estimate(inconsistentFrom, 1, {
          admissionSelection: { adultCount: 1, childCount: 0 },
        }),
      ).cost.kind,
    ).toBe("unavailable");
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
          validUntil: "2026-11-14",
        },
        {
          productId: "standard",
          variantId: "selected-sunday",
          category: "adult",
          min: 11000,
          max: 11000,
          validFrom: "2026-11-15",
          validUntil: "2026-11-30",
        },
      ]),
    );
    const plan: DayPlan = {
      id: "kai-325-plan",
      duration: "2d1n",
      travelDate: "2026-11-13",
      admissionSelection: { adultCount: 2, childCount: 0 },
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
      admissionPricingBasis: "supported_range",
    });
    expect(
      calculateGeneratedPlanCost(plan, 2, null, false, undefined, {
        travelDate: "2026-11-14",
        admissionSelection: { adultCount: 2, childCount: 0 },
      }).admission,
    ).toMatchObject({
      min: 22000,
      max: 22000,
      admissionPricingBasis: "supported_range",
    });
    expect(cost.accommodation).toMatchObject({
      applicable: true,
      source: "estimated",
    });
    expect(cost.localTransit.applicable).toBe(true);
    expect(cost.totalRange).toBeDefined();
  });

  it("prices repeat visits against each visit day", () => {
    const attraction = destination(
      "repeat-visit-attraction",
      variableAdmission([
        {
          productId: "standard",
          variantId: "saturday",
          category: "adult",
          min: 1000,
          max: 1000,
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
        },
        {
          productId: "standard",
          variantId: "sunday",
          category: "adult",
          min: 2000,
          max: 2000,
          validFrom: "2026-11-15",
          validUntil: "2026-11-15",
        },
      ]),
    );
    const plan: DayPlan = {
      id: "repeat-visit-plan",
      duration: "2d1n",
      travelDate: "2026-11-14",
      admissionSelection: { adultCount: 1, childCount: 0 },
      title: { en: "Repeat visit", ja: "再訪" },
      steps: [1, 2].map((day) => ({
        id: `visit-${day}`,
        day,
        type: "destination" as const,
        timeBlock: "morning" as const,
        startTime: "09:00",
        endTime: "11:00",
        durationMinutes: 120,
        destination: attraction,
        title: { en: "Attraction", ja: "施設" },
      })),
      totalDurationMinutes: 240,
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };

    const singleVisit = calculateGeneratedPlanCost(
      { ...plan, steps: plan.steps.slice(0, 1) },
      1,
    );
    const repeatVisit = calculateGeneratedPlanCost(plan, 1);
    expect(repeatVisit.admission).toMatchObject({
      min: 3000,
      max: 3000,
      admissionPricingBasis: "supported_range",
    });
    expect(repeatVisit.localTransit).toEqual(singleVisit.localTransit);
    expect(repeatVisit.meals).toEqual(singleVisit.meals);
    expect(repeatVisit.accommodation).toEqual(singleVisit.accommodation);
  });

  it("labels a plan estimate when a paid stop has no verified pricing basis", () => {
    const datePriced = destination(
      "date-priced",
      variableAdmission([
        {
          productId: "standard",
          variantId: "dated",
          category: "adult",
          min: 1000,
          max: 1000,
          validFrom: "2026-11-14",
          validUntil: "2026-11-14",
        },
      ]),
    );
    const rangePriced = destination(
      "range-priced",
      variableAdmission([
        {
          productId: "standard",
          variantId: "published-range",
          category: "adult",
          min: 2000,
          max: 2500,
        },
      ]),
    );
    const stopPlan: DayPlan = {
      id: "basis-plan",
      travelDate: "2026-11-14",
      admissionSelection: { adultCount: 1, childCount: 0 },
      title: { en: "Basis plan", ja: "根拠の計画" },
      steps: [datePriced, rangePriced].map((dest) => ({
        id: dest.id,
        day: 1,
        type: "destination" as const,
        timeBlock: "morning",
        startTime: "09:00",
        endTime: "11:00",
        durationMinutes: 120,
        destination: dest,
        title: { en: dest.name, ja: dest.nameJa ?? dest.name },
      })),
      totalDurationMinutes: 240,
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    };

    expect(calculateGeneratedPlanCost(stopPlan, 1).admission).toMatchObject({
      min: 3000,
      max: 3500,
      admissionPricingBasis: "supported_range",
    });

    const flatPriced = destination("flat-priced", {
      state: "verified_paid",
      provenance: "verified_source",
      cost: { kind: "bounded", min: 3000, max: 3000 },
      scope: "general_entry",
      basis: "Synthetic reviewed admission fact.",
      sourceUrls,
      checkedAt: "2026-10-01",
    });
    const dateAndFixedPlan: DayPlan = {
      ...stopPlan,
      steps: [datePriced, flatPriced].map((dest) => ({
        id: dest.id,
        day: 1,
        type: "destination" as const,
        timeBlock: "morning",
        startTime: "09:00",
        endTime: "11:00",
        durationMinutes: 120,
        destination: dest,
        title: { en: dest.name, ja: dest.nameJa ?? dest.name },
      })),
    };
    expect(
      calculateGeneratedPlanCost(dateAndFixedPlan, 1).admission,
    ).toMatchObject({
      min: 4000,
      max: 4000,
      admissionPricingBasis: "supported_range",
    });

    const legacyPriced = destination("legacy-open-ended", {
      state: "variable_price",
      provenance: "verified_source",
      reasonCode: "price_variable_by_date",
      cost: { kind: "open_ended", from: 3000 },
      scope: "general_entry",
      sourceUrls,
      checkedAt: "2026-10-01",
    });
    const mixedPlan: DayPlan = {
      ...stopPlan,
      steps: [datePriced, legacyPriced].map((dest) => ({
        id: dest.id,
        day: 1,
        type: "destination" as const,
        timeBlock: "morning",
        startTime: "09:00",
        endTime: "11:00",
        durationMinutes: 120,
        destination: dest,
        title: { en: dest.name, ja: dest.nameJa ?? dest.name },
      })),
    };

    expect(calculateGeneratedPlanCost(mixedPlan, 1).admission).toMatchObject({
      min: 4000,
      source: "estimated",
    });
    expect(
      calculateGeneratedPlanCost(mixedPlan, 1).admission.max,
    ).toBeGreaterThan(4000);
    expect(
      calculateGeneratedPlanCost(mixedPlan, 1).admission.admissionPricingBasis,
    ).toBeUndefined();
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
