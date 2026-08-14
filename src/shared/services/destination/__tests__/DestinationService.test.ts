import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDestination,
  getDestinationForEditorialReview,
} from "../DestinationService";

describe("getDestination locale availability", () => {
  beforeEach(() => {
    // Force the in-memory index fallback path (fetch is not available in
    // the test environment and would otherwise fail silently).
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("no network in tests"))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for an unknown id", async () => {
    const dest = await getDestination("no-such-destination-id", "en");
    expect(dest).toBeNull();
    const destJa = await getDestination("no-such-destination-id", "ja");
    expect(destJa).toBeNull();
  });

  it("loads a published English destination", async () => {
    const dest = await getDestination("asakusa-taito", "en");
    expect(dest).not.toBeNull();
    expect(dest?.id).toBe("asakusa-taito");
  });

  it("loads a destination with missing Japanese editorial content in both English and Japanese", async () => {
    // abashiri-city has no Japanese editorial content yet, but must be reachable
    // in both EN and JA with identical IDs.
    const en = await getDestination("abashiri-city", "en");
    expect(en).not.toBeNull();
    expect(en?.id).toBe("abashiri-city");
    const ja = await getDestination("abashiri-city", "ja");
    expect(ja).not.toBeNull();
    expect(ja?.id).toBe("abashiri-city");
  });

  it("does not gate a reviewed bilingual destination in Japanese", async () => {
    // asakusa-taito is a reviewed hub with published Japanese content.
    const ja = await getDestination("asakusa-taito", "ja");
    expect(ja).not.toBeNull();
    expect(ja?.id).toBe("asakusa-taito");
  });

  it("loads records via the explicit editorial-review API", async () => {
    const editorial = await getDestinationForEditorialReview("abashiri-city");
    expect(editorial).not.toBeNull();
    expect(editorial?.id).toBe("abashiri-city");
  });
});
