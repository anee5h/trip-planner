/**
 * duration-model-v1 + hub-window-model-v1 — KAI-89 visit-duration model.
 *
 * POI/standalone records get a coarse kind-band grid (standard duration
 * bands; no sub-grid precision). CITY/WARD/TOWN/Village HUB records get a
 * SEPARATE model: the field represents a "reasonable exploration window"
 * for the whole municipality, NOT an attraction visit duration. The hub
 * window is derived from importance, number of contained children, and
 * metro status; it produces a small set of explainable windows instead of
 * one identical {6,12} template across all hubs.
 */
import type { Destination } from "../../src/shared/types/destination";

export interface DurationModelOutput {
  action: "set" | "keep" | "unknown";
  reason: string;
  visitHours?: { min: number; max: number };
  confidence: "high" | "medium" | "low" | "unknown";
  modelVersion: "duration-model-v1" | "hub-window-model-v1";
}

const HUB_KINDS = new Set(["city", "ward", "town", "village"]);

/** POI/standalone kind bands (hours), calibrated on trusted kind anchors. */
const KIND_BANDS: Record<string, { min: number; max: number }> = {
  castle: { min: 1.5, max: 3 },
  palace: { min: 1.5, max: 3 },
  temple: { min: 1, max: 2 },
  shrine: { min: 1, max: 2 },
  museum: { min: 1.5, max: 3 },
  garden: { min: 1.5, max: 3 },
  park: { min: 2, max: 4 },
  nature: { min: 3, max: 6 },
  natural: { min: 3, max: 6 },
  mountain: { min: 4, max: 8 },
  lake: { min: 2, max: 4 },
  waterfall: { min: 1, max: 2 },
  island: { min: 3, max: 8 },
  beach: { min: 2, max: 4 },
  onsen: { min: 3, max: 5 },
  zoo: { min: 2, max: 4 },
  aquarium: { min: 2, max: 4 },
  tower: { min: 1, max: 2 },
  bridge: { min: 0.5, max: 1.5 },
  theme_park: { min: 4, max: 8 },
  amusement_park: { min: 4, max: 8 },
  shopping: { min: 1.5, max: 3 },
  market: { min: 1, max: 2 },
  street: { min: 1, max: 2 },
  district: { min: 2, max: 4 },
  viewpoint: { min: 1, max: 2 },
  station: { min: 0.5, max: 1.5 },
};

const SCALE_UPLIFT = { min: 1, max: 2 }; // unesco/collection/highlights >= 4

// Explicit metropolitan hubs (review fix): the legacy `region === "Kanto"`
// test flagged rural Kanto towns (Nikko, Chichibu, Minakami) as metro.
// Metro = the 23 Tokyo wards (all ward-kind hubs are exactly those) plus
// the named major cities below; anything else gets no metro adjustment.
const METRO_CITY_IDS = new Set([
  "yokohama-city",
  "osaka-city",
  "kyoto-city",
  "nagoya-city",
  "sapporo-city",
  "kobe-city",
  "fukuoka-city",
  "sendai-city",
  "hiroshima-city",
  "naha-city",
  "kawasaki-city",
  "saitama-city",
  "chiba-city",
]);

/** Hub window model: exploration window, not attraction visit time. */
function hubWindow(
  dest: Destination,
  childrenCount: number,
): { min: number; max: number } {
  const importanceAdj =
    dest.importance === "major" ? 2 : dest.importance === "notable" ? 1 : 0;
  const childrenAdj = childrenCount >= 10 ? 1 : childrenCount >= 3 ? 0.5 : 0;
  const isMetro = dest.kind === "ward" || METRO_CITY_IDS.has(dest.id);
  const metroAdj = isMetro ? 1 : 0;
  const center = Math.round(8 + importanceAdj + childrenAdj + metroAdj);
  const min = Math.max(4, center - 3);
  // Cap at 12h (the legacy template maximum): longer hub windows push
  // round-trip day-trip feasibility over the limit and silently exclude
  // hubs from day-trip Explore views.
  const max = Math.min(12, center + 4);
  return { min, max };
}

export function durationModel(
  dest: Destination,
  eligibleIds: Set<string>,
  childCountById: Map<string, number>,
): DurationModelOutput {
  // An explicit manual duration is an owner decision (KAI-157 review: a
  // corrected destination-time band). The model must not override it —
  // same pattern as budgetMetadata.method === "manual" in the derive pass.
  if (dest.durationMetadata?.method === "manual") {
    return {
      action: "keep",
      reason: "manual duration override (owner decision)",
      confidence: dest.durationMetadata.confidence ?? "medium",
      modelVersion: "duration-model-v1",
    };
  }
  if (!eligibleIds.has(dest.id)) {
    return {
      action: "keep",
      reason: "outside model scope (override precedence)",
      confidence: "unknown",
      modelVersion: "duration-model-v1",
    };
  }

  if (HUB_KINDS.has(dest.kind ?? "")) {
    const children = childCountById.get(dest.id) ?? 0;
    const v = hubWindow(dest, children);
    const isMetro = dest.kind === "ward" || METRO_CITY_IDS.has(dest.id);
    return {
      action: "set",
      reason: `hub exploration window: importance ${dest.importance ?? "standard"}, ${children} children, metro=${isMetro}`,
      visitHours: v,
      confidence: "low",
      modelVersion: "hub-window-model-v1",
    };
  }

  const kind = dest.kind ?? "";
  const band = KIND_BANDS[kind];
  if (!band) {
    return {
      action: "unknown",
      reason: `no duration band for kind '${kind}'; VERIFY_BY_TYPE keeps current value with low-confidence provenance`,
      confidence: "unknown",
      modelVersion: "duration-model-v1",
    };
  }

  const unescoOrCollection = Boolean(dest.collections?.length);
  const highlights = (dest.highlights ?? []).length;
  const uplift =
    unescoOrCollection || highlights >= 4 ? SCALE_UPLIFT : { min: 0, max: 0 };
  return {
    action: "set",
    reason: `kind band '${kind}'${uplift.min ? " + scale uplift" : ""}`,
    visitHours: { min: band.min + uplift.min, max: band.max + uplift.max },
    confidence: "medium",
    modelVersion: "duration-model-v1",
  };
}
