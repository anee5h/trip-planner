// KAI-147: verify visited-prefectures derivation still completes after the
// lazy meta chunk resolves (jsdom: dynamic import of JSON works via Vite).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { formatPrefectureId } from "@/shared/hooks/useTripStore";
import { loadDestinationsMeta } from "@/shared/data/destinationsMetaLoader";

describe("KAI-147 destinations-meta lazy loader", () => {
  it("resolves the full 1021-entry meta index at runtime", async () => {
    const meta = await loadDestinationsMeta();
    expect(Array.isArray(meta)).toBe(true);
    expect(meta.length).toBe(1021);
    const sample = meta.find((d) => d.id === "abashiri-city");
    expect(sample?.prefecture).toBe("Hokkaido");
  });

  it("shares a single promise across concurrent callers", async () => {
    const [a, b] = [loadDestinationsMeta(), loadDestinationsMeta()];
    expect(await a).toBe(await b);
  });

  it("formatPrefectureId keeps the map-key contract", () => {
    expect(formatPrefectureId("Hokkaido")).toBe("Hokkaido\x8D");
    expect(formatPrefectureId("Tokyo")).toBe("Tokyo");
  });
});
