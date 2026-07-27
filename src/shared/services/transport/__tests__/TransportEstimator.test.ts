import { describe, expect, it } from "vitest";
import type { Destination } from "../../../types/destination";
import {
  findNearestAirports,
  findArrivalAirport,
  getFlightRoute,
  getFlightTransportEstimate,
} from "../FlightTransportEstimator";
import { formatTransportCost, formatTransportTime } from "../formatters";
import {
  getBestEstimateBetween,
  getTransportEstimates,
} from "../TransportEstimator";

const TOKYO_STATION_COORDS = { lat: 35.6812, lng: 139.7671 };

const mockSapporoDestination = {
  id: "sapporo-tv-tower",
  name: "Sapporo TV Tower",
  prefecture: "Hokkaido",
  region: "Hokkaido",
  categories: ["Sightseeing"],
  tags: ["iconic", "view"],
  coordinates: { lat: 43.0611, lng: 141.3564 },
  ratings: {
    overall: 4.6,
  },
  description: "Famous landmark in Sapporo",
} as unknown as Destination;

const mockHakoneDestination = {
  id: "hakone-shrine-kanagawa",
  name: "Hakone Shrine",
  prefecture: "Kanagawa",
  region: "Kanto",
  categories: ["Shrine"],
  tags: ["nature", "shrine"],
  coordinates: { lat: 35.2045, lng: 139.0256 },
  ratings: {
    overall: 4.7,
  },
  description: "Famous shrine in Hakone",
} as unknown as Destination;

describe("TransportEstimator", () => {
  it("formats transport time ranges cleanly", () => {
    expect(formatTransportTime([30, 45])).toBe("30–45 min");
    expect(formatTransportTime([290, 340])).toBe("4h 50m – 5h 40m");
    expect(formatTransportTime([60, 60])).toBe("1h");
  });

  it("formats transport cost ranges cleanly", () => {
    expect(formatTransportCost([9000, 18000])).toBe("¥9,000 – ¥18,000");
    expect(formatTransportCost([1500, 1500])).toBe("¥1,500");
  });

  it("finds nearest candidate departure airports for Tokyo Station", () => {
    const candidateAirports = findNearestAirports(TOKYO_STATION_COORDS, 3);
    expect(candidateAirports.length).toBe(3);
    expect(candidateAirports[0].code).toBe("HND");
    expect(candidateAirports[1].code).toBe("NRT");
  });

  it("finds destination arrival airport for Sapporo", () => {
    const arrivalAirport = findArrivalAirport(mockSapporoDestination);
    expect(arrivalAirport).not.toBeNull();
    expect(arrivalAirport?.code).toBe("CTS");
  });

  it("performs bidirectional flight route lookup", () => {
    const hndToCts = getFlightRoute("HND", "CTS");
    const ctsToHnd = getFlightRoute("CTS", "HND");
    expect(hndToCts).not.toBeNull();
    expect(ctsToHnd).not.toBeNull();
    expect(hndToCts?.flightTime).toEqual(ctsToHnd?.flightTime);
  });

  it("calculates door-to-door flight estimate for Sapporo from Tokyo", () => {
    const flightEst = getFlightTransportEstimate(
      mockSapporoDestination,
      TOKYO_STATION_COORDS,
    );
    expect(flightEst).not.toBeNull();
    expect(flightEst?.mode).toBe("flight");
    expect(flightEst?.available).toBe(true);
    expect(flightEst?.details?.departureAirportCode).toBe("HND");
    expect(flightEst?.details?.arrivalAirportCode).toBe("CTS");
  });

  it("omits flight option for close destinations like Hakone", () => {
    const flightEst = getFlightTransportEstimate(
      mockHakoneDestination,
      TOKYO_STATION_COORDS,
    );
    expect(flightEst).toBeNull();
  });

  it("provides getBestEstimateBetween between any two Locations", () => {
    const home = { coordinates: TOKYO_STATION_COORDS };
    const airport = { coordinates: { lat: 35.5494, lng: 139.7798 } }; // Haneda
    const best = getBestEstimateBetween(home, airport);
    expect(best).toBeDefined();
    expect(best.timeRange[0]).toBeGreaterThan(0);
    expect(best.costRange[0]).toBeGreaterThan(0);
  });

  it("returns sorted transport estimates for Sapporo", () => {
    const estimates = getTransportEstimates(
      mockSapporoDestination,
      TOKYO_STATION_COORDS,
    );
    expect(estimates.length).toBeGreaterThanOrEqual(2);
    expect(estimates.some((e) => e.mode === "flight")).toBe(true);
  });
});
