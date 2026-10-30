import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdmissionPriceSelection,
  Destination,
} from "@/shared/types/destination";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";

const plannerCapture = vi.hoisted(() => ({
  selectionRefs: [] as unknown[],
  generatedPlan: null as unknown,
}));

vi.mock("@/shared/hooks/useFullCatalogue", () => ({
  useFullCatalogue: () => ({ loading: true, error: null, retry: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../DayPlanWidget", () => ({
  DayPlanWidget: ({
    admissionSelection,
    onPlanGenerated,
  }: {
    admissionSelection?: AdmissionPriceSelection;
    onPlanGenerated?: (plan: DayPlan | null) => void;
  }) => (
    <>
      {plannerCapture.selectionRefs.push(admissionSelection) && null}
      <output data-testid="day-plan-selection">
        {JSON.stringify(admissionSelection)}
      </output>
      <button
        type="button"
        data-testid="generate-plan"
        onClick={() =>
          plannerCapture.generatedPlan &&
          onPlanGenerated?.({
            ...(plannerCapture.generatedPlan as DayPlan),
            admissionSelection,
          })
        }
      />
    </>
  ),
}));
vi.mock("../TripCostBreakdownWidget", () => ({
  TripCostBreakdownWidget: ({
    admissionSelection,
    visitDate,
  }: {
    admissionSelection?: AdmissionPriceSelection;
    visitDate?: string;
  }) => (
    <output data-testid="cost-selection" data-visit-date={visitDate}>
      {JSON.stringify(admissionSelection)}
    </output>
  ),
}));

import {
  DestinationPlanningSection,
  getPlannerTransportScopeNotice,
} from "../DestinationPlanningSection";
import {
  selectionForPartySize,
  selectionWithPartyComposition,
} from "@/shared/services/budget/admissionPricing";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  plannerCapture.generatedPlan = null;
  plannerCapture.selectionRefs = [];
});

function renderPlanningSection(
  destination: Destination,
  options: {
    partySize?: number;
    childCount?: number;
    admissionSelection?: AdmissionPriceSelection;
    travelDate?: string;
    compactUnavailableCost?: boolean;
    onChildCountChange?: (childCount: number | undefined) => void;
    onPlanGenerated?: (plan: DayPlan | null) => void;
  } = {},
) {
  if (!host) {
    plannerCapture.selectionRefs = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => {
    root!.render(
      <DestinationPlanningSection
        destination={destination}
        locale="en"
        partySize={options.partySize ?? 4}
        childCount={options.childCount}
        admissionSelection={options.admissionSelection}
        travelDate={options.travelDate}
        selectedTransport={null}
        compactUnavailableCost={options.compactUnavailableCost}
        onChildCountChange={options.onChildCountChange}
        onPlanGenerated={options.onPlanGenerated}
        onSaveToItinerary={vi.fn()}
      />,
    );
  });
}

describe("DestinationPlanningSection", () => {
  it("exports DestinationPlanningSection function component", () => {
    expect(typeof DestinationPlanningSection).toBe("function");
  });

  it("points saved-origin travellers to the canonical cost breakdown", () => {
    const notice = getPlannerTransportScopeNotice("en", true);
    expect(notice).toContain("excludes travel to the first stop");
    expect(notice).toContain("canonical trip-cost scope");
  });

  it("keeps the Japanese origin notice aligned with the breakdown", () => {
    const notice = getPlannerTransportScopeNotice("ja", true);
    expect(notice).toContain("費用内訳で旅行全体の費用範囲を確認できます");
  });

  it("does not imply origin cost when no origin is saved, in EN and JA", () => {
    expect(getPlannerTransportScopeNotice("en", false)).toContain(
      "On-site estimate — set an origin to include travel",
    );
    expect(getPlannerTransportScopeNotice("ja", false)).toContain(
      "現地費用の目安です。出発地を設定すると交通費も含まれます",
    );
  });

  it("drops stale party counts before saving the ticket context", () => {
    expect(
      selectionForPartySize(
        { adultCount: 2, childCount: 1, channel: "online" },
        2,
      ),
    ).toEqual({ channel: "online" });
    expect(
      selectionForPartySize(
        { adultCount: 1, childCount: 1, channel: "online" },
        2,
      ),
    ).toEqual({ adultCount: 1, childCount: 1, channel: "online" });
  });

  it("uses the selected child count and preserves ticket choices", () => {
    expect(
      selectionWithPartyComposition(
        { channel: "online", addOnProductIds: ["guide"] },
        4,
        2,
      ),
    ).toEqual({
      channel: "online",
      addOnProductIds: ["guide"],
      adultCount: 2,
      childCount: 2,
    });
    expect(
      selectionWithPartyComposition(
        { adultCount: 2, childCount: 2, channel: "online" },
        4,
        null,
      ),
    ).toEqual({ channel: "online" });
  });

  it("wires the selected party composition into planning and cost estimates", () => {
    const destination = {
      id: "party-mix-test",
      name: "Party Mix Test",
      nameJa: "人数構成テスト",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination;
    renderPlanningSection(destination);

    const input = host!.querySelector<HTMLInputElement>(
      'input[inputmode="numeric"]',
    )!;
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      host!.querySelector('[data-testid="day-plan-selection"]')?.textContent,
    ).toBe(
      JSON.stringify({
        productId: "standard",
        adultCount: 2,
        childCount: 2,
      }),
    );
    expect(
      host!.querySelector('[data-testid="cost-selection"]')?.textContent,
    ).toBe(
      JSON.stringify({
        productId: "standard",
        adultCount: 2,
        childCount: 2,
      }),
    );
  });

  it("hides child count without ticket options and shows it when options exist", () => {
    const destination = {
      id: "no-options",
      name: "No Options",
      nameJa: "選択肢なし",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
    } as unknown as Destination;
    renderPlanningSection(destination);
    expect(host!.querySelector('input[inputmode="numeric"]')).toBeNull();

    act(() => root!.unmount());
    root = undefined;
    host!.remove();
    host = undefined;

    renderPlanningSection({
      ...destination,
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination);
    expect(host!.querySelector('input[inputmode="numeric"]')).not.toBeNull();
  });

  it("shows child count when a generated stop has ticket options", () => {
    const currentDestination = {
      id: "plan-without-options",
      name: "Plan Without Options",
      nameJa: "料金選択肢なし",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
    } as unknown as Destination;
    const ticketedStop = {
      ...currentDestination,
      id: "ticketed-plan-stop",
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination;
    plannerCapture.generatedPlan = {
      id: "plan-with-ticketed-stop",
      travelDate: "2026-11-14",
      title: { en: "Plan", ja: "計画" },
      steps: [
        {
          id: "ticketed-stop",
          type: "destination",
          timeBlock: "morning",
          startTime: "09:00",
          endTime: "10:00",
          durationMinutes: 60,
          destination: ticketedStop,
          title: {
            en: ticketedStop.name,
            ja: ticketedStop.nameJa ?? ticketedStop.name,
          },
        },
      ],
      totalDurationMinutes: 60,
      isOverfilled: false,
      isUnfeasible: true,
      uncertainHoursDisclosures: [],
    } satisfies DayPlan;
    renderPlanningSection(currentDestination);

    expect(host!.querySelector('input[inputmode="numeric"]')).toBeNull();
    act(() =>
      host!
        .querySelector<HTMLButtonElement>('[data-testid="generate-plan"]')!
        .click(),
    );

    expect(host!.querySelector('input[inputmode="numeric"]')).not.toBeNull();
  });

  it("keeps the cost selection unchanged and flags an oversized child count", () => {
    const destination = {
      id: "child-count-error",
      name: "Child Count Error",
      nameJa: "子ども人数エラー",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination;
    renderPlanningSection(destination, {
      partySize: 3,
      admissionSelection: { adultCount: 3, childCount: 0 },
    });
    const input = host!.querySelector<HTMLInputElement>(
      'input[inputmode="numeric"]',
    )!;
    const costNoteBefore = host!.querySelector(
      '[data-testid="cost-selection"]',
    )!.textContent;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "9");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("-error");
    expect(host!.textContent).toContain(
      "planner.admissionPartyComposition.exceedsPartySize",
    );
    expect(
      host!.querySelector('[data-testid="cost-selection"]')!.textContent,
    ).toBe(costNoteBefore);
  });

  it("lets travelers select a ticket product, channel, time slot, and add-on", () => {
    const destination = {
      id: "ticket-options",
      name: "Ticket Options",
      nameJa: "チケット選択肢",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          ...["standard", "premium"].flatMap((productId, index) => [
            {
              productId,
              variantId: "entry",
              category: "adult" as const,
              min: index ? 2000 : 1000,
              max: index ? 2000 : 1000,
              channel: index ? ("counter" as const) : ("online" as const),
              timeSlot: index ? "evening" : "morning",
            },
            {
              productId,
              variantId: "entry",
              category: "child" as const,
              min: index ? 1000 : 500,
              max: index ? 1000 : 500,
              channel: index ? ("counter" as const) : ("online" as const),
              timeSlot: index ? "evening" : "morning",
            },
          ]),
          {
            productId: "guide",
            variantId: "audio-guide",
            category: "adult" as const,
            min: 500,
            max: 500,
            channel: "online" as const,
            timeSlot: "morning",
            optional: true,
          },
        ],
      },
    } as unknown as Destination;
    renderPlanningSection(destination, { partySize: 2, childCount: 1 });
    const product = host!.querySelector<HTMLSelectElement>(
      '[aria-label="planner.admissionOptions.product"]',
    )!;
    const channel = host!.querySelector<HTMLSelectElement>(
      '[aria-label="planner.admissionOptions.channel"]',
    )!;
    const timeSlot = host!.querySelector<HTMLSelectElement>(
      '[aria-label="planner.admissionOptions.timeSlot"]',
    )!;
    act(() => {
      product.value = "premium";
      product.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      channel.value = "counter";
      channel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      timeSlot.value = "evening";
      timeSlot.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const addOn = host!.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    act(() => {
      addOn.click();
    });

    expect(
      JSON.parse(
        host!.querySelector('[data-testid="day-plan-selection"]')!.textContent!,
      ),
    ).toMatchObject({
      productId: "premium",
      channel: "counter",
      timeSlot: "evening",
      addOnProductIds: ["guide"],
      adultCount: 1,
      childCount: 1,
    });
  });

  it("keeps admission selection references stable across unrelated rerenders", () => {
    const destination = {
      id: "memoized-selection",
      name: "Memoized Selection",
      nameJa: "選択をメモ化",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination;
    const selection = {
      productId: "standard",
      adultCount: 3,
      childCount: 1,
    };
    renderPlanningSection(destination, { admissionSelection: selection });
    const firstSelection = plannerCapture.selectionRefs.at(-1);
    renderPlanningSection(destination, {
      admissionSelection: selection,
      compactUnavailableCost: true,
    });

    expect(plannerCapture.selectionRefs.at(-1)).toBe(firstSelection);
  });

  it("forwards a regenerated plan with the live child split", () => {
    const destination = {
      id: "live-plan-selection",
      name: "Live Plan Selection",
      nameJa: "最新の計画選択",
      kind: "museum",
      role: "poi",
      placeType: "destination",
      prefecture: "Tokyo",
      region: "Kanto",
      categories: ["Culture"],
      coordinates: { lat: 35.68, lng: 139.76 },
      admission: {
        state: "variable_price",
        provenance: "verified_source",
        reasonCode: "price_variable_by_date",
        cost: { kind: "variable" },
        scope: "general_entry",
        sourceUrls: ["https://example.test/admission"],
        checkedAt: "2026-01-01",
        priceOptions: [
          {
            productId: "standard",
            variantId: "entry",
            category: "adult",
            min: 1000,
            max: 1000,
          },
        ],
      },
    } as unknown as Destination;
    const published: Array<DayPlan | null> = [];
    plannerCapture.generatedPlan = {
      id: "generated-plan",
      duration: "fullDay",
      travelDate: "2026-01-01",
      title: { en: "Generated", ja: "生成" },
      steps: [],
      totalDurationMinutes: 0,
      isOverfilled: false,
      uncertainHoursDisclosures: [],
    } satisfies DayPlan;
    renderPlanningSection(destination, {
      partySize: 4,
      childCount: 1,
      travelDate: "2026-11-14",
      onPlanGenerated: (plan) => published.push(plan),
    });
    act(() => {
      host!
        .querySelector<HTMLButtonElement>('[data-testid="generate-plan"]')!
        .click();
    });
    const childInput = host!.querySelector<HTMLInputElement>(
      'input[inputmode="numeric"]',
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(childInput, "3");
      childInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(published.at(-1)).toMatchObject({
      travelDate: "2026-11-14",
      admissionSelection: { adultCount: 1, childCount: 3 },
    });
    plannerCapture.generatedPlan = null;
  });
});
