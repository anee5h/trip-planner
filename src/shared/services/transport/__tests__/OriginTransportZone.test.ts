import { describe, expect, it } from "vitest";
import {
  resolveOriginTransportZone as resolveLegacyOriginTransportZone,
  topology,
} from "../TransportTopologyService";
import { resolveOriginTransportZone } from "../OriginTransportZone";

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const YOKOHAMA = { lat: 35.4658, lng: 139.6222 };

const ORIGIN_PARITY_CASES = [
  ["Tokyo", TOKYO],
  ["Yokohama", YOKOHAMA],
  ["Hokkaido", { lat: 43.0618, lng: 141.3545 }],
  ["Kyushu", { lat: 33.5902, lng: 130.4017 }],
  ["Shikoku", { lat: 34.3428, lng: 134.0466 }],
  ["Okinawa", { lat: 26.2124, lng: 127.6809 }],
  ["Sado", { lat: 38.0, lng: 138.3 }],
  ["Miyajima", { lat: 34.295, lng: 132.319 }],
  ["Miyajimaguchi", { lat: 34.31, lng: 132.308 }],
  ["Iwakuni coordinate", { lat: 34.1758, lng: 132.2251 }],
  ["Kanmon Honshu side", { lat: 33.9505, lng: 130.935 }],
  ["Kanmon Kyushu side", { lat: 33.945, lng: 130.99 }],
  ["Tsugaru Honshu side", { lat: 41.29, lng: 140.9 }],
  ["Tsugaru Hokkaido side", { lat: 41.43, lng: 140.11 }],
  ["outside Japan", { lat: 40.7128, lng: -74.006 }],
] as const;

describe("OriginTransportZone parity", () => {
  it('does not treat explicit "unknown" as a persisted topology zone', () => {
    const params = {
      coordinates: YOKOHAMA,
      transportZoneId: "unknown" as const,
    };

    expect(resolveLegacyOriginTransportZone(params)).toBe("mainland-honshu");
    expect(resolveOriginTransportZone(params)).toBe("mainland-honshu");
  });

  it("accepts every real topology zone ID exactly as the topology resolver does", () => {
    const realZoneIds = topology.zones.map((zone) => zone.id);

    expect(realZoneIds).not.toContain("unknown");
    for (const zoneId of realZoneIds) {
      const params = {
        coordinates: TOKYO,
        transportZoneId: zoneId,
      };
      expect(resolveOriginTransportZone(params)).toBe(
        resolveLegacyOriginTransportZone(params),
      );
    }
  });

  it.each(ORIGIN_PARITY_CASES)(
    "%s matches the pre-Home resolver for coordinate fallback",
    (_name, coordinates) => {
      const params = { coordinates };

      expect(resolveOriginTransportZone(params)).toBe(
        resolveLegacyOriginTransportZone(params),
      );
    },
  );

  it("matches label-prefecture fallback for Iwakuni/Yamaguchi", () => {
    const params = {
      coordinates: { lat: 34.1758, lng: 132.2251 },
      label: "Iwakuni Station, Yamaguchi",
    };

    expect(resolveOriginTransportZone(params)).toBe(
      resolveLegacyOriginTransportZone(params),
    );
  });
});
