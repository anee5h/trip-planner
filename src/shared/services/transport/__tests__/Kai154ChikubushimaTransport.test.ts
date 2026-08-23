import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  resolveDestinationTransportZone,
  hasFerryRoute,
} from "../TransportTopologyService";
import {
  findArrivalFerryPort,
  getFerryServices,
  serviceMatchesDirection,
} from "../FerryTransportEstimator";
import { getOriginAwareTransportEstimate } from "../OriginAwareTransportService";

// KAI-154 regression: Chikubushima is a ferry-only island in northern Lake
// Biwa. It must resolve to its own `chikubushima` transport zone — never
// `mainland-honshu` — and ground corridors (train/bus) must not reach it
// without the Biwako Kisen ferry.

const CHIKUBUSHIMA_ISLAND = {
  id: "chikubushima-island",
  name: "Chikubu Island (Chikubushima)",
  prefecture: "Shiga",
  municipalityId: "Shiga:nagahama",
  coordinates: { lat: 35.4228, lng: 136.1378 },
  kind: "island",
  tags: ["Island", "Temple", "Shrine", "Ferry", "Shiga"],
  localAccessModes: [],
  localAccessUnestimated: true,
  transportOptions: {},
} as unknown as Destination;

const KYOTO_ORIGIN = { lat: 35.0116, lng: 135.7681 }; // Kyoto Station area

describe("KAI-154 Chikubushima transport topology", () => {
  it("resolves Chikubushima to its own zone, not mainland-honshu", () => {
    expect(resolveDestinationTransportZone(CHIKUBUSHIMA_ISLAND)).toBe(
      "chikubushima",
    );
  });

  it("mainland train/bus cannot reach the island without a ferry", () => {
    const origin = {
      homeStationCoords: KYOTO_ORIGIN,
      originMunicipalityId: "Kyoto:kyoto",
    };
    const train = getOriginAwareTransportEstimate(CHIKUBUSHIMA_ISLAND, origin, [
      "train",
    ]);
    const bus = getOriginAwareTransportEstimate(CHIKUBUSHIMA_ISLAND, origin, [
      "bus",
    ]);
    expect(train).toBeNull();
    expect(bus).toBeNull();
  });

  it("the record carries no static train/car fallback minutes", () => {
    expect(CHIKUBUSHIMA_ISLAND.localAccessModes).toEqual([]);
    expect(CHIKUBUSHIMA_ISLAND.transportOptions?.train).toBeUndefined();
    expect(CHIKUBUSHIMA_ISLAND.transportOptions?.car).toBeUndefined();
  });

  it("Biwako Kisen services exist from both Nagahama and Imazu", () => {
    const nagahamaServices = getFerryServices(
      "NAGAHAMA-PORT",
      "CHIKUBUSHIMA",
      {},
    );
    expect(nagahamaServices.length).toBeGreaterThan(0);
    expect(nagahamaServices[0].durationMinutes).toEqual([35, 35]);
    expect(nagahamaServices[0].fare).toEqual([3800, 3800]);
    expect(nagahamaServices[0].passengerService).toBe(true);

    const imazuServices = getFerryServices("IMAZU-PORT", "CHIKUBUSHIMA", {});
    expect(imazuServices.length).toBeGreaterThan(0);
    expect(imazuServices[0].durationMinutes).toEqual([25, 30]);
    // Bidirectional: the return direction is served too.
    expect(
      serviceMatchesDirection(
        nagahamaServices[0],
        "CHIKUBUSHIMA",
        "NAGAHAMA-PORT",
      ),
    ).toBe(true);
  });

  it("arrival ferry port for Chikubushima is the island terminal", () => {
    const port = findArrivalFerryPort(CHIKUBUSHIMA_ISLAND);
    expect(port).not.toBeNull();
    expect(port!.id).toBe("CHIKUBUSHIMA");
    expect(port!.zoneId).toBe("chikubushima");
  });

  it("hasFerryRoute between mainland-honshu and chikubushima is true", () => {
    expect(hasFerryRoute("mainland-honshu", "chikubushima")).toBe(true);
  });
});
