import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog/loader";
import { DEFAULT_VALIDATION_CONFIG } from "../config/validation-rules";
import { ratingsValidator } from "./ratings";

describe("ratings validator", () => {
  it("reports malformed ratings without crashing", async () => {
    const catalog = await loadCatalog();
    const destination = {
      ...catalog.destinations[0],
      ratings: undefined,
    };
    const result = await ratingsValidator.validate({
      catalog: { ...catalog, destinations: [destination] as never },
      config: DEFAULT_VALIDATION_CONFIG,
    });

    expect(result.issues[0]?.code).toBe("MISSING_RATINGS");
  });

  it("requires schema version 2 for verified destinations", async () => {
    const catalog = await loadCatalog();
    const destination = {
      ...catalog.destinations.find(({ status }) => status === "verified")!,
      ratingsSchemaVersion: undefined,
    };
    const result = await ratingsValidator.validate({
      catalog: { ...catalog, destinations: [destination] },
      config: DEFAULT_VALIDATION_CONFIG,
    });

    expect(
      result.issues.some(
        ({ code }) => code === "MISSING_RATING_SCHEMA_VERSION",
      ),
    ).toBe(true);
  });
});
