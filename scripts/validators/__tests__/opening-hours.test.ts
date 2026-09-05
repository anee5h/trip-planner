import { describe, expect, it } from "vitest";
import { validateOpeningHours } from "../opening-hours";
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

const emptyAllowlist = new Set<string>();

describe("Opening Hours Integrity validator", () => {
  it("passes verified specific-window hours on an open-area kind", async () => {
    const result = await validateOpeningHours(
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
      emptyAllowlist,
    );
    expect(result.passed).toBe(true);
  });

  it("fails NEW specific-window hours on open-area kinds without metadata", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "new-peninsula",
          kind: "nature",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe("OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED");
  });

  it("allows the committed allowlist as warnings (documented debt, issue #335)", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "izu",
          kind: "nature",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
      new Set(["izu"]),
    );
    expect(result.passed).toBe(true);
    expect(result.metrics.warningsCount).toBe(1);
  });

  it("fails malformed or future verifiedAt metadata", async () => {
    const result = await validateOpeningHours(
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
      emptyAllowlist,
    );
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe("MALFORMED_HOURS_METADATA");
  });

  it("does not flag ordinary gated destinations with hours and no metadata as errors", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "museum-1",
          kind: "museum",
          businessHours: "09:00 - 17:00",
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(true);
  });

  it("does not flag hub records the hours policy deems not_required", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "odaiba-minato",
          role: "hub",
          kind: "district",
          businessHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(true);
    expect(
      result.issues.some(
        (i) => i.code === "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
      ),
    ).toBe(false);
  });

  it("fails when an allowlisted entry no longer matches an active violation (KAI-335 hardening)", async () => {
    // "shukkeien" in the allowlist; this fixture has fresh verified
    // metadata, so the entry is stale and must fail.
    const result = await validateOpeningHours(
      context([
        dest({
          id: "shukkeien",
          kind: "garden",
          businessHours: "09:00–18:00 (Mar 16–Sep 15)",
          openingHoursMetadata: {
            verifiedAt: new Date().toISOString().split("T")[0],
            sourceUrl: "https://example.com/hours",
          },
        }),
      ]),
      new Set(["shukkeien"]),
    );
    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "STALE_OPENING_HOURS_ALLOWLIST_ENTRY",
      ),
    ).toBe(true);
  });

  it("gates the legacy openingHours field as well as businessHours (KAI-335)", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "legacy-hours-peninsula",
          kind: "nature",
          openingHours: "09:00 - 17:00 (Daily)",
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
      ),
    ).toBe(true);
  });

  it("catches en-dash specific windows on open-area kinds (KAI-335)", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "new-garden-en-dash",
          kind: "garden",
          businessHours: "09:00–17:00",
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
      ),
    ).toBe(true);
  });

  it("fails non-http(s) openingHoursMetadata.sourceUrl (KAI-335)", async () => {
    const result = await validateOpeningHours(
      context([
        dest({
          id: "bad-url",
          businessHours: "09:00 - 17:00",
          openingHoursMetadata: {
            sourceUrl: "example.com/hours",
          },
        }),
      ]),
      emptyAllowlist,
    );
    expect(result.passed).toBe(false);
    expect(
      result.issues.some((i) => i.code === "INVALID_HOURS_METADATA_URL"),
    ).toBe(true);
  });
});
