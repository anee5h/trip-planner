import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDayPlan } from "../DayPlanGeneratorService";
import {
  loadDestinationsIndex,
  resetDestinationsIndexForTests,
} from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-121 delayed-loader test: DayPlan generation REQUIRES the full
 * catalogue. Before the loader resolves, the full list is empty — a plan
 * generated against it must be EMPTY/UNFEASIBLE (never fabricated from an
 * empty catalogue). After the loader resolves, generation produces a real
 * plan. This is the service-level proof behind the UI guard (the widget
 * disables Generate until the full catalogue is loaded).
 */
describe("KAI-121 DayPlan generation vs empty full catalogue", () => {
  afterEach(() => {
    resetDestinationsIndexForTests();
    // NOTE: do NOT unstubAllGlobals here — vitest.setup.ts installs the
    // destinations-index fetch stub globally; unstubbing would leave
    // subsequent tests with a real (broken) fetch.
  });

  const primary = {
    id: "tokyo-skytree",
    name: "Tokyo Skytree",
    prefecture: "Tokyo",
    coordinates: { lat: 35.7101, lng: 139.8107 },
    recommendedVisitHours: { min: 1, max: 2 },
    budgetMin: 2000,
    budgetMax: 3000,
  } as Destination;

  it("generation against an unloaded (empty) full catalogue has no catalogue candidates", async () => {
    // No loader preload: the full catalogue is EMPTY (the loader is a
    // singleton that has never resolved). The UI guard (DayPlanWidget)
    // prevents invoking generateDayPlan in this state; at the service
    // level, the plan cannot reference any catalogue-derived candidate
    // because there are none.
    resetDestinationsIndexForTests();
    const plan = generateDayPlan(primary, { planType: "half_day" });
    // Every step must be either the anchor itself or null — no
    // catalogue-sourced stops exist to add.
    const nonAnchorSteps = plan.steps.filter(
      (s) => s.destination?.id !== primary.id,
    );
    expect(nonAnchorSteps.length).toBe(0);
  });

  it("generation produces a real plan after the full catalogue loads", async () => {
    await loadDestinationsIndex();
    const plan = generateDayPlan(primary, { planType: "half_day" });
    // With the full catalogue, a real plan exists (may still be infeasible
    // for routing reasons, but it must NOT be the empty-catalogue artifact).
    expect(plan.id).not.toBe("empty-plan");
  });

  it("the UI guard contract: handleGeneratePlan no-ops before load (simulated)", async () => {
    // Mirrors the DayPlanWidget guard: while the full catalogue is not
    // loaded, the generator must not be invoked with empty data. Simulate
    // a slow network (never-resolving fetch) so the loader stays pending.
    resetDestinationsIndexForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const stillPending = await Promise.race([
      loadDestinationsIndex().then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 20)),
    ]);
    // The loader is pending — the guard would see loading=true and
    // disable Generate.
    expect(stillPending).toBe(true);
  });
});
