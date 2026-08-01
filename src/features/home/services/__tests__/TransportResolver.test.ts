import { describe, it, expect } from "vitest";
import {
  resolveTransportSelection,
  ALL_PUBLIC_MODES,
} from "../TransportResolver";

describe("TransportResolver", () => {
  it("resolves public preference correctly", () => {
    const result = resolveTransportSelection("public", "my_car");
    expect(result.carMode).toBe("none");
    expect(result.publicModes).toEqual(ALL_PUBLIC_MODES);
  });

  it("resolves myCar preference correctly", () => {
    const result = resolveTransportSelection("myCar", "none");
    expect(result.carMode).toBe("my_car");
    expect(result.publicModes).toEqual([]);
  });

  it("resolves rentalCar preference correctly", () => {
    const result = resolveTransportSelection("rentalCar", "none");
    expect(result.carMode).toBe("rental");
    expect(result.publicModes).toEqual([]);
  });

  it("resolves either with configured my_car correctly", () => {
    const result = resolveTransportSelection("either", "my_car");
    expect(result.carMode).toBe("my_car");
    expect(result.publicModes).toEqual(ALL_PUBLIC_MODES);
  });

  it("resolves either with configured rental correctly", () => {
    const result = resolveTransportSelection("either", "rental");
    expect(result.carMode).toBe("rental");
    expect(result.publicModes).toEqual(ALL_PUBLIC_MODES);
  });

  it("resolves either with no configured car to public modes only", () => {
    const result = resolveTransportSelection("either", "none");
    expect(result.carMode).toBe("none");
    expect(result.publicModes).toEqual(ALL_PUBLIC_MODES);
  });
});
