import { describe, expect, it } from "vitest";
import { resolveChildCount } from "../tripComposition";

describe("resolveChildCount", () => {
  it("accepts only a safe child count within the live party", () => {
    expect(resolveChildCount({ partySize: 3, childCount: 1 })).toBe(1);
    expect(resolveChildCount({ partySize: 3, childCount: 0 })).toBe(0);
    expect(resolveChildCount({ partySize: 3 })).toBeUndefined();
    expect(resolveChildCount({ partySize: 3, childCount: 4 })).toBeUndefined();
    expect(resolveChildCount({ partySize: 0, childCount: 0 })).toBeUndefined();
    expect(
      resolveChildCount({ partySize: 3, childCount: 1.5 }),
    ).toBeUndefined();
  });
});
