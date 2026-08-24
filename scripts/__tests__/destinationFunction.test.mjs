/**
 * KAI-198: destination Function failure-mode tests.
 */
import { describe, it, expect, vi } from "vitest";
import { createDestinationHandler } from "../../functions/_destination-handler.js";

const BASE = "https://example.com/destinations/tokyo-station-chiyoda";

describe("destination Function failure modes", () => {
  it("fails closed when the generated manifest is unavailable", async () => {
    const fetchAsset = vi.fn(
      async () => new Response("missing", { status: 404 }),
    );
    const handler = createDestinationHandler("en");
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
});
