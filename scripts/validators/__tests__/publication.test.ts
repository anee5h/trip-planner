import { describe, expect, it } from "vitest";
import destinationsIndex from "../../../src/shared/data/destinations-index.json";
import {
  buildPrerenderOutputs,
  renderSitemap,
} from "../../../src/seo/prerender";
import type { Destination } from "../../../src/shared/types/destination";

/**
 * KAI-97: the canonical catalogue and every public/indexable surface must
 * converge — canonical == EN prerender set == JA prerender set == sitemap set.
 * `status` is a content-quality signal, not an indexability gate, so there
 * must be no silently excluded remainder. Counts are derived from the
 * catalogue, never hard-coded.
 */
const MINIMAL_SHELL = `<!doctype html>
<html lang="en">
  <head><title>shell</title></head>
  <body><div id="root"></div></body>
</html>`;

describe("KAI-97 catalogue publication parity", () => {
  const catalog = destinationsIndex as Destination[];
  const ids = catalog.map((d) => d.id).sort();

  it("every canonical destination is prerendered in both locales", () => {
    const outputs = buildPrerenderOutputs(MINIMAL_SHELL, catalog);
    for (const id of ids) {
      expect(outputs.has(`/destinations/${id}/index.html`), id).toBe(true);
      expect(outputs.has(`/ja/destinations/${id}/index.html`), id).toBe(true);
    }
    // Exactly: EN+JA pages + EN/JA homes + sitemap + manifest — no extras.
    expect(outputs.size).toBe(ids.length * 2 + 4);
  });

  it("sitemap covers exactly the canonical destination set", () => {
    const sitemap = renderSitemap(catalog);
    const destLocs = [
      ...sitemap.matchAll(
        /<loc>https:\/\/meguruto\.app\/destinations\/([^<]+)<\/loc>/g,
      ),
    ]
      .map((m) => m[1])
      .sort();
    expect(destLocs).toEqual(ids);
  });

  it("canonical, EN-public, JA-public, prerender-input and sitemap sets are identical", () => {
    const outputs = buildPrerenderOutputs(MINIMAL_SHELL, catalog);
    const enIds = [...outputs.keys()]
      .filter((k) => k.startsWith("/destinations/") && !k.startsWith("/ja/"))
      .map((k) => k.split("/")[2])
      .sort();
    const jaIds = [...outputs.keys()]
      .filter((k) => k.startsWith("/ja/destinations/"))
      .map((k) => k.split("/")[3])
      .sort();
    const sitemapIds = [
      ...renderSitemap(catalog).matchAll(/\/destinations\/([^<]+)<\/loc>/g),
    ]
      .map((m) => m[1])
      .sort();

    expect(enIds).toEqual(ids);
    expect(jaIds).toEqual(ids);
    expect(sitemapIds).toEqual(ids);
  });
});
