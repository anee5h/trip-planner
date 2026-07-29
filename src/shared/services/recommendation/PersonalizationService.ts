import type { Destination } from "@/shared/types/destination";

export type NoveltyPreference = "FAMILIAR" | "BALANCED" | "NOVEL";

export interface PersonalizationSettings {
  enabled: boolean;
  novelty: NoveltyPreference;
}

export interface ImplicitUserProfile {
  categoryWeights: Record<string, number>;
  tagWeights: Record<string, number>;
  visitedIds: Set<string>;
  savedIds: Set<string>;
}

const SETTINGS_STORAGE_KEY = "tabimap_personalization_settings";
const DEFAULT_SETTINGS: PersonalizationSettings = {
  enabled: true,
  novelty: "BALANCED",
};

export class PersonalizationService {
  private settings: PersonalizationSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  public getSettings(): PersonalizationSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<PersonalizationSettings>): void {
    this.settings = { ...this.settings, ...updates };
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(this.settings),
        );
      }
    } catch {
      // Fail silent
    }
  }

  public resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
      }
    } catch {
      // Fail silent
    }
  }

  /**
   * Builds an implicit interest profile from user's saved & visited destinations.
   */
  public buildUserProfile(
    allDestinations: Destination[],
    savedIds: string[] = [],
    visitedIds: string[] = [],
  ): ImplicitUserProfile {
    const categoryWeights: Record<string, number> = {};
    const tagWeights: Record<string, number> = {};

    const savedSet = new Set(savedIds);
    const visitedSet = new Set(visitedIds);

    for (const dest of allDestinations) {
      if (!dest) continue;
      const destRecord = dest as Record<string, any>;

      const isSaved = savedSet.has(dest.id);
      const isVisited = visitedSet.has(dest.id);

      if (!isSaved && !isVisited) continue;

      // Saved destinations carry 2.0x weight; Visited carry 1.0x weight
      const weight = (isSaved ? 2.0 : 0.0) + (isVisited ? 1.0 : 0.0);

      const cat = destRecord.category || destRecord.vibeCategory;
      if (cat) {
        categoryWeights[cat] = (categoryWeights[cat] || 0) + weight;
      }

      if (dest.tags) {
        for (const tag of dest.tags) {
          tagWeights[tag] = (tagWeights[tag] || 0) + weight;
        }
      }
    }

    return {
      categoryWeights,
      tagWeights,
      visitedIds: visitedSet,
      savedIds: savedSet,
    };
  }

  /**
   * Calculates personalization score multiplier for a given destination.
   */
  public calculateMultiplier(
    destination: Destination,
    userProfile: ImplicitUserProfile,
    customSettings?: PersonalizationSettings,
  ): number {
    const settings = customSettings || this.settings;

    if (!settings.enabled || !destination) {
      return 1.0; // Zero ranking impact when disabled or malformed
    }

    let multiplier = 1.0;
    const destRecord = destination as Record<string, any>;

    // 1. Repeated Interest Boost (Category Match)
    const cat = destRecord.category || destRecord.vibeCategory;
    if (cat && userProfile.categoryWeights[cat]) {
      const weight = userProfile.categoryWeights[cat];
      const categoryBoost = Math.min(0.15, weight * 0.03); // Max +15% boost
      multiplier += categoryBoost;
    }

    // 2. Tag Interest Boost
    if (destination.tags) {
      let tagScore = 0;
      for (const tag of destination.tags) {
        if (userProfile.tagWeights[tag]) {
          tagScore += userProfile.tagWeights[tag];
        }
      }
      if (tagScore > 0) {
        const tagBoost = Math.min(0.1, tagScore * 0.02); // Max +10% boost
        multiplier += tagBoost;
      }
    }

    // 3. Novelty Adjustment
    const isVisited = userProfile.visitedIds.has(destination.id);

    if (settings.novelty === "NOVEL" && isVisited) {
      multiplier *= 0.85; // Demote visited places when novelty is requested
    } else if (settings.novelty === "FAMILIAR" && isVisited) {
      multiplier *= 1.15; // Boost visited places when familiar is requested
    }

    return Number(multiplier.toFixed(3));
  }
}

export const personalizationService = new PersonalizationService();
