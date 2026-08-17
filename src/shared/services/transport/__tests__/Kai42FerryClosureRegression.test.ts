import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  getFerryTransportEstimate,
  isFerryTripAvailable,
} from "../FerryTransportEstimator";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

/**
 * KAI-42: the CLOSED-ferry path pinned with a restricted fixture.
 *
 * The REAL Tomogashima record is now year-round (normal Mar–Dec, winter
 * operation Jan–Feb) — the stale 03-01..11-30 suspension lives ONLY here
 * as explicit fixture data, so the trip-level outbound/return logic
 * (isFerryTripAvailable) and the estimate-level closure behavior stay
 * regression-tested without freezing wrong data into the dataset.
 */

vi.mock("../../../data/ferry-estimates.json", () => {
  const raw = JSON.parse(
    fs.readFileSync(
      `${process.cwd()}/src/shared/data/ferry-estimates.json`,
      "utf8",
    ),
  ) as { services: Array<Record<string, unknown>>; ports: unknown[] };
  return {
    default: {
      ...raw,
      services: raw.services.map((s) =>
        s.id === "tomogashima-kisen"
          ? { ...s, operatingPeriods: [{ from: "03-01", to: "11-30" }] }
          : s,
      ),
    },
  };
});

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

const WAKAYAMA = { lat: 34.2261, lng: 135.1675 };

describe("KAI-42 closed-ferry trip availability (restricted fixture)", () => {
  const dest = byId.get("tomogashima-islands")!;

  it("both outbound and return inside the window: trip available", () => {
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2026-08-15T12:00:00+09:00"),
        new Date("2026-08-16T12:00:00+09:00"),
      ]),
    ).toBe(true);
  });

  it("a RETURN date outside the window kills the trip (outbound was fine)", () => {
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2026-08-15T12:00:00+09:00"),
        new Date("2026-12-20T12:00:00+09:00"),
      ]),
    ).toBe(false);
  });

  it("an OUTBOUND date outside the window kills the trip", () => {
    expect(
      isFerryTripAvailable(dest, WAKAYAMA, [
        new Date("2026-12-20T12:00:00+09:00"),
        new Date("2026-12-25T12:00:00+09:00"),
      ]),
    ).toBe(false);
  });

  it("the estimate-level closure returns null outside the window", () => {
    expect(
      getFerryTransportEstimate(dest, WAKAYAMA, {
        travelDate: new Date("2026-12-20T12:00:00+09:00"),
      }),
    ).toBeNull();
    expect(
      getFerryTransportEstimate(dest, WAKAYAMA, {
        travelDate: new Date("2026-08-15T12:00:00+09:00"),
      }),
    ).not.toBeNull();
  });
});
