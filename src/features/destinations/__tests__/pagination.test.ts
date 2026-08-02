import { describe, expect, it } from "vitest";
import { getPaginationItems } from "../pagination";

describe("getPaginationItems", () => {
  it("shows the current page, two following pages, and the last page", () => {
    expect(getPaginationItems(1, 25)).toEqual([1, 2, 3, "ellipsis", 25]);
    expect(getPaginationItems(10, 25)).toEqual([10, 11, 12, "ellipsis", 25]);
    expect(getPaginationItems(23, 25)).toEqual([23, 24, 25]);
    expect(getPaginationItems(25, 25)).toEqual([25]);
  });
});
