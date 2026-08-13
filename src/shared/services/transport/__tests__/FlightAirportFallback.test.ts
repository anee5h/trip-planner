import { describe, expect, it } from "vitest";
import destinationsData from "@/shared/data/destinations-index.json";
import { TRANSPORT_CONFIG } from "@/shared/config/transportConfig";
import type { Destination } from "@/shared/types/destination";
import {
  findArrivalAirport,
  findNearestAirports,
  getFlightTransportEstimate,
} from "../FlightTransportEstimator";

const all = destinationsData as unknown as Destination[];

const YOKOHAMA = { lat: 35.4657, lng: 139.6222 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

const akiyoshido = all.find((d) => d.id === "akiyoshido-cave-yamaguchi")!;
const amamiGunto = all.find((d) => d.id === "amami-gunto")!;
const shoryuCave = all.find((d) => d.id === "shoryu-cave")!;
const yakushimaTown = all.find((d) => d.id === "yakushima-town")!;
const jomonSugi = all.find((d) => d.id === "jomon-sugi-yakushima")!;

const mockSapporoDestination = {
  id: "sapporo-tv-tower",
  name: "Sapporo TV Tower",
  prefecture: "Hokkaido",
  region: "Hokkaido",
  categories: ["Sightseeing"],
  tags: ["iconic", "view"],
  coordinates: { lat: 43.0611, lng: 141.3564 },
} as unknown as Destination;

const mockHakoneDestination = {
  id: "hakone-shrine-kanagawa",
  name: "Hakone Shrine",
  prefecture: "Kanagawa",
  region: "Kanto",
  categories: ["Shrine"],
  tags: ["nature", "shrine"],
  coordinates: { lat: 35.2045, lng: 139.0256 },
} as unknown as Destination;

describe("KAI-63 D7a: in-zone arrival airport fallback", () => {
  it("prefers the nearest in-zone airport over a nearer out-of-zone airport", () => {
    // Akiyoshido Cave (Yamaguchi): Fukuoka (zone mainland-kyushu) is the
    // globally nearest airport at ~106 km, but Hiroshima (zone
    // mainland-honshu, ~151 km) is the nearest airport in the destination's
    // own zone. Arrival must use HIJ; FUK would need an unmodelled
    // cross-zone access leg.
    expect(findArrivalAirport(akiyoshido)?.code).toBe("HIJ");
  });

  it("makes akiyoshido-cave-yamaguchi flight-eligible from Yokohama via in-zone HIJ", () => {
    // Previously the single-nearest rule picked FUK, the zone guard then
    // rejected the mismatch, and the destination had no flight option.
    const flightEst = getFlightTransportEstimate(akiyoshido, YOKOHAMA);
    expect(flightEst).not.toBeNull();
    expect(flightEst?.mode).toBe("flight");
    expect(flightEst?.details?.departureAirportCode).toBe("HND");
    expect(flightEst?.details?.arrivalAirportCode).toBe("HIJ");
  });

  it("prefers in-zone Amami Airport over nearer out-of-zone Naha for Shoryu Cave", () => {
    // Shoryu Cave (Amami zone): Naha (okinawa-main) is ~154 km away, Amami
    // Airport (amami) ~160 km. The in-zone airport must win.
    expect(findArrivalAirport(shoryuCave)?.code).toBe("ASJ");
  });
});

describe("KAI-63 D7b: origin-zone filter before the candidate limit", () => {
  it("keeps KOJ among the departure candidates for a Fukuoka origin", () => {
    // Unfiltered, Tsushima (out-of-zone, slot 3) crowds out Kagoshima
    // (in-zone, slot 4) within the 3-airport limit.
    const unfiltered = findNearestAirports(
      FUKUOKA,
      TRANSPORT_CONFIG.candidateAirportLimit,
    ).map((a) => a.code);
    expect(unfiltered).toEqual(["FUK", "KMJ", "TSJ"]);
    expect(unfiltered).not.toContain("KOJ");

    // Zone-filtered: only Kyushu-zone airports compete for the slots.
    const filtered = findNearestAirports(
      FUKUOKA,
      TRANSPORT_CONFIG.candidateAirportLimit,
      "mainland-kyushu",
    ).map((a) => a.code);
    expect(filtered).toEqual(["FUK", "KMJ", "KOJ"]);
    expect(filtered).toContain("KOJ");
  });

  it("makes Amami destinations flight-eligible from Fukuoka via KOJ→ASJ", () => {
    // KOJ→ASJ is the only registered route into the Amami zone; before the
    // fix KOJ never survived the candidate truncation from Fukuoka.
    for (const dest of [amamiGunto, shoryuCave]) {
      const flightEst = getFlightTransportEstimate(dest, FUKUOKA);
      expect(flightEst, dest.id).not.toBeNull();
      expect(flightEst?.details?.departureAirportCode).toBe("KOJ");
      expect(flightEst?.details?.arrivalAirportCode).toBe("ASJ");
    }
  });

  it("makes Yakushima destinations flight-eligible from Fukuoka via KOJ→KUM", () => {
    // KOJ→KUM is year-round; FUK→KUM is seasonal and unavailable without a
    // travel date, so only the KOJ candidate can serve Yakushima from
    // Fukuoka.
    for (const dest of [yakushimaTown, jomonSugi]) {
      const flightEst = getFlightTransportEstimate(dest, FUKUOKA);
      expect(flightEst, dest.id).not.toBeNull();
      expect(flightEst?.details?.departureAirportCode).toBe("KOJ");
      expect(flightEst?.details?.arrivalAirportCode).toBe("KUM");
    }
  });
});

describe("KAI-63 regression: Tokyo origin unchanged", () => {
  it("still yields HND and NRT as departure candidates, filtered or not", () => {
    expect(
      findNearestAirports(TOKYO, TRANSPORT_CONFIG.candidateAirportLimit).map(
        (a) => a.code,
      ),
    ).toEqual(["HND", "NRT"]);
    expect(
      findNearestAirports(
        TOKYO,
        TRANSPORT_CONFIG.candidateAirportLimit,
        "mainland-honshu",
      ).map((a) => a.code),
    ).toEqual(["HND", "NRT"]);
  });

  it("keeps the Sapporo flight and the Hakone non-flight unchanged", () => {
    const sapporoEst = getFlightTransportEstimate(
      mockSapporoDestination,
      TOKYO,
    );
    expect(sapporoEst).not.toBeNull();
    expect(sapporoEst?.details?.departureAirportCode).toBe("HND");
    expect(sapporoEst?.details?.arrivalAirportCode).toBe("CTS");

    expect(getFlightTransportEstimate(mockHakoneDestination, TOKYO)).toBeNull();
  });
});
