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
import { beforeAll, vi } from "vitest";
import fullIndex from "./src/shared/data/destinations-index.json";
import liteIndex from "./src/shared/data/destinations-index.lite.json";
import relationshipIndex from "./src/shared/data/destination-relationships.json";
const realFetch = globalThis.fetch.bind(globalThis);

vi.stubGlobal(
  "fetch",
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    // KAI-132: the lite index is fetched at runtime too — stub it with the
    // lite JSON (exact match, BEFORE the full-index substring check).
    if (url.endsWith("/data/destinations-index.lite.json")) {
      return Promise.resolve(
        new Response(JSON.stringify(liteIndex), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.endsWith("/data/destination-relationships.json")) {
      return Promise.resolve(
        new Response(JSON.stringify(relationshipIndex), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.endsWith("/data/destinations-index.json")) {
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

// KAI-132: load the lite catalogue once for ALL tests — the lite index is
// a runtime asset (no static import), so component tests that read
// summary data (via getDestinationList/getAvailablePlaces/collections/
// transport services) need the loader resolved before they render.
// Some test files stub fetch themselves (Supabase etc.) and would break
// this load; those tests don't need the lite catalogue (useTripSync now
// uses destinations-meta), so a failed preload is tolerated here.
import { loadLiteIndex } from "./src/shared/services/place/PlaceCatalog";
import { loadRelationshipIndex } from "./src/shared/services/destination/DestinationRelationshipService";
beforeAll(async () => {
  try {
    await loadLiteIndex();
  } catch {
    // tolerate — tests that need lite data load it in their own setup
  }
  try {
    await loadRelationshipIndex();
  } catch {
    // tolerate — relationship tests can load their own fixture
  }
});
