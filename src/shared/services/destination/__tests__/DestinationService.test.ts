import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDestination,
  getDestinationForEditorialReview,
} from "../DestinationService";
import { loadDestinationsIndex } from "@/shared/services/place/PlaceCatalog";
import fullIndex from "@/shared/data/destinations-index.json";

describe("getDestination locale availability", () => {
  beforeEach(async () => {
    // Preload the full catalogue so the index fallback has real data
    // (KAI-121: the per-destination fetch failing falls back to the FULL
    // index, never to the lite summary).
    await loadDestinationsIndex();
    // Force the in-memory index fallback path: reject only the per-
    // destination detail fetch; the destinations-index fetch must still
    // resolve (replicating vitest.setup.ts after the stub replaces it).
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/data/destinations/")) {
          return Promise.reject(new Error("no network in tests"));
        }
        if (url.includes("destinations-index.json")) {
          return Promise.resolve(
            new Response(JSON.stringify(fullIndex), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
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
