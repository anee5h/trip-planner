import { describe, expect, it } from "vitest";
import { getValidModes } from "../RecommendationScorer";
import { estimateTripDuration } from "../TripDurationService";
import {
  hasFerryRoute,
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "@/shared/services/transport/TransportTopologyService";
import { resolveTransportSelection } from "@/features/home/services/TransportResolver";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const KAWASAKI = { lat: 35.5313, lng: 139.7032 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const NAHA = { lat: 26.2124, lng: 127.6809 };
const ALL_MODES = ["train", "shinkansen", "bus", "flight", "car", "my_car"];

function publicSelection(coords: { lat: number; lng: number }) {
  return {
    selection: resolveTransportSelection("public"),
    zone: resolveOriginTransportZone({ coordinates: coords }),
  };
}

describe("flight registry authorization", () => {
  it("Naha → Ishigaki permits Flight and never Ferry", () => {
    const { selection, zone } = publicSelection(NAHA);
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      selection.carMode,
      selection.publicModes,
      NAHA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("ferry");
    expect(hasFerryRoute("okinawa-main", "ishigaki")).toBe(false);
  });

  it("Naha → Miyako permits Flight and never Ferry", () => {
    const { selection, zone } = publicSelection(NAHA);
    const modes = getValidModes(
      byId.get("yonaha-maehama-beach-miyako")!,
      selection.carMode,
      selection.publicModes,
      NAHA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("ferry");
    expect(hasFerryRoute("okinawa-main", "miyako")).toBe(false);
  });

  it("Fukuoka → Naha includes Flight", () => {
    const { selection, zone } = publicSelection(FUKUOKA);
    const modes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      FUKUOKA,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(modes).not.toContain("train");
    expect(modes).not.toContain("shinkansen");
  });

  it("Tokyo → Sapporo permits Flight through HND→CTS", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("sapporo-city")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("Tokyo → Ishigaki permits Flight through HND→ISG and no land modes", () => {
    const { zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      "none",
      ALL_MODES,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
    expect(
      modes.some((m) =>
        ["train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("Tokyo → Miyako permits Flight through HND→MMY", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const modes = getValidModes(
      byId.get("yonaha-maehama-beach-miyako")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toContain("flight");
  });

  it("changing distance alone never creates or removes a route", () => {
    const { selection } = publicSelection(TOKYO);
    const tokyoModes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      "mainland-honshu",
    );
    // Kawasaki is ~20 km from Tokyo but in the same zone: same result.
    const kawasakiModes = getValidModes(
      byId.get("naha-city")!,
      selection.carMode,
      selection.publicModes,
      KAWASAKI,
      undefined,
      "mainland-honshu",
    );
    expect(kawasakiModes).toEqual(tokyoModes);
    expect(kawasakiModes).toContain("flight");
  });
});

describe("conservative failure", () => {
  it("unknown origin → Naha returns no Train, Shinkansen, Bus or Car", () => {
    const modes = getValidModes(byId.get("naha-city")!, "none", ALL_MODES, {
      lat: 0,
      lng: 0,
    });
    expect(
      modes.some((m) =>
        ["train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("unresolved destination zone returns no modes", () => {
    const dest = {
      ...byId.get("naha-city")!,
      id: "unresolved-dest",
      kind: "island",
      tags: ["island"],
      prefecture: "Nagano",
      coordinates: { lat: 35.4, lng: 137.4 },
      transportZoneId: undefined,
    } as Destination;
    const modes = getValidModes(dest, "none", ALL_MODES, TOKYO);
    expect(modes).toEqual([]);
  });

  it("no topology connection returns no modes", () => {
    const modes = getValidModes(
      byId.get("sado-island")!,
      "none",
      ["train", "shinkansen", "bus", "flight"],
      FUKUOKA,
    );
    expect(modes).toEqual([]);
  });
});

describe("ferry connectivity is not estimability", () => {
  it("Tokyo → Naoshima never uses ground transport across water", () => {
    const { selection, zone } = publicSelection(NAHA);
    const dest = byId.get("naoshima-art-island-kagawa")!;
    const modes = getValidModes(
      dest,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toEqual([]);
    expect(
      modes.some((m) =>
        ["flight", "train", "shinkansen", "car", "bus"].includes(m),
      ),
    ).toBe(false);
    // Ferry connectivity is route-known via Uno/Takamatsu but not estimable.
    expect(
      hasFerryRoute("mainland-honshu", resolveDestinationTransportZone(dest)),
    ).toBe(true);
  });

  it("Tokyo → Ogasawara is route-known but unestimated", () => {
    const { selection, zone } = publicSelection(TOKYO);
    const dest = byId.get("ogasawara-islands-tokyo")!;
    const modes = getValidModes(
      dest,
      selection.carMode,
      selection.publicModes,
      TOKYO,
      undefined,
      zone,
    );
    expect(modes).toEqual([]);
    expect(hasFerryRoute("mainland-honshu", "ogasawara")).toBe(true);
    // No trip-duration estimate without an estimable mode.
    const estimate = estimateTripDuration(
      dest,
      { homeStationCoords: TOKYO },
      modes,
    );
    expect(estimate).toBeNull();
  });

  it("Ogasawara never returns flight or land modes from any selection", () => {
    const modes = getValidModes(
      byId.get("ogasawara-islands-tokyo")!,
      "none",
      ALL_MODES,
      TOKYO,
      undefined,
      "mainland-honshu",
    );
    expect(modes).toEqual([]);
  });

  it("no ferry route from Fukuoka to Ogasawara", () => {
    expect(hasFerryRoute("mainland-kyushu", "ogasawara")).toBe(false);
  });
});

describe("preference ordering", () => {
  it("economy Tokyo → Naha with Train and Flight enabled returns Flight", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train", "flight"],
      TOKYO,
      "economy",
      "mainland-honshu",
    );
    expect(modes).toContain("flight");
    expect(modes).not.toEqual([]);
  });

  it("Naha-local with train enabled returns local rail", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train"],
      NAHA,
      undefined,
      "okinawa-main",
    );
    expect(modes).toContain("train");
  });
});
