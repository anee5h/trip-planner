import { describe, expect, it } from "vitest";
import destinationIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getDecisionCriticalRestrictions } from "../DecisionCriticalRestrictions";

describe("decision-critical destination restrictions", () => {
  it("surfaces Kamikochi seasonal closure and private-car access limits", () => {
    const kamikochi = (destinationIndex as unknown as Destination[]).find(
      (destination) => destination.id === "nagano-kamikochi",
    );

    expect(kamikochi).toBeDefined();
    const restrictions = getDecisionCriticalRestrictions(kamikochi!);

    expect(restrictions.map((restriction) => restriction.kind)).toEqual(
      expect.arrayContaining(["seasonal_closure", "private_car_access"]),
    );
    expect(
      restrictions.some((restriction) =>
        /mid-November to mid-April/i.test(restriction.detail),
      ),
    ).toBe(true);
    expect(
      restrictions.some((restriction) =>
        /private cars banned/i.test(restriction.detail),
      ),
    ).toBe(true);
    expect(
      restrictions.some(
        (restriction) => restriction.kind === "reservation_required",
      ),
    ).toBe(false);
  });

  it("does not create a warning for ordinary unrestricted destinations", () => {
    const destination = {
      id: "ordinary-park",
      name: "Ordinary Park",
      notes: "A pleasant public green space.",
      reservation: "Not required",
    } as unknown as Destination;

    expect(getDecisionCriticalRestrictions(destination)).toEqual([]);
  });
});
