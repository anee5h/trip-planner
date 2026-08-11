import { describe, expect, it } from "vitest";
import { getJwtTimingMetadata } from "../jwtTiming";

function encodePart(value: unknown): string {
  return btoa(JSON.stringify(value));
}

function makeToken(payload: Record<string, unknown>): string {
  return `${encodePart({ alg: "HS256", typ: "JWT" })}.${encodePart(payload)}.sig`;
}

const NOW_MS = 1_800_000_000_000; // fixed wall clock for determinism
const NOW_SEC = NOW_MS / 1000;

describe("getJwtTimingMetadata", () => {
  it("returns null for empty or missing tokens", () => {
    expect(getJwtTimingMetadata(null, NOW_MS)).toBeNull();
    expect(getJwtTimingMetadata(undefined, NOW_MS)).toBeNull();
    expect(getJwtTimingMetadata("", NOW_MS)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    expect(getJwtTimingMetadata("not-a-jwt", NOW_MS)).toBeNull();
    expect(getJwtTimingMetadata("a.b", NOW_MS)).toBeNull();
    expect(getJwtTimingMetadata("a.b.c.d", NOW_MS)).toBeNull();
    expect(getJwtTimingMetadata("a.%%%%.c", NOW_MS)).toBeNull();
    expect(
      getJwtTimingMetadata(`${encodePart({})}.not-json.sig`, NOW_MS),
    ).toBeNull();
    expect(
      getJwtTimingMetadata(`${encodePart({})}."quoted".sig`, NOW_MS),
    ).toBeNull();
    expect(
      getJwtTimingMetadata(`${encodePart({})}.[1,2].sig`, NOW_MS),
    ).toBeNull();
  });

  it("reports a token issued in the future", () => {
    const iat = NOW_SEC + 120;
    const metadata = getJwtTimingMetadata(
      makeToken({ iat, exp: iat + 3600 }),
      NOW_MS,
    );
    expect(metadata).not.toBeNull();
    expect(metadata!.iat).toBe(iat);
    expect(metadata!.issuedInFutureBySeconds).toBeCloseTo(120);
    expect(metadata!.expiresInSeconds).toBeCloseTo(3720);
  });

  it("reports a token issued in the past", () => {
    const iat = NOW_SEC - 30;
    const metadata = getJwtTimingMetadata(makeToken({ iat }), NOW_MS);
    expect(metadata!.issuedInFutureBySeconds).toBeCloseTo(-30);
  });

  it("reports an expired token", () => {
    const exp = NOW_SEC - 60;
    const metadata = getJwtTimingMetadata(makeToken({ exp }), NOW_MS);
    expect(metadata!.expiresInSeconds).toBeCloseTo(-60);
  });

  it("reports nbf when present", () => {
    const nbf = NOW_SEC + 5;
    const metadata = getJwtTimingMetadata(makeToken({ nbf }), NOW_MS);
    expect(metadata!.nbf).toBe(nbf);
  });

  it("omits missing claims and ignores non-numeric claims", () => {
    const metadata = getJwtTimingMetadata(
      makeToken({ iat: "not-a-number", exp: null }),
      NOW_MS,
    );
    expect(metadata!.iat).toBeUndefined();
    expect(metadata!.exp).toBeUndefined();
    expect(metadata!.issuedInFutureBySeconds).toBeUndefined();
    expect(metadata!.expiresInSeconds).toBeUndefined();
    expect(metadata!.now).toBe(NOW_SEC);
  });

  it("tolerates base64url alphabet and padding", () => {
    // payload with '-'/'_' characters after encoding requires base64url decode
    const payload = { iat: NOW_SEC - 5 };
    const json = JSON.stringify(payload);
    const encoded = btoa(json).replace(/\+/g, "-").replace(/\//g, "_");
    const token = `${encodePart({})}.${encoded.replace(/=+$/, "")}.sig`;
    const metadata = getJwtTimingMetadata(token, NOW_MS);
    expect(metadata!.iat).toBe(NOW_SEC - 5);
  });

  it("never exposes the token itself in the result", () => {
    const token = makeToken({ iat: NOW_SEC + 10 });
    const metadata = getJwtTimingMetadata(token, NOW_MS);
    expect(JSON.stringify(metadata)).not.toContain("sig");
    expect(JSON.stringify(metadata)).not.toContain(token);
  });
});
