import { describe, expect, it } from "vitest";
import catalogue from "../destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { getOpeningHoursAssessment } from "@/shared/services/recommendation/OpeningHoursPolicy";

const PLACEHOLDER = /reservation requirements are unverified/i;

/**
 * KAI-338: open-access places must not keep the generic "unverified"
 * reservation placeholder. These records are the only allowed exceptions;
 * each still needs a manual check against its official source.
 */
const MANUAL_CHECK_EXCEPTIONS: Record<string, string> = {
  // Official Gunma tourism listing says "Admission: Free" but states no
  // booking rule either way.
  "lake-okushima": "admission free per visit-gunma.jp; reservation not stated",
  // Official source retained, but its page gives only parking information.
  "lake-haruna": "official page covers parking only",
  // Official city homepage has no page for this bridge.
  "usui-third-bridge": "no usable official page found",
};

const destinations = catalogue as unknown as Destination[];

describe("open-access places and the reservation placeholder (KAI-338)", () => {
  const openAccessWithPlaceholder = destinations.filter(
    (destination) =>
      getOpeningHoursAssessment(destination).status === "not_required" &&
      PLACEHOLDER.test(
        [destination.reservation, destination.content?.en?.reservation].join(
          " ",
        ),
      ),
  );

  it("keeps the placeholder only on listed manual-check exceptions", () => {
    expect(openAccessWithPlaceholder.map(({ id }) => id).sort()).toEqual(
      Object.keys(MANUAL_CHECK_EXCEPTIONS).sort(),
    );
  });

  it("verified the Yubatake and Fukiware Falls reservation text in both languages", () => {
    for (const id of ["kusatsu-yubatake", "fukiware-falls"]) {
      const record = destinations.find((destination) => destination.id === id);
      expect(record?.reservation).toMatch(/^No reservation needed/);
      expect(record?.content?.en?.reservation).toBe(record?.reservation);
      expect(record?.reservationJa).toMatch(/予約不要/);
      expect(record?.content?.ja?.reservation).toBe(record?.reservationJa);
    }
  });
});
