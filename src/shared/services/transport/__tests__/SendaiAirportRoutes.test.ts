import { describe, expect, it } from "vitest";
import destinationsData from "@/shared/data/destinations-index.json";
import flightRoutesData from "@/shared/data/flight-estimates.json";
import type { Destination } from "@/shared/types/destination";
import { getFlightRoute } from "../FlightTransportEstimator";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

const all = destinationsData as unknown as Destination[];
const sendai = all.find((d) => d.id === "sendai-city")!;
const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SAPPORO = { lat: 43.068, lng: 141.351 };

const routes = (
  flightRoutesData as unknown as {
    routes: Array<{ from: string; to: string; flightTime: [number, number] }>;
  }
).routes;

describe("KAI-66 Sendai Airport (SDJ) routes", () => {
  it("registered direct routes resolve (CTS, NGO, ITM, KIX, UKB, HIJ, FUK, OKA)", () => {
    // Miyagi Prefecture official Summer-2026 schedule (checked 2026-08-11).
    for (const code of [
      "CTS",
      "NGO",
      "ITM",
      "KIX",
      "UKB",
      "HIJ",
      "FUK",
      "OKA",
    ]) {
      expect(getFlightRoute("SDJ", code), `SDJ→${code}`).not.toBeNull();
      expect(getFlightRoute(code, "SDJ"), `${code}→SDJ`).not.toBeNull();
    }
  });

  it("no HND–SDJ route exists (negative regression)", () => {
    // The KAI-12 ledger's fl-err-006 claim of a Haneda–Sendai link was
    // incorrect: the Miyagi Prefecture schedule lists no HND service and
    // aviationwire confirms no scheduled link.
    expect(getFlightRoute("SDJ", "HND")).toBeNull();
    expect(getFlightRoute("HND", "SDJ")).toBeNull();
  });

  it("Sendai origin is flight-reachable; Tokyo→Sendai is not (no HND route)", () => {
    const fromSapporo = getOriginAwareTransportEstimate(
      sendai,
      { homeStationCoords: SAPPORO },
      ["flight"],
    );
    expect(fromSapporo).not.toBeNull();
    const fromTokyo = getOriginAwareTransportEstimate(
      sendai,
      { homeStationCoords: TOKYO },
      ["flight"],
    );
    expect(fromTokyo).toBeNull();
  });

  it("durations are verified bidirectional ranges from the official monthly schedule", () => {
    // Derived mechanically from the Sendai Airport official monthly schedule
    // (api/public/flight/monthly/domestic/{departure,arrival}, August 2026):
    // min/max block time across BOTH directions — e.g. SDJ→CTS 70–80 min but
    // CTS→SDJ 65–80, so the bidirectional row is [65,80]. Neither a
    // shortest-only [min,min] (which claims an exact duration) nor invented
    // padding.
    const expected: Record<string, [number, number]> = {
      CTS: [65, 80],
      NGO: [65, 80],
      ITM: [70, 95],
      KIX: [80, 95],
      UKB: [80, 85],
      HIJ: [80, 95],
      FUK: [105, 130],
      OKA: [155, 185],
    };
    const sdjRoutes = routes.filter((r) => r.from === "SDJ");
    expect(sdjRoutes).toHaveLength(Object.keys(expected).length);
    for (const route of sdjRoutes) {
      expect(route.flightTime).toEqual(expected[route.to]);
    }
  });
});
