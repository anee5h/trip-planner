import { beforeAll, describe, expect, it } from "vitest";
import {
  findLowerCostAlternativeCandidates,
  isEligibleLowerCostAlternative,
} from "../DestinationCombinationService";
import {
  getFullPlaces,
  loadDestinationsIndex,
} from "@/shared/services/place/PlaceCatalog";
import type { Destination } from "@/shared/types/destination";

const makeDestination = (
  overrides: Partial<Destination> & Pick<Destination, "id" | "name">,
): Destination =>
  ({
    prefecture: "Tokyo",
    region: "Kanto",
    categories: ["test"],
    heroImage: "",
    description: "",
    highlights: [],
    transportOptions: {},
    ratings: { rain: 5 },
    coordinates: { lat: 35.68, lng: 139.76 },
    role: "poi",
    kind: "attraction",
    ...overrides,
    id: overrides.id,
    name: overrides.name,
  }) as Destination;

beforeAll(async () => {
  await loadDestinationsIndex();
});

describe("lower-cost alternative eligibility", () => {
  it("rejects Karuizawa Town to Kyu-Karuizawa as the same trip", () => {
    const catalogue = getFullPlaces() as Destination[];
    const primary = catalogue.find((place) => place.id === "karuizawa-town");
    const child = catalogue.find((place) => place.id === "kyu-karuizawa-ginza");

    expect(primary).toBeDefined();
    expect(child).toBeDefined();
    expect(isEligibleLowerCostAlternative(primary!, child!, catalogue)).toBe(
      false,
    );
    expect(
      findLowerCostAlternativeCandidates(primary!, 50, catalogue).map(
        (place) => place.id,
      ),
    ).not.toContain(child!.id);
  });

  it("accepts a genuinely different cheaper hub for downstream cost ranking", () => {
    const primary = makeDestination({
      id: "primary-hub",
      name: "Primary Hub",
      role: "hub",
      kind: "town",
      municipalityId: "Tokyo:primary",
      budgetRecommended: 5000,
    });
    const cheaperHub = makeDestination({
      id: "cheaper-hub",
      name: "Cheaper Hub",
      role: "hub",
      kind: "city",
      municipalityId: "Tokyo:alternative",
      coordinates: { lat: 35.69, lng: 139.77 },
      budgetRecommended: 1000,
    });
    const invalidChild = makeDestination({
      id: "invalid-child",
      name: "Invalid Child",
      relationships: { parentDestinationId: primary.id },
      coordinates: { lat: 35.6801, lng: 139.7601 },
    });
    const catalogue = [primary, invalidChild, cheaperHub];

    expect(isEligibleLowerCostAlternative(primary, cheaperHub, catalogue)).toBe(
      true,
    );
    expect(
      isEligibleLowerCostAlternative(primary, invalidChild, catalogue),
    ).toBe(false);
    expect(
      findLowerCostAlternativeCandidates(primary, 5, catalogue).map(
        (place) => place.id,
      ),
    ).toEqual(["cheaper-hub"]);
    expect(
      findLowerCostAlternativeCandidates(primary, 5, [primary, invalidChild]),
    ).toEqual([]);
  });

  it("rejects a child-to-parent candidate", () => {
    const parent = makeDestination({
      id: "parent-hub",
      name: "Parent Hub",
      role: "hub",
      kind: "city",
      municipalityId: "Tokyo:parent",
    });
    const child = makeDestination({
      id: "child-poi",
      name: "Child POI",
      relationships: { parentDestinationId: parent.id },
      municipalityId: parent.municipalityId,
    });

    expect(isEligibleLowerCostAlternative(child, parent, [child, parent])).toBe(
      false,
    );
  });

  it("rejects an ancestor even when the entity levels match", () => {
    const ancestor = makeDestination({
      id: "ancestor",
      name: "Ancestor",
      relationships: { featuredDestinationIds: ["middle"] },
    });
    const middle = makeDestination({
      id: "middle",
      name: "Middle",
      relationships: {
        parentDestinationId: ancestor.id,
        featuredDestinationIds: ["descendant"],
      },
    });
    const descendant = makeDestination({
      id: "descendant",
      name: "Descendant",
      relationships: { parentDestinationId: middle.id },
    });

    expect(
      isEligibleLowerCostAlternative(descendant, ancestor, [
        ancestor,
        middle,
        descendant,
      ]),
    ).toBe(false);
  });

  it("rejects an explicitly contained same-trip member without a parent link", () => {
    const primary = makeDestination({
      id: "container-hub",
      name: "Container Hub",
      role: "hub",
      kind: "town",
      relationships: { featuredDestinationIds: ["contained-hub"] },
    });
    const contained = makeDestination({
      id: "contained-hub",
      name: "Contained Hub",
      role: "hub",
      kind: "town",
      municipalityId: "Tokyo:contained",
    });

    expect(
      isEligibleLowerCostAlternative(primary, contained, [primary, contained]),
    ).toBe(false);
  });

  it("accepts an unrelated destination-level alternative POI", () => {
    const primary = makeDestination({
      id: "primary-poi",
      name: "Primary POI",
      municipalityId: "Tokyo:primary",
      areaId: "area-a",
    });
    const alternative = makeDestination({
      id: "alternative-poi",
      name: "Alternative POI",
      municipalityId: "Tokyo:alternative",
      areaId: "area-b",
      coordinates: { lat: 35.69, lng: 139.77 },
    });

    expect(
      isEligibleLowerCostAlternative(primary, alternative, [
        primary,
        alternative,
      ]),
    ).toBe(true);
    expect(
      findLowerCostAlternativeCandidates(primary, 5, [
        primary,
        alternative,
      ]).map((place) => place.id),
    ).toEqual(["alternative-poi"]);
  });

  it("keeps representative alternative pools at the selected entity level", () => {
    const catalogue = getFullPlaces() as Destination[];
    const ids = [
      "karuizawa-town",
      "obuse-town",
      "shibuya-city",
      "kyu-karuizawa-ginza",
      "shibuya-sky-shibuya",
    ];
    const matrix = ids.map((id) => {
      const primary = catalogue.find((place) => place.id === id)!;
      const candidates = findLowerCostAlternativeCandidates(
        primary,
        50,
        catalogue,
      );
      return {
        id,
        candidates: candidates.map((candidate) => candidate.id),
        candidateLevels: candidates.map((candidate) =>
          candidate.role === "hub" || candidate.kind === "city"
            ? "hub"
            : "destination",
        ),
      };
    });
    const karuizawa = matrix.find((entry) => entry.id === "karuizawa-town")!;
    const shibuyaHub = matrix.find((entry) => entry.id === "shibuya-city")!;
    const kyuKaruizawa = matrix.find(
      (entry) => entry.id === "kyu-karuizawa-ginza",
    )!;
    const shibuya = matrix.find((entry) => entry.id === "shibuya-sky-shibuya")!;
    expect(karuizawa.candidates).not.toContain("kyu-karuizawa-ginza");
    expect(karuizawa.candidateLevels.every((level) => level === "hub")).toBe(
      true,
    );
    expect(shibuyaHub.candidateLevels.every((level) => level === "hub")).toBe(
      true,
    );
    expect(
      kyuKaruizawa.candidateLevels.every((level) => level === "destination"),
    ).toBe(true);
    expect(
      shibuya.candidateLevels.every((level) => level === "destination"),
    ).toBe(true);
  });
});
