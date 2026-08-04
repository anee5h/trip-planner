import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDestination,
  getDestinationForEditorialReview,
} from "../DestinationService";

describe("getDestination locale gating", () => {
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
  });

  it("loads a published English destination", async () => {
    const dest = await getDestination("asakusa-taito", "en");
    expect(dest).not.toBeNull();
    expect(dest?.id).toBe("asakusa-taito");
  });

  it("gates a destination that is unavailable in Japanese", async () => {
    // abashiri-city is published in English but has no published Japanese
    // content yet, so it must be reachable in EN and blocked in JA.
    const en = await getDestination("abashiri-city", "en");
    expect(en).not.toBeNull();
    expect(en?.id).toBe("abashiri-city");
    const ja = await getDestination("abashiri-city", "ja");
    expect(ja).toBeNull();
  });

  it("does not gate a reviewed bilingual destination in Japanese", async () => {
    // asakusa-taito is a reviewed hub with published Japanese content.
    const ja = await getDestination("asakusa-taito", "ja");
    expect(ja).not.toBeNull();
    expect(ja?.id).toBe("asakusa-taito");
  });

  it("loads an unpublished Japanese record via the explicit editorial-review API", async () => {
    // abashiri-city is EN-only; getDestination blocks it in JA but the
    // editorial-review path must still load it.
    const published = await getDestination("abashiri-city", "ja");
    expect(published).toBeNull();
    const editorial = await getDestinationForEditorialReview("abashiri-city");
    expect(editorial).not.toBeNull();
    expect(editorial?.id).toBe("abashiri-city");
  });
});
