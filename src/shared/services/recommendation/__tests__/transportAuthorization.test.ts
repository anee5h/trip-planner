import { describe, expect, it } from "vitest";
import { getValidModes } from "../RecommendationScorer";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";

const byId = new Map(
  (destinationsIndex as Destination[]).map((d) => [d.id, d]),
);

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const FUKUOKA = { lat: 33.5902, lng: 130.4017 };
const NAHA = { lat: 26.2124, lng: 127.6809 };
const ALL_MODES = ["train", "shinkansen", "bus", "flight", "car", "my_car"];
const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight"];

describe("flight registry authorization", () => {
  it("Tokyo → Sapporo permits Flight through HND→CTS", () => {
    const modes = getValidModes(
      byId.get("sapporo-city")!,
      "none",
      PUBLIC_MODES,
      TOKYO,
    );
    expect(modes).toContain("flight");
  });

  it("Tokyo → Ishigaki permits Flight through HND→ISG and no land modes", () => {
    const modes = getValidModes(
      byId.get("ishigaki-city")!,
      "none",
      ALL_MODES,
      TOKYO,
    );
    expect(modes).toContain("flight");
    expect(
      modes.some((m) =>
        ["train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("Tokyo → Miyako permits Flight through HND→MMY", () => {
    const modes = getValidModes(
      byId.get("yonaha-maehama-beach-miyako")!,
      "none",
      PUBLIC_MODES,
      TOKYO,
    );
    expect(modes).toContain("flight");
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

describe("preference ordering", () => {
  it("economy Tokyo → Naha with Train and Flight enabled returns Flight", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train", "flight"],
      TOKYO,
      "economy",
    );
    expect(modes).toContain("flight");
    expect(modes).not.toEqual([]);
  });

  it("standard Tokyo → Naha with Train and Flight enabled returns Flight", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train", "flight"],
      TOKYO,
      "standard",
    );
    expect(modes).toContain("flight");
  });

  it("Naha-local with train enabled returns local rail", () => {
    const modes = getValidModes(
      byId.get("naha-city")!,
      "none",
      ["train"],
      NAHA,
    );
    expect(modes).toContain("train");
  });
});

describe("ferry registry authorization", () => {
  it("Tokyo → Ogasawara with ferry selected returns ferry", () => {
    const modes = getValidModes(
      byId.get("ogasawara-islands-tokyo")!,
      "none",
      ["ferry"],
      TOKYO,
    );
    expect(modes).toEqual(["ferry"]);
  });

  it("Tokyo → Ogasawara never returns flight or land modes", () => {
    const modes = getValidModes(
      byId.get("ogasawara-islands-tokyo")!,
      "none",
      ALL_MODES,
      TOKYO,
    );
    expect(
      modes.some((m) =>
        ["flight", "train", "shinkansen", "bus", "car", "my_car"].includes(m),
      ),
    ).toBe(false);
  });

  it("no ferry route from Fukuoka to Ogasawara", () => {
    const modes = getValidModes(
      byId.get("ogasawara-islands-tokyo")!,
      "none",
      ["ferry"],
      FUKUOKA,
    );
    expect(modes).toEqual([]);
  });
});
