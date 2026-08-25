import { describe, it, expect } from "vitest";
import {
  resolveTransportSelection,
  ALL_PUBLIC_MODES,
} from "../TransportResolver";

describe("TransportResolver", () => {
  it("resolves public transport only", () => {
    expect(resolveTransportSelection(true, "none")).toEqual({
      carMode: "none",
      publicModes: ALL_PUBLIC_MODES,
    });
  });

  it("resolves rental car only", () => {
    expect(resolveTransportSelection(false, "rental")).toEqual({
      carMode: "rental",
      publicModes: [],
    });
  });

  it("resolves public transport and rental car independently", () => {
    expect(resolveTransportSelection(true, "rental")).toEqual({
      carMode: "rental",
      publicModes: ALL_PUBLIC_MODES,
    });
  });

  it("resolves public transport and personal car independently", () => {
    expect(resolveTransportSelection(true, "my_car")).toEqual({
      carMode: "my_car",
      publicModes: ALL_PUBLIC_MODES,
    });
  });

  it("keeps personal and rental car mutually exclusive at the car layer", () => {
    expect(resolveTransportSelection(false, "my_car")).toEqual({
      carMode: "my_car",
      publicModes: [],
    });
  });

  it("resolves both toggles off to the empty canonical capability set", () => {
    expect(resolveTransportSelection(false, "none")).toEqual({
      carMode: "none",
      publicModes: [],
    });
  });

  it("returns a fresh public mode collection for each resolution", () => {
    const first = resolveTransportSelection(true, "none");
    first.publicModes.pop();
    expect(resolveTransportSelection(true, "none").publicModes).toEqual(
      ALL_PUBLIC_MODES,
    );
  });
});
