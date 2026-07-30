import { describe, expect, it } from "vitest";
import {
  calculateItemizedTripCost,
  isFreeDestination,
  formatLocalizedJPYRange,
} from "../BudgetService";
import type { Destination } from "@/shared/types/destination";

const mockPaidDest = {
  id: "shibuya-sky",
  name: "Shibuya Sky",
  categories: ["Observation Deck"],
  budgetMin: 2000,
  budgetMax: 3000,
  budgetRecommended: 8000,
  totalTripHours: 3,
  transportOptions: { train: 30 },
} as unknown as Destination;

const mockFreeDest = {
  id: "meiji-jingu",
  name: "Meiji Jingu",
  categories: ["Shrine"],
  tags: ["Free"],
  budgetMin: 0,
  budgetMax: 1000,
  totalTripHours: 2,
  transportOptions: { train: 20 },
} as unknown as Destination;

describe("BudgetService", () => {
  it("formats localized JPY range accurately", () => {
    expect(formatLocalizedJPYRange([7000, 26000], "en")).toBe("¥7k–26k");
    expect(formatLocalizedJPYRange([7000, 26000], "ja")).toBe("¥7千〜2.6万");
  });

  it("identifies free destinations accurately", () => {
    expect(isFreeDestination(mockFreeDest)).toBe(true);
    expect(isFreeDestination(mockPaidDest)).toBe(false);
  });

  it("calculates zero ticket cost for free destinations", () => {
    const itemizedFree = calculateItemizedTripCost(mockFreeDest, {
      partySize: 2,
    });
    expect(itemizedFree.isFreeTicket).toBe(true);
    expect(itemizedFree.tickets).toBe(0);
    expect(itemizedFree.perPersonRange[0]).toBeGreaterThan(0);
  });

  it("calculates itemized breakdown and party totals for paid destinations", () => {
    const itemizedPaid = calculateItemizedTripCost(mockPaidDest, {
      partySize: 2,
      activeMode: "train",
    });
    expect(itemizedPaid.isFreeTicket).toBe(false);
    expect(itemizedPaid.tickets).toBeGreaterThan(0);
    expect(itemizedPaid.transport).toBeGreaterThan(0);
    expect(itemizedPaid.partyRange[0]).toBeGreaterThan(
      itemizedPaid.perPersonRange[0],
    );
  });
});
