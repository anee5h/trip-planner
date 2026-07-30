import { describe, it, expect } from "vitest";
import { getCombinationKey } from "../ItineraryGroupService";

describe("ItineraryGroupService", () => {
  it("generates deterministic combination keys for A+B and B+A", () => {
    const key1 = getCombinationKey("tokyo-skytree", "sensoji");
    const key2 = getCombinationKey("sensoji", "tokyo-skytree");

    expect(key1).toBe(key2);
    expect(key1).toBe("combination:sensoji:tokyo-skytree");
  });
});
