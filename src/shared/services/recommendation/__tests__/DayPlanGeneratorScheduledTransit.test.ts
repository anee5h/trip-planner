import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import destinationIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  generateDayPlanWithScheduledTransit,
  isRealDestinationStop,
  removeStepFromPlan,
} from "../DayPlanGeneratorService";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";

const TOEI_DATASET = readFileSync(
  join(process.cwd(), "public/data/transit/toei-oedo-gtfs-20260314.json"),
  "utf8",
);
const catalogue = destinationIndex as unknown as Destination[];
const hamarikyu = catalogue.find(
  (destination) => destination.id === "hamarikyu-gardens",
)!;

beforeAll(async () => {
  await loadDestinationsIndex();
});

describe("generateDayPlanWithScheduledTransit", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(TOEI_DATASET, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses verified scheduled duration for the explicit Toei planner corridor", async () => {
    const plan = await generateDayPlanWithScheduledTransit(hamarikyu, {
      catalogue,
      planType: "half_day",
      startTime: "05:00",
      startTimeProvenance: "explicit",
      travelDate: "2026-09-15",
      scheduledOriginProductId: "toei-oedo-shinjuku-nishiguchi",
      availableMinutes: 600,
    });

    expect(plan.scheduledTransit).toMatchObject({
      kind: "scheduled_journey",
      totalDurationSeconds: 38 * 60,
      schedule: {
        serviceDate: "2026-09-15",
        departureServiceSeconds: 5 * 3600 + 9 * 60,
        arrivalServiceSeconds: 5 * 3600 + 47 * 60,
      },
    });
    expect(plan.generatedWith?.scheduledTransit).toBe(true);
    expect(plan.routeLegs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toDestinationId: "hamarikyu-gardens",
          durationMinutes: 38,
          scheduledTransit: true,
          confidence: "verified",
        }),
      ]),
    );
  });

  it("does not promote an implicit default 09:00 into scheduled evidence", async () => {
    const plan = await generateDayPlanWithScheduledTransit(hamarikyu, {
      catalogue,
      planType: "half_day",
      startTime: "09:00",
      startTimeProvenance: "default",
      travelDate: "2026-09-15",
      scheduledOriginProductId: "toei-oedo-shinjuku-nishiguchi",
    });

    expect(plan.scheduledTransit).toBeUndefined();
    expect(plan.generatedWith?.scheduledTransit).toBe(false);
  });

  it("falls back when the planner lacks an explicit time or has an invalid date", async () => {
    const missingTime = await generateDayPlanWithScheduledTransit(hamarikyu, {
      catalogue,
      scheduledOriginProductId: "toei-oedo-shinjuku-nishiguchi",
      travelDate: "2026-09-15",
      startTime: "09:00",
    });
    const invalidDate = await generateDayPlanWithScheduledTransit(hamarikyu, {
      catalogue,
      startTime: "05:00",
      startTimeProvenance: "explicit",
      travelDate: "2026-02-30",
      scheduledOriginProductId: "toei-oedo-shinjuku-nishiguchi",
    });

    expect(missingTime.scheduledTransit).toBeUndefined();
    expect(invalidDate.scheduledTransit).toBeUndefined();
  });

  it("preserves outbound scheduled provenance during planner recalculation", async () => {
    const plan = await generateDayPlanWithScheduledTransit(hamarikyu, {
      catalogue,
      planType: "half_day",
      startTime: "05:00",
      startTimeProvenance: "explicit",
      travelDate: "2026-09-15",
      scheduledOriginProductId: "toei-oedo-shinjuku-nishiguchi",
      availableMinutes: 600,
    });
    const removable = plan.steps.find(isRealDestinationStop);
    expect(removable).toBeDefined();

    const recalculated = removeStepFromPlan(plan, removable!.id);

    expect(recalculated.scheduledTransit).toEqual(plan.scheduledTransit);
    expect(recalculated.generatedWith?.scheduledTransit).toBe(true);
    expect(recalculated.routeLegs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scheduledTransit: true }),
      ]),
    );
  });
});
