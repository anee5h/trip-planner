import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, it, expect } from "vitest";
import { generateDayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import type { Destination } from "@/shared/types/destination";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import { DayPlanWidget } from "../DayPlanWidget";

// KAI-121: generateDayPlan needs the FULL catalogue (nearby candidates).
beforeAll(async () => {
  await loadDestinationsIndex();
});

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const mockPoi1 = {
  id: "poi-1",
  name: "POI One",
  nameJa: "スポット1",
  kind: "landmark",
  role: "anchor",
  placeType: "destination",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["sightseeing"],
  heroImage: "https://example.com/hero.jpg",
  description: "Test landmark",
  areaId: "shinjuku",
  coordinates: { lat: 35.69, lng: 139.7 },
  recommendedVisitHours: { min: 1, max: 3 },
  businessHours: "09:00 - 18:00",
  openingHoursMetadata: {
    verifiedAt: new Date().toISOString(),
    sourceUrl: "https://official.example.com",
  },
} as unknown as Destination;

const mockHub = {
  id: "hub-1",
  name: "Shinjuku Hub",
  nameJa: "新宿ハブ",
  kind: "district",
  role: "hub",
  placeType: "hub",
  prefecture: "Tokyo",
  region: "Kanto",
  categories: ["district"],
  heroImage: "https://example.com/hub.jpg",
  description: "Test district hub",
  areaId: "shinjuku",
  coordinates: { lat: 35.69, lng: 139.7 },
  relationships: {
    featuredDestinationIds: ["poi-1"],
  },
} as unknown as Destination;

describe("DayPlanGeneratorService - Disclosures & Hub Routing", () => {
  it("reorders destination cards despite intervening travel steps", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <MemoryRouter>
          <DayPlanWidget destination={mockPoi1} />
        </MemoryRouter>,
      );
    });

    act(() => {
      Array.from(host!.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Create day plan"))
        ?.click();
    });
    act(() => {
      Array.from(host!.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Generate Plan"))
        ?.click();
    });

    const before = Array.from(
      host.querySelectorAll('a[href^="/destinations/"]'),
    ).map((link) => link.textContent);
    const moveDown = host.querySelector<HTMLButtonElement>(
      '[title="Move down"]',
    );
    expect(moveDown).not.toBeNull();

    act(() => moveDown!.click());
    const after = Array.from(
      host.querySelectorAll('a[href^="/destinations/"]'),
    ).map((link) => link.textContent);
    expect(after[0]).not.toBe(before[0]);
  });

  it("populates uncertainHoursDisclosures for unverified or stale locations", () => {
    const unverifiedPoi: Destination = {
      ...mockPoi1,
      id: "unverified-1",
      openingHoursMetadata: undefined,
    };
    const plan = generateDayPlan(unverifiedPoi, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.uncertainHoursDisclosures.length).toBeGreaterThan(0);
    expect(
      plan.uncertainHoursDisclosures.some(
        (u) => u.destinationId === "unverified-1",
      ),
    ).toBe(true);
  });

  it("does not schedule a transit leg from hub anchor to first POI", () => {
    const plan = generateDayPlan(mockHub, {
      planType: "half_day",
      availableMinutes: 300,
    });

    expect(plan.isUnfeasible).toBe(false);
    const legs = plan.routeLegs ?? [];
    expect(legs.length).toBeGreaterThanOrEqual(1);

    const firstLeg = legs[0];
    expect(firstLeg.fromDestinationId).not.toBe("hub-1");

    const firstRealStop = plan.steps.find(
      (step) => step.type === "destination",
    );
    expect(firstRealStop?.startTime).toBe("09:00");
    expect(plan.steps.some((step) => step.destination?.id === "hub-1")).toBe(
      false,
    );
  });
});
