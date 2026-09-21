/**
 * KAI-198: destination Function failure-mode tests.
 */
import { describe, it, expect, vi } from "vitest";

const BASE = "https://example.com/destinations/tokyo-station-chiyoda";

async function createHandler(locale) {
  vi.resetModules();
  const { createDestinationHandler } =
    await import("../../functions/_destination-handler.js");
  return createDestinationHandler(locale);
}

describe("destination Function failure modes", () => {
  it("fails closed when the generated manifest is unavailable", async () => {
    const fetchAsset = vi.fn(
      async () => new Response("missing", { status: 404 }),
    );
    const handler = await createHandler("en");
    const res = await handler({
      request: new Request(BASE),
      params: { id: "tokyo-station-chiyoda" },
      env: { ASSETS: { fetch: fetchAsset } },
    });

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect((await res.json()).error).toBe("destination_manifest_unavailable");
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("delivers a successful prerendered asset from one asset fetch", async () => {
    let destinationFetches = 0;
    const fetchAsset = vi.fn(async (request) => {
      if (request.endsWith("/data/kai68-public-destinations.json")) {
        return new Response(
          JSON.stringify([
            { id: "tokyo-station-chiyoda", status: "published" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      destinationFetches += 1;
      return new Response("<html><body>Tokyo Station</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    });
    const handler = await createHandler("en");
    const res = await handler({
      request: new Request(BASE),
      params: { id: "tokyo-station-chiyoda" },
      env: { ASSETS: { fetch: fetchAsset } },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Tokyo Station");
    expect(destinationFetches).toBe(1);
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a manifest destination has no prerendered asset", async () => {
    const fetchAsset = vi.fn(async (request) => {
      if (request.endsWith("/data/kai68-public-destinations.json")) {
        return new Response(
          JSON.stringify([
            { id: "tokyo-station-chiyoda", status: "published" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("missing", { status: 404 });
    });
    const handler = await createHandler("en");
    const res = await handler({
      request: new Request(BASE),
      params: { id: "tokyo-station-chiyoda" },
      env: { ASSETS: { fetch: fetchAsset } },
    });

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await res.text()).toContain("Destination Temporarily Unavailable");
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("localizes malformed Japanese destination IDs", async () => {
    const fetchAsset = vi.fn();
    const handler = await createHandler("ja");
    const res = await handler({
      request: new Request("https://example.com/ja/destinations/INVALID_ID"),
      params: { id: "INVALID_ID" },
      env: { ASSETS: { fetch: fetchAsset } },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(await res.text()).toContain("目的地が見つかりません");
    expect(fetchAsset).not.toHaveBeenCalled();
  });
});
