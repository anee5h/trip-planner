import { describe, expect, it } from "vitest";
import { getDistance } from "../distance";

describe("getDistance (haversine, km)", () => {
  it("matches reference great-circle distances", () => {
    // Values computed with the haversine formula (identical to Leaflet's
    // LatLng.distanceTo, which this module previously depended on).
    expect(getDistance(35.6762, 139.6503, 34.6937, 135.5023)).toBeCloseTo(
      392.4412,
      2,
    ); // Tokyo -> Osaka
    expect(getDistance(35.0116, 135.7681, 34.6851, 135.8048)).toBeCloseTo(
      36.4593,
      2,
    ); // Kyoto -> Nara
    expect(getDistance(43.0618, 141.3545, 41.7687, 140.7288)).toBeCloseTo(
      152.6841,
      2,
    ); // Sapporo -> Hakodate
    expect(getDistance(26.2124, 127.6809, 24.3408, 124.1574)).toBeCloseTo(
      410.855,
      1,
    ); // Naha -> Ishigaki
  });

  it("returns 0 for identical coordinates", () => {
    expect(getDistance(35.0, 135.0, 35.0, 135.0)).toBe(0);
  });

  it("handles long hauls and antipodal-adjacent pairs", () => {
    expect(getDistance(35.0, 135.0, -35.0, -45.0)).toBeCloseTo(20015.0866, 1);
  });

  it("is symmetric", () => {
    const a = getDistance(35.6762, 139.6503, 34.6937, 135.5023);
    const b = getDistance(34.6937, 135.5023, 35.6762, 139.6503);
    expect(a).toBe(b);
  });
});
