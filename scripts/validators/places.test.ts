import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog/loader";
import { placesValidator } from "./places";

describe("places validator official websites", () => {
  it("rejects non-http official website URLs", async () => {
    const catalog = await loadCatalog();
    const destinations = catalog.destinations.map((place, index) =>
      index === 1 ? { ...place, officialWebsite: "ftp://example.com" } : place,
    );
    const result = await placesValidator.validate({
      catalog: { ...catalog, destinations },
      config: {
        hubCollectionBlacklist: [],
        budgetTolerancePercent: 0.02,
        budgetMinToleranceYen: 100,
        httpTimeoutMs: 1000,
        maxWarningThreshold: 1000,
        allowedImageMimeTypes: [],
      },
    });

    expect(
      result.issues.some(
        (issue) =>
          issue.code === "DESTINATION_INVALID_OFFICIAL_WEBSITE" &&
          issue.targetId === destinations[1].id,
      ),
    ).toBe(true);
  });
});
