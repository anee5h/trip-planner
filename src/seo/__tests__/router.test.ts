import { describe, expect, it } from "vitest";
import {
  isValidDestinationId,
  routeDestinationRequest,
  type AssetFetcher,
  type DestinationManifestEntry,
} from "@/seo/router";

const MANIFEST: DestinationManifestEntry[] = [
  { id: "tokyo-station-chiyoda", status: "published" },
  { id: "abashiri-city", status: "published" },
  { id: "beta-place", status: "beta" },
  { id: "verified-place", status: "verified" },
];

function okAsset(path: string): AssetFetcher {
  return async (p: string) => {
    if (p === path)
      return new Response(`<html>${path}</html>`, { status: 200 });
    return new Response("missing", { status: 404 });
  };
}

describe("KAI-68 router: published destination", () => {
  it("serves the prerendered HTML asset", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      fetchAsset: okAsset("/destinations/tokyo-station-chiyoda/index.html"),
    });
    expect(result.status).toBe(200);
    expect(result.assetPath).toBe(
      "/destinations/tokyo-station-chiyoda/index.html",
    );
    expect(result.body).toBeUndefined();
  });

  it("falls back to the SPA shell if the prerendered asset is missing", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      fetchAsset: okAsset("/index.html"),
    });
    expect(result.status).toBe(200);
    expect(result.assetPath).toBe("/index.html");
  });
});

describe("KAI-97 router: every canonical destination is indexable", () => {
  it.each([
    ["tokyo-station-chiyoda", "published"],
    ["beta-place", "beta"],
    ["verified-place", "verified"],
  ])(
    "serves the prerendered HTML asset for %s regardless of quality status",
    async (id) => {
      const result = await routeDestinationRequest({
        id,
        manifest: MANIFEST,
        fetchAsset: okAsset(`/destinations/${id}/index.html`),
      });
      expect(result.status).toBe(200);
      expect(result.assetPath).toBe(`/destinations/${id}/index.html`);
      // KAI-97: status is a quality signal, never an indexability gate —
      // no noindex directive for any canonical destination.
      expect(result.headers).toEqual({});
    },
  );

  it("does NOT noindex published destinations (prerendered or shell-fallback)", async () => {
    const prerendered = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      fetchAsset: okAsset("/destinations/tokyo-station-chiyoda/index.html"),
    });
    expect(prerendered.status).toBe(200);
    expect(prerendered.headers).toEqual({});

    const fallback = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      fetchAsset: okAsset("/index.html"),
    });
    expect(fallback.status).toBe(200);
    expect(fallback.headers).toEqual({});
  });
});

describe("KAI-68 router: invalid/removed destination", () => {
  it("returns 404 with noindex for unknown ids", async () => {
    const result = await routeDestinationRequest({
      id: "no-such-destination",
      manifest: MANIFEST,
      fetchAsset: async () => new Response(null, { status: 404 }),
    });
    expect(result.status).toBe(404);
    expect(result.headers?.["X-Robots-Tag"]).toBe("noindex, follow");
    expect(result.body).toContain("noindex");
    // Never resolves to the generic SPA page.
    expect(result.assetPath).toBeUndefined();
  });

  it("returns 404 with noindex for removed/formerly-published ids", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: [{ id: "other", status: "published" }],
      fetchAsset: async () => new Response(null, { status: 404 }),
    });
    expect(result.status).toBe(404);
    expect(result.headers?.["X-Robots-Tag"]).toBe("noindex, follow");
  });

  it("rejects malformed id path segments", () => {
    expect(isValidDestinationId("tokyo-station-chiyoda")).toBe(true);
    expect(isValidDestinationId("abeno-harukas-300-osaka")).toBe(true);
    expect(isValidDestinationId("../etc-passwd")).toBe(false);
    expect(isValidDestinationId("UPPER")).toBe(false);
    expect(isValidDestinationId("with space")).toBe(false);
    expect(isValidDestinationId("")).toBe(false);
    expect(isValidDestinationId("a".repeat(129))).toBe(false);
  });
});

describe("KAI-101 router: Japanese locale (/ja/destinations/:id)", () => {
  it("serves the JA prerendered HTML asset for published destinations", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      locale: "ja",
      fetchAsset: okAsset("/ja/destinations/tokyo-station-chiyoda/index.html"),
    });
    expect(result.status).toBe(200);
    expect(result.assetPath).toBe(
      "/ja/destinations/tokyo-station-chiyoda/index.html",
    );
    expect(result.headers).toEqual({});
  });

  it("falls back to the /ja SPA shell if the JA prerendered asset is missing", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      locale: "ja",
      fetchAsset: okAsset("/ja/index.html"),
    });
    expect(result.status).toBe(200);
    expect(result.assetPath).toBe("/ja/index.html");
  });

  it("serves the JA prerendered HTML asset for non-published destinations", async () => {
    const result = await routeDestinationRequest({
      id: "beta-place",
      manifest: MANIFEST,
      locale: "ja",
      fetchAsset: okAsset("/ja/destinations/beta-place/index.html"),
    });
    expect(result.status).toBe(200);
    expect(result.assetPath).toBe("/ja/destinations/beta-place/index.html");
    // KAI-97: no noindex for any canonical destination.
    expect(result.headers).toEqual({});
  });

  it("404s unknown ids under /ja with noindex", async () => {
    const result = await routeDestinationRequest({
      id: "no-such-destination",
      manifest: MANIFEST,
      locale: "ja",
      fetchAsset: async () => new Response(null, { status: 404 }),
    });
    expect(result.status).toBe(404);
    expect(result.headers?.["X-Robots-Tag"]).toBe("noindex, follow");
  });

  it("keeps the EN default when no locale is given", async () => {
    const result = await routeDestinationRequest({
      id: "tokyo-station-chiyoda",
      manifest: MANIFEST,
      fetchAsset: okAsset("/destinations/tokyo-station-chiyoda/index.html"),
    });
    expect(result.assetPath).toBe(
      "/destinations/tokyo-station-chiyoda/index.html",
    );
  });
});
