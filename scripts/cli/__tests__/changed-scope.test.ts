import { describe, it, expect } from "vitest";
import {
  parseChangedFiles,
  parseChangedImageDiff,
  parseCatalogueScope,
} from "../changed-scope";

describe("parseChangedFiles", () => {
  it("returns empty scope for no changes", () => {
    const r = parseChangedFiles("");
    expect(r.changedDestinationIds.size).toBe(0);
    expect(r.indexChanged).toBe(false);
  });

  it("parses destination per-record files correctly", () => {
    const raw = [
      "public/data/destinations/byodoin-temple.json",
      "public/data/destinations/koko-en-garden.json",
      "public/data/destinations/uji-tea-culture-center.json",
      "README.md",
    ].join("\n");
    const r = parseChangedFiles(raw);
    expect(r.changedDestinationIds.size).toBe(3);
    expect(r.changedDestinationIds.has("byodoin-temple")).toBe(true);
    expect(r.changedDestinationIds.has("koko-en-garden")).toBe(true);
    expect(r.changedDestinationIds.has("uji-tea-culture-center")).toBe(true);
    expect(r.indexChanged).toBe(false);
  });

  it("flags index changes and includes them in the destination set", () => {
    const raw = [
      "src/shared/data/destinations-index.json",
      "public/data/destinations/kataonami-beach-wakanoura.json",
    ].join("\n");
    const r = parseChangedFiles(raw);
    expect(r.indexChanged).toBe(true);
    expect(r.changedDestinationIds.size).toBe(1);
    expect(r.changedDestinationIds.has("kataonami-beach-wakanoura")).toBe(true);
  });

  it("ignores non-destination JSON files outside the destinations dir", () => {
    const raw = [
      "public/data/collections-index.json",
      "src/shared/data/collections-index.json",
      ".github/workflows/validate.yml",
    ].join("\n");
    const r = parseChangedFiles(raw);
    expect(r.changedDestinationIds.size).toBe(0);
    expect(r.indexChanged).toBe(false);
  });

  it("ignores non-JSON files inside the destinations dir", () => {
    const raw = [
      "public/data/destinations/broken.txt",
      "public/data/destinations/README.md",
      "public/data/destinations/byodoin-temple.json",
    ].join("\n");
    const r = parseChangedFiles(raw);
    expect(r.changedDestinationIds.size).toBe(1);
    expect(r.changedDestinationIds.has("byodoin-temple")).toBe(true);
  });

  it("handles trailing newline and surrounding whitespace", () => {
    const raw =
      "\n  public/data/destinations/uji-tea-culture-center.json  \n  \n";
    const r = parseChangedFiles(raw);
    expect(r.changedDestinationIds.size).toBe(1);
    expect(r.changedDestinationIds.has("uji-tea-culture-center")).toBe(true);
  });
});

describe("parseChangedImageDiff", () => {
  it("scopes only detail files whose image fields changed", () => {
    const raw = [
      "diff --git a/public/data/destinations/alpha.json b/public/data/destinations/alpha.json",
      "@@ -1 +1 @@",
      '+  "heroImage": "https://example.com/new.jpg",',
      "diff --git a/public/data/destinations/beta.json b/public/data/destinations/beta.json",
      "@@ -1 +1 @@",
      '+  "budgetMin": 1000,',
      "diff --git a/public/data/destinations/gamma.json b/public/data/destinations/gamma.json",
      "@@ -1 +1 @@",
      '-  "image": "https://example.com/old.jpg",',
    ].join("\n");

    expect(parseChangedImageDiff(raw)).toEqual(new Set(["alpha", "gamma"]));
  });
});

describe("parseCatalogueScope", () => {
  it("flags every path class that can affect catalogue integrity", () => {
    const relevant = [
      // canonical catalogue source data
      "src/shared/data/destinations-index.json",
      "src/shared/data/destinations-meta.json",
      "src/shared/data/collections-index.json",
      // transport registries
      "src/shared/data/airports.json",
      "src/shared/data/airport-zones.json",
      "src/shared/data/flight-estimates.json",
      "src/shared/data/ferry-estimates.json",
      "src/shared/data/ferry-routes.json",
      "src/shared/data/transport-topology.json",
      "src/shared/data/ground-routes.json",
      // generated destination files
      "public/data/destinations/kurashiki-city.json",
      "public/data/stations.json",
      // generation and synchronization scripts
      "scripts/sync-destination-details.ts",
      "scripts/catalog/generate-outputs.ts",
      "scripts/catalog/meta.mjs",
      "scripts/pipeline.cjs",
      // integrity-audit code
      "scripts/audit/catalog-integrity.ts",
      "scripts/audit/catalog-baseline.ts",
      "scripts/audit-catalog-integrity.ts",
      "scripts/check-catalog-warnings.ts",
      "scripts/check-catalog-sync.ts",
      "scripts/check-catalog-ci.ts",
      "scripts/catalog-corrections-manifest.json",
      // schemas and validators used by catalogue data
      "src/shared/types/destination.ts",
      "scripts/validators/relationships.ts",
      "scripts/cli/validate-destinations.ts",
      // package scripts and workflow files controlling the checks
      "package.json",
      "package-lock.json",
      ".github/workflows/catalogue-integrity.yml",
      ".github/workflows/pr-checks.yml",
    ];
    const r = parseCatalogueScope(relevant.join("\n"));
    expect(r.relevant).toBe(true);
    expect(r.relevantFiles).toEqual(relevant);
  });

  it("treats a package-lock.json-only change as catalogue-affecting", () => {
    // A lockfile-only change alters what `npm ci` installs and can therefore
    // change audit/generation behaviour.
    const r = parseCatalogueScope("package-lock.json");
    expect(r.relevant).toBe(true);
    expect(r.relevantFiles).toEqual(["package-lock.json"]);
  });

  it("ignores app code, docs, and unrelated config", () => {
    const irrelevant = [
      "README.md",
      "docs/EDITORIAL_WORKFLOW.md",
      "src/components/App.tsx",
      "src/features/home/components/HomeMatchCard.tsx",
      "src/shared/services/transport/estimates.ts",
      "vite.config.ts",
      "tailwind.config.js",
      "index.html",
      ".github/ISSUE_TEMPLATE.md",
      "src/shared/utils/placeLabels.ts",
    ];
    const r = parseCatalogueScope(irrelevant.join("\n"));
    expect(r.relevant).toBe(false);
    expect(r.relevantFiles).toEqual([]);
  });

  it("returns an empty scope for no changes", () => {
    const r = parseCatalogueScope("");
    expect(r.relevant).toBe(false);
    expect(r.changedFiles).toEqual([]);
  });

  it("treats Windows-style separators as catalogue paths", () => {
    const r = parseCatalogueScope("src\\shared\\data\\flight-estimates.json");
    expect(r.relevant).toBe(true);
  });

  it("keeps non-catalogue files out of relevantFiles but visible as changed", () => {
    const r = parseCatalogueScope(
      ["README.md", "src/shared/data/airports.json"].join("\n"),
    );
    expect(r.relevant).toBe(true);
    expect(r.relevantFiles).toEqual(["src/shared/data/airports.json"]);
    expect(r.changedFiles).toContain("README.md");
  });
});
