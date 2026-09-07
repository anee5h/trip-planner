import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import type { DestinationCombo } from "./DestinationCombinationService";
import {
  composeBoundedDiverseTopMatches,
  composeDetailRails,
  selectUniqueRail,
} from "./RailCompositionService";

type Candidate = {
  id: string;
  name: string;
  score: number;
  family: string;
};

function candidate(
  id: string,
  score: number,
  family: string,
  name = id,
): Candidate {
  return { id, name, score, family };
}

describe("canonical rail composition", () => {
  it("lets the earlier rail win and backfills the later rail in ranked order", () => {
    const seen = new Set(["a"]);
    const selected = selectUniqueRail(
      [
        candidate("a", 100, "history"),
        candidate("b", 99, "nature"),
        candidate("c", 98, "culture"),
      ],
      seen,
      3,
    );

    expect(selected.map(({ id }) => id)).toEqual(["b", "c"]);
    expect([...seen]).toEqual(["a"]);
  });

  it("deduplicates by canonical ID, not by localized or display name", () => {
    const selected = selectUniqueRail(
      [
        candidate("same-id", 100, "nature", "Same title"),
        candidate("same-id", 99, "nature", "Translated title"),
        candidate("different-id", 98, "nature", "Same title"),
      ],
      new Set(),
      10,
    );

    expect(selected.map(({ id }) => id)).toEqual(["same-id", "different-id"]);
  });

  it("returns fewer cards for a sparse pool and never invents a filler", () => {
    const selected = selectUniqueRail(
      [candidate("only", 100, "nature")],
      new Set(["already-rendered"]),
      4,
    );

    expect(selected.map(({ id }) => id)).toEqual(["only"]);
  });
});

describe("bounded Top Matches diversity", () => {
  const familyOf = (item: Candidate) => item.family;

  it("uses a nearby similarly qualified alternative to break a long family run", () => {
    const ranked = [
      candidate("a1", 100, "observation"),
      candidate("a2", 99, "observation"),
      candidate("a3", 98, "observation"),
      candidate("b1", 96, "nature"),
      candidate("a4", 95, "observation"),
    ];

    expect(
      composeBoundedDiverseTopMatches(ranked, {
        count: 4,
        familyOf,
        scoreOf: (item) => item.score,
        lookahead: 2,
        qualityMargin: 3,
        maxConsecutive: 2,
      }).map(({ id }) => id),
    ).toEqual(["a1", "a2", "b1", "a3"]);
  });

  it("does not reach far down the ranked pool just to change family", () => {
    const ranked = [
      candidate("a1", 100, "observation"),
      candidate("a2", 99, "observation"),
      candidate("a3", 98, "observation"),
      candidate("a4", 97, "observation"),
      ...Array.from({ length: 35 }, (_, index) =>
        candidate(`b${index}`, 50 - index, "nature"),
      ),
    ];

    expect(
      composeBoundedDiverseTopMatches(ranked, {
        count: 4,
        familyOf,
        scoreOf: (item) => item.score,
        lookahead: 3,
        qualityMargin: 3,
        maxConsecutive: 2,
      }).map(({ id }) => id),
    ).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("softens a dense first-screen family when a close alternative is nearby", () => {
    const ranked = [
      candidate("observation-1", 100, "observation"),
      candidate("nature-1", 96, "nature"),
      candidate("observation-2", 95, "observation"),
      candidate("observation-3", 94, "observation"),
      candidate("culture-1", 87, "culture"),
    ];

    expect(
      composeBoundedDiverseTopMatches(ranked, {
        count: 5,
        familyOf,
        scoreOf: (item) => item.score,
        lookahead: 2,
        qualityMargin: 7,
        diversityWindow: 5,
        maxFamilyCount: 2,
      }).map(({ id }) => id),
    ).toEqual([
      "observation-1",
      "nature-1",
      "observation-2",
      "culture-1",
      "observation-3",
    ]);
  });

  it("softens the reviewed default Home observation cluster", () => {
    const ranked = [
      candidate("roppongi-hills-tokyo-city-view", 79.032, "observation"),
      candidate("boso-peninsula", 76.6, "nature"),
      candidate("tokyo-skytree-sumida", 74.3278, "observation"),
      candidate("shibuya-sky-shibuya", 78.3877, "observation"),
      candidate(
        "tokyo-metropolitan-government-building-shinjuku",
        77.832,
        "observation",
      ),
      candidate("imperial-palace-chiyoda", 71.3342, "culture"),
      candidate("tokyo-tower-minato", 77.832, "observation"),
      candidate("sunshine-60-observatory-ikebukuro", 75.7285, "observation"),
      candidate("ueno-zoo", 69.032, "family"),
      candidate("joypolis", 67.1762, "nature"),
    ];

    expect(
      composeBoundedDiverseTopMatches(ranked, {
        count: 10,
        familyOf,
        scoreOf: (item) => item.score,
        lookahead: 3,
        qualityMargin: 8,
        diversityWindow: 5,
        maxFamilyCount: 2,
      }).map(({ id }) => id),
    ).toEqual([
      "roppongi-hills-tokyo-city-view",
      "boso-peninsula",
      "tokyo-skytree-sumida",
      "imperial-palace-chiyoda",
      "shibuya-sky-shibuya",
      "tokyo-metropolitan-government-building-shinjuku",
      "tokyo-tower-minato",
      "ueno-zoo",
      "sunshine-60-observatory-ikebukuro",
      "joypolis",
    ]);
  });

  it("leaves a strongly ranked homogeneous pool unchanged", () => {
    const ranked = [
      candidate("a1", 100, "observation"),
      candidate("a2", 90, "observation"),
      candidate("a3", 80, "observation"),
    ];

    expect(
      composeBoundedDiverseTopMatches(ranked, {
        count: 3,
        familyOf,
        scoreOf: (item) => item.score,
        lookahead: 2,
        qualityMargin: 3,
        maxConsecutive: 2,
      }).map(({ id }) => id),
    ).toEqual(["a1", "a2", "a3"]);
  });
});

describe("ordered Detail rail composition", () => {
  const place = (id: string) => ({ id }) as unknown as Destination;
  const combination = (id: string) =>
    ({
      primary: place("current"),
      secondary: place(id),
      explanation: { en: "", ja: "" },
      interDistanceKm: 1,
    }) as unknown as DestinationCombo;

  it("claims non-hub candidates in additions, nearby, then half-day order", () => {
    const composed = composeDetailRails({
      destinationId: "current",
      isHub: false,
      featuredChildSights: [],
      hubMoreDestinations: [],
      greatAdditions: [combination("a"), combination("b"), combination("c")],
      nearbyHubs: [],
      nearbyPlaces: [place("b"), place("c"), place("d")],
      halfDaySiblings: [place("c"), place("d"), place("e")],
    });

    expect(
      composed.greatAdditions.map(({ secondary }) => secondary.id),
    ).toEqual(["a", "b", "c"]);
    expect(composed.nearbyPlaces.map(({ id }) => id)).toEqual(["d"]);
    expect(composed.halfDaySiblings.map(({ id }) => id)).toEqual(["e"]);
  });

  it("claims hub rails in visual order and leaves no duplicate backfill", () => {
    const composed = composeDetailRails({
      destinationId: "current",
      isHub: true,
      featuredChildSights: [place("a"), place("b")],
      hubMoreDestinations: [place("b"), place("c")],
      greatAdditions: [combination("c"), combination("d")],
      nearbyHubs: [place("d"), place("e")],
      nearbyPlaces: [place("unused-place")],
      halfDaySiblings: [place("unused-half-day")],
    });

    expect(composed.featuredChildSights.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
    expect(composed.hubMoreDestinations.map(({ id }) => id)).toEqual(["c"]);
    expect(
      composed.greatAdditions.map(({ secondary }) => secondary.id),
    ).toEqual(["d"]);
    expect(composed.nearbyHubs.map(({ id }) => id)).toEqual(["e"]);
    expect(composed.nearbyPlaces).toEqual([]);
    expect(composed.halfDaySiblings).toEqual([]);
  });
});
