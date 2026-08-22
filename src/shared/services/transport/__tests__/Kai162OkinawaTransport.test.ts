import { describe, expect, it } from "vitest";
import destinations from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getValidModes } from "@/shared/services/recommendation/RecommendationScorer";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

const catalog = destinations as unknown as Destination[];
const junglia = catalog.find(
  (destination) => destination.id === "junglia-okinawa",
)!;
const dmm = catalog.find(
  (destination) => destination.id === "dmm-kariyushi-aquarium",
)!;

const NAHA_AIRPORT = { lat: 26.1958, lng: 127.6461 };
const NAHA_BUS_TERMINAL = { lat: 26.2124, lng: 127.6809 };
const NAGO_CITY_HALL = { lat: 26.5926, lng: 127.9774 };

describe("KAI-162 Okinawa origin-aware transport", () => {
  it("routes Naha Airport to Junglia by bus with official provenance", () => {
    const estimate = getOriginAwareTransportEstimate(
      junglia,
      { homeStationCoords: NAHA_AIRPORT },
      ["bus"],
    );

    expect(estimate).not.toBeNull();
    expect(estimate).toMatchObject({
      mode: "bus",
      source: "verified_ground_route",
      evidence: "verified",
      fare: [2500, 2500],
      fareVariability: "fixed",
      reservationRequired: false,
    });
    expect(estimate!.timeRange).toEqual([105, 105]);
    expect(estimate!.serviceName).toContain("TK06");
    expect(estimate!.operator).toContain("Tokyo Bus");
    expect(estimate!.sourceUrl).toBe(
      "https://www.tokyobus.jp/okinawa/one-city-bus05/",
    );
    expect(estimate!.checkedAt).toBe("2026-08-22");
  });

  it("routes Nago City Hall to Junglia on the free direct shuttle", () => {
    const estimate = getOriginAwareTransportEstimate(
      junglia,
      { homeStationCoords: NAGO_CITY_HALL },
      ["bus"],
    );

    expect(estimate).not.toBeNull();
    expect(estimate).toMatchObject({
      mode: "bus",
      timeRange: [30, 30],
      fare: [0, 0],
      reservationRequired: false,
    });
    expect(estimate!.sourceUrl).toBe("https://www.junglia.jp/en/access");
  });

  it("routes Naha Airport and Naha Bus Terminal to DMM without inventing a fare", () => {
    const airportEstimate = getOriginAwareTransportEstimate(
      dmm,
      { homeStationCoords: NAHA_AIRPORT },
      ["bus"],
    );
    const terminalEstimate = getOriginAwareTransportEstimate(
      dmm,
      { homeStationCoords: NAHA_BUS_TERMINAL },
      ["bus"],
    );

    expect(airportEstimate).toMatchObject({
      mode: "bus",
      timeRange: [20, 20],
      fare: null,
      reservationRequired: false,
    });
    expect(terminalEstimate).toMatchObject({
      mode: "bus",
      timeRange: [30, 35],
      fare: null,
      reservationRequired: false,
    });
    expect(airportEstimate!.sourceUrl).toBe(
      "https://kariyushi-aquarium.com/access/",
    );
    expect(terminalEstimate!.sourceUrl).toBe(
      "https://kariyushi-aquarium.com/access/",
    );
  });

  it("does not fabricate rail or an unsupported origin route", () => {
    expect(
      getOriginAwareTransportEstimate(
        junglia,
        { homeStationCoords: NAHA_AIRPORT },
        ["train", "shinkansen"],
      ),
    ).toBeNull();

    const remoteOrigin = { lat: 26.8, lng: 128.2 };
    expect(
      getOriginAwareTransportEstimate(
        dmm,
        { homeStationCoords: remoteOrigin },
        ["bus"],
      ),
    ).toBeNull();

    expect(
      getOriginAwareTransportEstimate(
        junglia,
        { homeStationCoords: NAHA_AIRPORT },
        ["car", "my_car"],
      ),
    ).toBeNull();
  });

  it("does not manufacture Junglia season or walking signals", () => {
    expect(junglia.season).toBeUndefined();
    expect(junglia.bestMonths).toBeUndefined();
    expect(junglia.bestSeason).toBeUndefined();
    expect(junglia.seasonMetadata).toMatchObject({ method: "unknown" });
    expect(junglia.walkingMin).toBeUndefined();
    expect(junglia.walkingMetadata).toMatchObject({ method: "unknown" });
    expect(junglia.comfort?.walkingIntensity).toBeUndefined();
  });

  it("keeps destination-level local access restrictions authoritative", () => {
    const busRestricted = {
      ...junglia,
      localAccessModes: ["car" as const],
    } as Destination;

    expect(
      getValidModes(
        busRestricted,
        "none",
        ["bus"],
        NAHA_AIRPORT,
        undefined,
        "okinawa-main",
      ),
    ).not.toContain("bus");
  });
});
