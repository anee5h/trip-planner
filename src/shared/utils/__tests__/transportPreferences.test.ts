import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLIC_MODES,
  normalizeTransportPreferences,
  serializeTransportPreferences,
} from "@/shared/utils/transportPreferences";

describe("transport preferences", () => {
  it.each([
    [{ publicTransport: true, carMode: "none" }, "public only"],
    [{ publicTransport: false, carMode: "rental" }, "rental only"],
    [{ publicTransport: false, carMode: "my_car" }, "personal only"],
    [{ publicTransport: true, carMode: "rental" }, "public and rental"],
    [{ publicTransport: true, carMode: "my_car" }, "public and personal"],
  ])("preserves the valid %s state", (raw) => {
    expect(normalizeTransportPreferences(raw)).toMatchObject(raw);
  });

  it("normalizes the invalid rental and personal combination to one car mode", () => {
    expect(
      normalizeTransportPreferences({
        publicTransport: true,
        carMode: "rental+my_car",
        publicModes: ["train"],
      }),
    ).toMatchObject({ publicTransport: true, carMode: "none" });
  });

  it("repairs an all-off persisted state without clearing submodes", () => {
    expect(
      normalizeTransportPreferences({
        publicTransport: false,
        carMode: "none",
        publicModes: ["train"],
      }),
    ).toEqual({
      publicTransport: true,
      carMode: "none",
      publicModes: ["train"],
    });
  });

  it("keeps public submodes while public transit is temporarily off", () => {
    const value = normalizeTransportPreferences({
      publicTransport: false,
      carMode: "rental",
      publicModes: ["train", "ferry"],
    });
    expect(value.publicModes).toEqual(["train", "ferry"]);
    expect(serializeTransportPreferences(value).publicModes).toEqual([
      "train",
      "ferry",
    ]);
  });

  it("hydrates legacy public-mode-only preferences", () => {
    expect(normalizeTransportPreferences({})).toEqual({
      publicTransport: true,
      carMode: "none",
      publicModes: DEFAULT_PUBLIC_MODES,
    });
  });
});
