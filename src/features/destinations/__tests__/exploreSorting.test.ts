/**
 * Explore sorting is deliberately tested at the shared sort boundary so the
 * assertions cover numeric semantics without depending on UI pagination or
 * network-loaded transport data.
 */
import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  compareExploreNumericValues,
  computeExploreSortMetrics,
  getExploreWalkingMinutes,
  normalizeExploreNumericValue,
  sortExploreDestinations,
  type ExploreSortMetrics,
} from "../exploreSorting";

function destination(
  id: string,
  coordinates: { lat: number; lng: number },
): Destination {
  return {
    id,
    name: id,
    coordinates,
    walkingMin: 30,
  } as Destination;
}

function metrics(
  entries: Array<[string, Partial<ExploreSortMetrics>]>,
): Map<string, ExploreSortMetrics> {
  return new Map(
    entries.map(([id, values]) => [
      id,
      {
        nearestKm: null,
        walkingMinutes: null,
        ...values,
      },
    ]),
  );
}

const NAKAYAMA = { lat: 35.5147, lng: 139.5393 };
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };

describe("Explore numeric sort boundary", () => {
  it("normalizes nullish, NaN, infinity, zero, and finite values explicitly", () => {
    expect(normalizeExploreNumericValue(null)).toBeNull();
    expect(normalizeExploreNumericValue(undefined)).toBeNull();
    expect(normalizeExploreNumericValue(Number.NaN)).toBeNull();
    expect(normalizeExploreNumericValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeExploreNumericValue(0)).toBe(0);
    expect(normalizeExploreNumericValue(12.5)).toBe(12.5);
  });

  it("keeps valid zero walking minutes but rejects explicit unknown provenance", () => {
    const zero = {
      ...destination("zero", NAKAYAMA),
      walkingMin: 0,
    } as Destination;
    const unknown = {
      ...destination("unknown", NAKAYAMA),
      walkingMin: 0,
      walkingMetadata: {
        method: "unknown",
        confidence: "unknown",
      },
    } as Destination;

    expect(getExploreWalkingMinutes(zero)).toBe(0);
    expect(getExploreWalkingMinutes(unknown)).toBeNull();
  });

  it("sorts known finite values before unknown values and keeps a stable id tie-break", () => {
    expect(compareExploreNumericValues(null, 10)).toBeGreaterThan(0);
    expect(compareExploreNumericValues(undefined, 10)).toBeGreaterThan(0);
    expect(compareExploreNumericValues(Number.NaN, 10)).toBeGreaterThan(0);
    expect(compareExploreNumericValues(0, 10)).toBeLessThan(0);
    expect(compareExploreNumericValues(10, 10)).toBe(0);

    const items = [
      destination("unknown", NAKAYAMA),
      destination("cheap-b", NAKAYAMA),
      destination("cheap-a", NAKAYAMA),
    ];
    const sorted = sortExploreDestinations(
      items,
      "nearest",
      metrics([
        ["unknown", { nearestKm: null }],
        ["cheap-b", { nearestKm: 12 }],
        ["cheap-a", { nearestKm: 12 }],
      ]),
    );

    expect(sorted.map((item) => item.id)).toEqual([
      "cheap-a",
      "cheap-b",
      "unknown",
    ]);
  });
});

describe("Nakayama Explore regressions", () => {
  const nearby = destination("yokohama-area", { lat: 35.45, lng: 139.63 });
  const hokkaido = destination("abashiri-city", {
    lat: 44.0206,
    lng: 144.2734,
  });
  const okinawa = destination("junglia-okinawa", {
    lat: 26.6417419,
    lng: 127.9739612,
  });

  it("Nearest keeps clearly nearby destinations ahead of Okinawa and Hokkaido", () => {
    const sorted = sortExploreDestinations(
      [okinawa, hokkaido, nearby],
      "nearest",
      metrics([
        ["okinawa", { nearestKm: 1476.6 }],
        ["abashiri-city", { nearestKm: 1028.3 }],
        ["yokohama-area", { nearestKm: 11.2 }],
      ]),
    );

    expect(sorted.map((item) => item.id)).toEqual([
      "yokohama-area",
      "abashiri-city",
      "junglia-okinawa",
    ]);
  });

  it("Least Walk uses valid walking minutes and does not turn unknown into zero", () => {
    const sorted = sortExploreDestinations(
      [okinawa, hokkaido, nearby],
      "walking",
      metrics([
        ["okinawa", { walkingMinutes: null }],
        ["abashiri-city", { walkingMinutes: 360 }],
        ["yokohama-area", { walkingMinutes: 30 }],
      ]),
    );

    expect(sorted.map((item) => item.id)).toEqual([
      "yokohama-area",
      "abashiri-city",
      "junglia-okinawa",
    ]);
  });

  it("recomputes origin-aware metrics when switching from Nakayama to Tokyo Station", () => {
    const nakayamaNear = destination("nakayama-near", {
      lat: 35.52,
      lng: 139.54,
    });
    const tokyoNear = destination("tokyo-near", {
      lat: 35.68,
      lng: 139.76,
    });
    const all = [nakayamaNear, tokyoNear];

    const nakayamaMetrics = computeExploreSortMetrics(all, {
      originCoords: NAKAYAMA,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
    });
    const tokyoMetrics = computeExploreSortMetrics(all, {
      originCoords: TOKYO_STATION,
      carMode: "none",
      publicModes: ["train"],
      partySize: 2,
    });

    expect(
      sortExploreDestinations(all, "nearest", nakayamaMetrics).map(
        (item) => item.id,
      ),
    ).toEqual(["nakayama-near", "tokyo-near"]);
    expect(
      sortExploreDestinations(all, "nearest", tokyoMetrics).map(
        (item) => item.id,
      ),
    ).toEqual(["tokyo-near", "nakayama-near"]);
    expect(nakayamaMetrics.get("nakayama-near")?.nearestKm).not.toBe(
      tokyoMetrics.get("nakayama-near")?.nearestKm,
    );
  });

  it("applies Nearest and Least Walk for a second-origin fixture", () => {
    const yokohama = destination("yokohama", NAKAYAMA);
    const tokyo = destination("tokyo", TOKYO_STATION);
    const unknown = destination("unknown", NAKAYAMA);
    const all = [yokohama, tokyo, unknown];
    const secondOriginMetrics = metrics([
      ["yokohama", { nearestKm: 21, walkingMinutes: 90 }],
      ["tokyo", { nearestKm: 2, walkingMinutes: 20 }],
      ["unknown", { nearestKm: null, walkingMinutes: null }],
    ]);

    expect(
      sortExploreDestinations(all, "nearest", secondOriginMetrics).map(
        (item) => item.id,
      ),
    ).toEqual(["tokyo", "yokohama", "unknown"]);
    expect(
      sortExploreDestinations(all, "walking", secondOriginMetrics).map(
        (item) => item.id,
      ),
    ).toEqual(["tokyo", "yokohama", "unknown"]);
  });

  it("sorts the complete eligible set before a page-sized slice", () => {
    const destinations = Array.from({ length: 25 }, (_, index) =>
      destination(`destination-${String(index).padStart(2, "0")}`, NAKAYAMA),
    );
    const completeMetrics = metrics(
      destinations.map((item, index) => [
        item.id,
        { nearestKm: index === 24 ? 0.1 : index + 1 },
      ]),
    );

    const sorted = sortExploreDestinations(
      destinations,
      "nearest",
      completeMetrics,
    );
    const firstPage = sorted.slice(0, 20);

    expect(sorted).toHaveLength(25);
    expect(firstPage[0]?.id).toBe("destination-24");
    expect(firstPage).toContain(destinations[24]);
  });
});

describe("Explore sort option removal", () => {
  it("does not retain the removed travelTime sort key", async () => {
    const { parseDestinationSearchParams, serializeDestinationSearchParams } =
      await import("../destinationSearchParams");
    const parsed = parseDestinationSearchParams(
      new URLSearchParams("sort=travelTime"),
    );

    expect(parsed.sortBy).toBe("recommended");
    expect(
      serializeDestinationSearchParams({
        ...parsed,
        sortBy: "travelTime" as never,
      }).get("sort"),
    ).toBe("recommended");
  });
});
