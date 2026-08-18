/**
 * KAI-121 vitest setup: stub fetch for the lazily-fetched destinations
 * index asset.
 *
 * In the browser, loadDestinationsIndex() fetches the static asset
 * /data/destinations-index.json (copied to public/data at build time).
 * jsdom has no static server, so tests stub fetch: any request whose URL
 * ends with "destinations-index.json" resolves to the imported JSON
 * module. This mirrors the browser contract (a real fetch returning the
 * JSON) without a network dependency.
 */
import { vi } from "vitest";
import fullIndex from "./src/shared/data/destinations-index.json";

const realFetch = globalThis.fetch.bind(globalThis);

vi.stubGlobal(
  "fetch",
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("destinations-index.json")) {
      return Promise.resolve(
        new Response(JSON.stringify(fullIndex), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return realFetch(input, init);
  },
);
