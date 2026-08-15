/**
 * KAI-89 model calibration helpers.
 *
 * Shared, deterministic statistics over the COMMITTED calibration truth
 * (scripts/audit/kai-89-calibration-truth.json) — never over the live
 * catalogue (the catalogue contains the values being replaced).
 */
import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../../src/shared/types/destination";

export interface CalibrationTruth {
  trusted: Record<string, string[]>;
  exclusions: Record<string, string[]>;
  ticketEvidence: Record<
    string,
    { jpy: number; source?: string[]; kind?: string }
  >;
  seed: number;
}

const truthPath = path.join(
  process.cwd(),
  "scripts/audit/kai-89-calibration-truth.json",
);

export function loadTruth(): CalibrationTruth {
  return JSON.parse(fs.readFileSync(truthPath, "utf8")) as CalibrationTruth;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function iqr(values: number[]): number {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

/** Round a modelled value to a coarse, honest increment. */
export function roundTo(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

export function roundTo5(value: number): number {
  return roundTo(value, 5);
}

/** Visit-duration bucket used by the budget model (hours). */
export function durationBucket(
  maxHours: number | undefined,
): "short" | "half" | "full" {
  const max = maxHours ?? 2;
  if (max <= 2.5) return "short";
  if (max <= 5) return "half";
  return "full";
}

/** Kind-group for peer cells (falls back to a coarse group). */
export function kindGroup(dest: Destination): string {
  const kind = dest.kind ?? "none";
  const groups: Record<string, string> = {
    castle: "castle",
    palace: "castle",
    temple: "temple",
    shrine: "shrine",
    museum: "museum",
    garden: "garden",
    park: "park",
    onsen: "onsen",
    mountain: "nature",
    lake: "nature",
    waterfall: "nature",
    nature: "nature",
    natural: "nature",
    island: "island",
    beach: "beach",
    zoo: "zoo",
    aquarium: "aquarium",
    tower: "tower",
    bridge: "tower",
    theme_park: "theme_park",
    amusement_park: "theme_park",
  };
  return groups[kind] ?? kind;
}

/** Calendar seasons (Japan convention) for month lookups. */
export const SEASON_OF_MONTH: Record<
  number,
  "spring" | "summer" | "autumn" | "winter"
> = {
  3: "spring",
  4: "spring",
  5: "spring",
  6: "summer",
  7: "summer",
  8: "summer",
  9: "autumn",
  10: "autumn",
  11: "autumn",
  12: "winter",
  1: "winter",
  2: "winter",
};

/** Japan climate band from latitude (coarse; no false precision). */
export function latitudeBand(
  dest: Destination,
): "tropical" | "temperate" | "cool" | "unknown" {
  const lat = dest.coordinates?.lat;
  if (lat === undefined) return "unknown";
  if (lat < 28) return "tropical"; // Okinawa/Amami
  if (lat <= 38) return "temperate"; // Kyushu..Kanto
  return "cool"; // Tohoku/Hokkaido
}
