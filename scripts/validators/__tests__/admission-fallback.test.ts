import destinationIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import { admissionFallbackValidator } from "../admission-fallback";

const config = {
  hubCollectionBlacklist: [],
  budgetTolerancePercent: 0,
  budgetMinToleranceYen: 0,
  httpTimeoutMs: 1000,
  maxWarningThreshold: 999,
  allowedImageMimeTypes: [],
};

describe("mandatory admission fallback validator", () => {
  it("rejects variable or unavailable canonical admissions that become bounded", async () => {
    const result = await admissionFallbackValidator.validate({
      catalog: {
        destinations: destinationIndex as unknown as Destination[],
        collections: [],
      },
      config,
    });

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
