import { describe, expect, it } from "vitest";
import { openingHoursValidator } from "../opening-hours";
import type { Destination } from "../../../src/shared/types/destination";
import type { ValidationContext } from "../types";

function context(destinations: Destination[]): ValidationContext {
  return { catalog: { destinations, collections: [] }, config: {} as never };
}

function dest(overrides: Partial<Destination> & { id: string }): Destination {
  return {
    id: overrides.id,
    name: overrides.id,
    kind: "attraction",
    ...overrides,
  } as Destination;
}

describe("Opening Hours Integrity validator", () => {
  it("passes verified specific-window hours on an open-area kind", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "verified-garden",
          kind: "garden",
          businessHours: "09:00 - 17:00",
          openingHoursMetadata: {
            verifiedAt: new Date().toISOString().split("T")[0],
            sourceUrl: "https://example.com/hours",
          },
        }),
      ]),
    );
    expect(result.passed).toBe(true);
  });

  it("fails NEW specific-window hours on open-area kinds without metadata", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "new-peninsula",
          kind: "nature",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
    );
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe("OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED");
  });

  it("allows the committed allowlist as warnings (documented debt, issue #335)", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "izu",
          kind: "nature",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
    );
    expect(result.passed).toBe(true);
    expect(result.metrics.warningsCount).toBe(1);
  });

  it("fails malformed or future verifiedAt metadata", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "bad-date",
          businessHours: "09:00 - 17:00",
          openingHoursMetadata: {
            verifiedAt: "2099-01-01",
            sourceUrl: "https://x.example",
          },
        }),
      ]),
    );
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe("MALFORMED_HOURS_METADATA");
  });

  it("does not flag ordinary gated destinations with hours and no metadata as errors", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "museum-1",
          kind: "museum",
          businessHours: "09:00 - 17:00",
        }),
      ]),
    );
    expect(result.passed).toBe(true);
  });

  it("does not flag hub records the hours policy deems not_required", async () => {
    const result = await openingHoursValidator.validate(
      context([
        dest({
          id: "odaiba-minato",
          role: "hub",
          kind: "district",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
    );
    expect(result.passed).toBe(true);
    expect(
      result.issues.some(
        (i) => i.code === "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
      ),
    ).toBe(false);
  });
});
