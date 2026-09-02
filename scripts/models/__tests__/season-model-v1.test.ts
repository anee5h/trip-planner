/**
 * Season rule order + spring/autumn classification (owner final-pass
 * review #3). Rule chain: hub exclusion → snow → beach → indoor → SPRING +
 * FOLIAGE dual → foliage-only → spring-only → unknown. Autumn is NEVER
 * inferred from spring alone; the dual branch must be reachable (foliage
 * must not return first).
 */
import { describe, expect, it } from "vitest";
import type { Destination } from "../../../src/shared/types/destination";
import { seasonModel } from "../season-model-v1";

function baseDest(overrides: Partial<Destination>): Destination {
  return {
    id: "test-dest",
    name: "Test Dest",
    prefecture: "Tochigi",
    region: "Kanto",
    categories: [],
    heroImage: "",
    description: "",
    highlights: [],
    tags: [],
    reservation: "",
    parking: "",
    notes: "",
    ratings: {} as Destination["ratings"],
    ...overrides,
  } as Destination;
}

const eligible = new Set(["test-dest"]);

describe("season-model-v1 rule order (spring/autumn)", () => {
  it("spring signal ONLY → bestMonths [4,5], bestSeason 'Spring'", () => {
    const d = baseDest({
      categories: ["Cherry Blossom"],
      tags: ["Sakura viewing"],
      name: "Miharu Takizakura",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("set");
    if (out.action !== "set") return;
    expect(out.bestMonths).toEqual([4, 5]);
    expect(out.bestSeason).toBe("Spring");
    expect(out.bestMonths).not.toContain(10);
    expect(out.bestMonths).not.toContain(11);
  });

  it("foliage signal ONLY → bestMonths [10,11], bestSeason 'Autumn'", () => {
    const d = baseDest({
      categories: ["Foliage"],
      tags: ["Autumn leaves", "Momiji"],
      name: "Maple Valley",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("set");
    if (out.action !== "set") return;
    expect(out.bestMonths).toEqual([10, 11]);
    expect(out.bestSeason).toBe("Autumn");
  });

  it("spring + foliage DUAL signal → bestMonths [4,5,10,11], 'Spring & Autumn'", () => {
    // Both signals in the same record: the dual branch MUST be reachable
    // (foliage must not short-circuit first).
    const d = baseDest({
      categories: ["Cherry Blossom", "Foliage"],
      tags: ["Sakura", "Momiji"],
      name: "Sakura Momiji Park",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("set");
    if (out.action !== "set") return;
    expect(out.bestMonths).toEqual([4, 5, 10, 11]);
    expect(out.bestSeason).toBe("Spring & Autumn");
  });

  it("Miharu Takizakura regression: spring-only, no fabricated autumn", () => {
    const d = baseDest({
      name: "Miharu Takizakura",
      categories: ["Cherry Blossom", "Tree"],
      tags: ["Sakura", "spring flower"],
      description:
        "A single 1,000-year-old weeping cherry tree near Miharu Castle; peaks mid-April.",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("set");
    if (out.action !== "set") return;
    expect(out.bestMonths).toEqual([4, 5]);
    expect(out.bestSeason).toBe("Spring");
  });

  it("unrelated prose does not create a dual-season signal", () => {
    // 'spring' as a word alone is not a signal (SPRING_RE requires
    // 'spring flower' / 'cherry blossom' / 'sakura' / 'plum blossom' /
    // 花見 / 桜 / 梅); foliage must be a real autumn signal.
    const d = baseDest({
      categories: ["Nature"],
      tags: ["Foliage"],
      name: "Spring Valley",
      description: "Enjoy the scenery in spring.",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("set");
    if (out.action !== "set") return;
    // Foliage-only: autumn, NOT dual.
    expect(out.bestMonths).toEqual([10, 11]);
    expect(out.bestSeason).toBe("Autumn");
  });

  it("hub records still get no vector regardless of spring/foliage tags", () => {
    const d = baseDest({
      kind: "city",
      role: "hub",
      categories: ["Cherry Blossom", "Foliage"],
      name: "Dual Season City",
    });
    const out = seasonModel(d, eligible);
    expect(out.action).toBe("neutralize");
  });

  it("manual season provenance is protected from model neutralization", () => {
    const d = baseDest({
      id: "manual-sakura",
      kind: "castle",
      role: "standalone",
      categories: ["History"],
      name: "Manual Sakura Castle",
      bestSeason: "Spring",
      bestMonths: [4, 5],
      season: { spring: 10, summer: 6, autumn: 5, winter: 4 },
      seasonMetadata: {
        method: "manual",
        modelVersion: "season-model-v1",
        confidence: "high",
        basis: "KAI-151 Phase 2A official sakura evidence",
      },
    });
    const out = seasonModel(d, new Set(["manual-sakura"]));
    expect(out.action).toBe("keep");
  });
});
