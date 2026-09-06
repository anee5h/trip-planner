import { describe, expect, it } from "vitest";

import destinationIndex from "../../../shared/data/destinations-index.json";
import type { Destination } from "../../../shared/types/destination";
import { getLocalizedOpeningHours } from "../destinationOpeningHours";

describe("destination opening-hours projection", () => {
  const ueno = (destinationIndex as unknown as Destination[]).find(
    (destination) => destination.id === "ueno-zoo",
  );

  it("projects Ueno's verified canonical hours in English and Japanese", () => {
    expect(ueno).toBeDefined();
    expect(getLocalizedOpeningHours(ueno!, "en")).toBe(
      "09:30 - 17:00 (Closed Mondays)",
    );
    expect(getLocalizedOpeningHours(ueno!, "ja")).toBe(
      "09:30〜17:00（月曜休園・12/29〜1/1、最終入園16:00）",
    );
  });

  it("never lets stale localized opening-hours prose override canonical facts", () => {
    expect(ueno).toBeDefined();
    const staleLocalizedCopy = {
      ...ueno!,
      content: {
        ...ueno!.content,
        en: { ...ueno!.content?.en, openingHours: "24 Hours (Open access)" },
        ja: { ...ueno!.content?.ja, openingHours: "散策自由（24時間開放）" },
      },
    } as Destination;

    expect(getLocalizedOpeningHours(staleLocalizedCopy, "en")).toBe(
      "09:30 - 17:00 (Closed Mondays)",
    );
    expect(getLocalizedOpeningHours(staleLocalizedCopy, "ja")).toBe(
      "09:30〜17:00（月曜休園・12/29〜1/1、最終入園16:00）",
    );
  });
});
