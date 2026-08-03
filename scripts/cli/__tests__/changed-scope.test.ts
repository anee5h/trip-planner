import { describe, it, expect } from "vitest";
import { parseChangedFiles } from "../changed-scope";

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
