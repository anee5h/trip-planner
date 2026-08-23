import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import {
  getEligibleOriginModes,
  hasFerryRoute,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../TransportTopologyService";

const AWAJI_RECORDS = [
  { id: "izanagi-jingu-awaji", lat: 34.4657, lng: 134.8537 },
  { id: "awaji-farm-park-england-hill", lat: 34.2629, lng: 134.7562 },
  { id: "sumoto-castle-awaji", lat: 34.3398, lng: 134.9022 },
].map(({ id, lat, lng }) => ({
  id,
  name: id,
  prefecture: "Hyogo",
  transportZoneId: "awaji-island",
  coordinates: { lat, lng },
  localAccessModes: ["car", "bus"],
  tags: ["Awaji", "Island"],
})) as unknown as Destination[];

describe("KAI-149 Awaji Island transport topology", () => {
  it("keeps all new Awaji records in the explicit awaji-island zone", () => {
    for (const destination of AWAJI_RECORDS) {
      expect(resolveDestinationTransportZone(destination)).toBe("awaji-island");
    }
  });

  it("does not resolve Awaji coordinates to Tomogashima", () => {
    const resolved = resolveOriginTransportZone({ coordinates: AWAJI_RECORDS[2].coordinates! });
    expect(resolved).toBe("awaji-island");
    expect(resolved).not.toBe("tomogashima");
  });

  it("authorizes only the explicit bridge/highway road edge from Honshu", () => {
    const result = getEligibleOriginModes({
      originZoneId: "mainland-honshu",
      destinationZoneId: "awaji-island",
      destination: AWAJI_RECORDS[0],
    });
    expect(result.crossZoneModes).toEqual(["car", "bus"]);
    expect(result.localModes).toEqual(["car", "my_car", "bus"]);
    expect(hasFerryRoute("mainland-honshu", "awaji-island")).toBe(false);
  });

  it("keeps ferry out of the destination’s local modes", () => {
    expect(AWAJI_RECORDS.every((record) => !record.localAccessModes?.includes("ferry"))).toBe(true);
  });
});
