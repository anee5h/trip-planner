import { describe, expect, it } from "vitest";
import {
  detectDuplicateKeys,
  duplicateKeysValidator,
} from "@/../scripts/validators/duplicate-keys";
import type { ValidationContext } from "@/../scripts/validators/types";

function makeContext(): ValidationContext {
  return {
    catalog: { destinations: [], collections: [] },
    config: {
      hubCollectionBlacklist: [],
      budgetTolerancePercent: 0,
      budgetMinToleranceYen: 0,
      httpTimeoutMs: 1000,
      maxWarningThreshold: 0,
      allowedImageMimeTypes: [],
    },
  };
}

describe("detectDuplicateKeys", () => {
  it("detects a duplicate key in an object", () => {
    const json = `{ "id": "a", "transportZoneId": "x", "transportZoneId": "y" }`;
    const findings = detectDuplicateKeys(json);
    expect(findings).toContainEqual(
      expect.objectContaining({ key: "transportZoneId" }),
    );
  });

  it("ignores duplicate values in arrays", () => {
    const json = `{ "tags": ["island", "island"], "nested": { "a": 1, "b": 2 } }`;
    expect(detectDuplicateKeys(json)).toEqual([]);
  });

  it("detects duplicates inside nested objects", () => {
    const json = `{ "content": { "en": { "name": "x", "name": "y" } } }`;
    const findings = detectDuplicateKeys(json);
    expect(findings).toContainEqual(expect.objectContaining({ key: "name" }));
  });

  it("passes a clean document", () => {
    const json = `{ "a": 1, "b": [1, 2, { "c": true }], "d": "text" }`;
    expect(detectDuplicateKeys(json)).toEqual([]);
  });

  it("does not confuse keys across sibling objects", () => {
    const json = `[{ "id": "a" }, { "id": "b" }]`;
    expect(detectDuplicateKeys(json)).toEqual([]);
  });
});

describe("duplicateKeysValidator", () => {
  it("passes on the real catalogue and detail files", async () => {
    const result = await duplicateKeysValidator.validate(makeContext());
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(result.metrics.totalChecked).toBeGreaterThan(1);
  });
});
