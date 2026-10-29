import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdmissionPriceSelection,
  Destination,
} from "@/shared/types/destination";

vi.mock("@/shared/hooks/useFullCatalogue", () => ({
  useFullCatalogue: () => ({ loading: true, error: null, retry: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../DayPlanWidget", () => ({
  DayPlanWidget: ({
    admissionSelection,
  }: {
    admissionSelection?: AdmissionPriceSelection;
  }) => (
    <output data-testid="day-plan-selection">
      {JSON.stringify(admissionSelection)}
    </output>
  ),
}));
vi.mock("../TripCostBreakdownWidget", () => ({
  TripCostBreakdownWidget: ({
    admissionSelection,
  }: {
    admissionSelection?: AdmissionPriceSelection;
  }) => (
    <output data-testid="cost-selection">
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
});

function renderPlanningSection(destination: Destination) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <DestinationPlanningSection
        destination={destination}
        locale="en"
        partySize={4}
        selectedTransport={null}
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
    } as unknown as Destination;
    renderPlanningSection(destination);

    const input = host!.querySelector<HTMLInputElement>(
      "#admission-child-count",
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
    ).toBe(JSON.stringify({ adultCount: 2, childCount: 2 }));
    expect(
      host!.querySelector('[data-testid="cost-selection"]')?.textContent,
    ).toBe(JSON.stringify({ adultCount: 2, childCount: 2 }));
  });
});
