import { beforeEach, describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import { personalizationService } from "../PersonalizationService";

describe("PersonalizationService Unit Tests", () => {
  const mockDestinations: Destination[] = [
    {
      id: "hakone-onsen",
      name: "Hakone Onsen",
      category: "nature",
      tags: ["onsen", "mountains"],
    } as unknown as Destination,
    {
      id: "tokyo-skytree",
      name: "Tokyo Skytree",
      category: "city",
      tags: ["tower", "view"],
    } as unknown as Destination,
    {
      id: "nikko-toshogu",
      name: "Nikko Toshogu",
      category: "nature",
      tags: ["shrine", "mountains"],
    } as unknown as Destination,
  ];

  beforeEach(() => {
    personalizationService.resetSettings();
  });

  it("should return 1.0 multiplier when personalization is disabled", () => {
    const profile = personalizationService.buildUserProfile(
      mockDestinations,
      ["hakone-onsen"],
      [],
    );
    const multiplier = personalizationService.calculateMultiplier(
      mockDestinations[0],
      profile,
      { enabled: false, novelty: "BALANCED" },
    );

    expect(multiplier).toBe(1.0);
  });

  it("should boost destinations matching user's historical category and tag interests", () => {
    const profile = personalizationService.buildUserProfile(
      mockDestinations,
      ["hakone-onsen"], // saved nature spot with tags ["onsen", "mountains"]
      [],
    );

    // Nikko is also nature with "mountains" tag -> should be boosted
    const nikkoMultiplier = personalizationService.calculateMultiplier(
      mockDestinations[2],
      profile,
      { enabled: true, novelty: "BALANCED" },
    );

    expect(nikkoMultiplier).toBeGreaterThan(1.0);
  });

  it("should demote visited destinations when NOVEL preference is selected", () => {
    const profile = personalizationService.buildUserProfile(
      mockDestinations,
      [],
      ["hakone-onsen"], // visited hakone
    );

    const novelMultiplier = personalizationService.calculateMultiplier(
      mockDestinations[0],
      profile,
      { enabled: true, novelty: "NOVEL" },
    );

    expect(novelMultiplier).toBeLessThan(1.0);
  });

  it("should boost visited destinations when FAMILIAR preference is selected", () => {
    const profile = personalizationService.buildUserProfile(
      mockDestinations,
      [],
      ["hakone-onsen"], // visited hakone
    );

    const familiarMultiplier = personalizationService.calculateMultiplier(
      mockDestinations[0],
      profile,
      { enabled: true, novelty: "FAMILIAR" },
    );

    expect(familiarMultiplier).toBeGreaterThan(1.0);
  });

  it("should reset personalization settings cleanly", () => {
    personalizationService.updateSettings({ enabled: false, novelty: "NOVEL" });
    expect(personalizationService.getSettings().enabled).toBe(false);

    personalizationService.resetSettings();
    expect(personalizationService.getSettings().enabled).toBe(true);
    expect(personalizationService.getSettings().novelty).toBe("BALANCED");
  });
});
