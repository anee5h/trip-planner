/**
 * KAI-291B1 — content hash and canonical serialization tests.
 *
 * SHA-256 is verified against the published FIPS 180-4 vectors so the
 * content-addressing claim is proven, not assumed.
 */
import { describe, expect, it } from "vitest";

import { sha256Hex, stableStringify } from "../contentHash";

describe("stableStringify", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}',
    );
    expect(stableStringify({ route: [3, 1, 2] })).toBe('{"route":[3,1,2]}');
  });

  it("is insertion-order independent for objects", () => {
    const first = stableStringify({ x: 1, y: { m: 1, n: 2 }, z: [1] });
    const second = stableStringify({ z: [1], y: { n: 2, m: 1 }, x: 1 });
    expect(second).toBe(first);
  });
});

describe("sha256Hex", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("handles multibyte (non-ASCII title) input deterministically", () => {
    const first = sha256Hex("新宿駅");
    expect(first).toHaveLength(64);
    expect(sha256Hex("新宿駅")).toBe(first);
    expect(sha256Hex("新宿駅")).not.toBe(sha256Hex("新宿"));
  });
});
