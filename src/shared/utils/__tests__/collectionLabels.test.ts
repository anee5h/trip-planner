import { describe, expect, it } from "vitest";
import { getCollections } from "@/shared/data/collections";
import {
  COLLECTION_CATEGORY_LABELS,
  getCollectionAuthorityLabel,
  getCollectionCategoryLabel,
  getCollectionTypeLabel,
  validateCollectionCategoryCoverage,
} from "../collectionLabels";

describe("collection display localization", () => {
  it("covers every known collection taxonomy category in both locales", () => {
    const categories = getCollections().map(
      (collection) => collection.category,
    );
    expect(validateCollectionCategoryCoverage(categories)).toEqual([]);
    expect(Object.keys(COLLECTION_CATEGORY_LABELS).sort()).toEqual(
      [...new Set(categories)].sort(),
    );
  });

  it("renders collection taxonomy and type labels in Japanese", () => {
    expect(getCollectionCategoryLabel("Architecture & History", "ja")).toBe(
      "建築・歴史",
    );
    expect(getCollectionCategoryLabel("World Heritage", "ja")).toBe("世界遺産");
    expect(getCollectionCategoryLabel("Nature & Parks", "ja")).toBe(
      "自然・公園",
    );
    expect(getCollectionTypeLabel("official", "ja")).toBe("公式コレクション");
    expect(getCollectionAuthorityLabel("international", "ja")).toBe("国際機関");
  });

  it("preserves English collection labels exactly", () => {
    expect(getCollectionCategoryLabel("World Heritage", "en")).toBe(
      "World Heritage",
    );
    expect(getCollectionTypeLabel("official", "en")).toBe("Official");
  });

  it("rejects a newly introduced category without Japanese coverage", () => {
    expect(validateCollectionCategoryCoverage(["Future Category"])).toEqual([
      "Future Category",
    ]);
  });
});
