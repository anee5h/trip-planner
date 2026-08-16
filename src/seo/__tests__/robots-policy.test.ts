import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { renderSitemap } from "@/seo/prerender";
import { loadPrerenderDestinations } from "@/seo/prerender";

/**
 * KAI-68 private-route indexing policy (review pass):
 *   - private/personalized surfaces must not be indexable;
 *   - exclusion mechanism is sitemap omission + HTTP `X-Robots-Tag: noindex`
 *     (public/_headers) — NOT robots.txt Disallow, which would prevent
 *     crawlers from even seeing the noindex directive. robots.txt is not an
 *     auth/security boundary.
 */

const ROOT = path.resolve(__dirname, "../../..");

const PRIVATE_ROUTES = [
  "/settings",
  "/my-trips",
  "/bucket-list",
  "/passport",
  "/profile",
  "/favorites",
  "/visited-map",
  "/qa",
  "/editorial",
  "/compare",
];

describe("KAI-68 private-route indexing policy", () => {
  it("sitemap never contains private routes", () => {
    const sitemap = renderSitemap(loadPrerenderDestinations());
    for (const route of PRIVATE_ROUTES) {
      expect(sitemap, route).not.toContain(route);
    }
  });

  it("robots.txt does not Disallow private routes (crawlers must reach the noindex directive)", () => {
    const robots = fs.readFileSync(
      path.join(ROOT, "public/robots.txt"),
      "utf8",
    );
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://meguruto.app/sitemap.xml");
    for (const route of PRIVATE_ROUTES) {
      expect(robots, route).not.toContain(`Disallow: ${route}`);
    }
  });

  it("public/_headers applies X-Robots-Tag: noindex to every private route", () => {
    const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
    const blocks = headers.split(/\n(?=\/)/);
    for (const route of PRIVATE_ROUTES) {
      const block = blocks.find((b) => b.startsWith(route));
      expect(block, route).toBeDefined();
      expect(block, route).toContain("X-Robots-Tag: noindex");
    }
    // Public discovery surfaces must NOT be blanket-noindexed.
    expect(headers).not.toContain("\n/destinations\n");
    expect(headers).not.toContain("\n/\n");
  });
});
