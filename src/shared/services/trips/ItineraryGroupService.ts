import type { Destination } from "@/shared/types/destination";
import type { DayPlan } from "../recommendation/DayPlanGeneratorService";

export interface ItineraryItem {
  id: string;
  destinationId: string;
  name: string;
}

export interface ItineraryGroup {
  id: string;
  type: "destination_pair" | "generated_plan";
  pairKey?: string;
  title: { en: string; ja: string };
  destinations: Destination[];
  plan?: DayPlan;
  createdAt: string;
}

const STORAGE_KEY = "tabimap_itinerary_groups_v1";

function loadStorage(): Record<string, ItineraryGroup[]> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStorage(data: Record<string, ItineraryGroup[]>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save itinerary groups", err);
  }
}

export function getCombinationKey(id1: string, id2: string): string {
  const sorted = [id1, id2].sort();
  return `combination:${sorted.join(":")}`;
}

export function getItineraryGroups(tripId: string): ItineraryGroup[] {
  const data = loadStorage();
  return data[tripId] || [];
}

export function isGroupSaved(tripId: string, pairKey: string): boolean {
  const groups = getItineraryGroups(tripId);
  return groups.some((g) => g.pairKey === pairKey);
}

export function saveItineraryGroup(
  tripId: string,
  group: ItineraryGroup,
): ItineraryGroup[] {
  const data = loadStorage();
  const existing = data[tripId] || [];

  const filtered = existing.filter((g) => {
    if (group.pairKey && g.pairKey === group.pairKey) return false;
    if (g.id === group.id) return false;
    return true;
  });

  const updated = [group, ...filtered];
  data[tripId] = updated;
  saveStorage(data);
  return updated;
}

export function removeItineraryGroup(
  tripId: string,
  groupId: string,
): ItineraryGroup[] {
  const data = loadStorage();
  const existing = data[tripId] || [];
  const updated = existing.filter((g) => g.id !== groupId);
  data[tripId] = updated;
  saveStorage(data);
  return updated;
}
