/**
 * KAI-81: regression tests for the secrets-in-bundle scanner.
 *
 * All fixtures are synthetic — never real credentials. They prove the
 * scanner catches every elevated Supabase/Resend form while allowing the
 * legitimate client-side credentials (sb_publishable_..., anon-role JWT).
 */
import { describe, it, expect } from "vitest";
import { findSecretViolations } from "../check-bundle-secrets.mjs";

// Synthetic elevated server keys (not real).
const FAKE_SB_SECRET = `sb_secret_${"A".repeat(32)}`;
const FAKE_SUPABASE_SECRET_ASSIGNMENT = `process.env.SUPABASE_SECRET_KEY = "${"B".repeat(24)}"`;
const FAKE_SERVICE_ROLE_ASSIGNMENT = `const SUPABASE_SERVICE_ROLE_KEY = "${"C".repeat(24)}";`;
const FAKE_RESEND = `re_${"1".repeat(24)}`;

/** Builds a JWT with the given role claim using dummy base64url sections. */
function fakeJwt(role) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "00000000-0000-0000-0000-000000000000",
      role,
      exp: 4102444800,
    }),
  ).toString("base64url");
  const signature = Buffer.from("fake-signature-bytes").toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const FAKE_SERVICE_ROLE_JWT = fakeJwt("service_role");
const FAKE_ANON_JWT = fakeJwt("anon");
const FAKE_PUBLISHABLE = `sb_publishable_${"D".repeat(32)}`;

describe("check-bundle-secrets", () => {
  it("catches sb_secret_... Supabase server keys", () => {
    const violations = findSecretViolations(
      `const supabase = createClient(url, "${FAKE_SB_SECRET}");`,
    );
    expect(violations).toContain("Supabase secret key (sb_secret_)");
  });

  it("catches SUPABASE_SECRET_KEY assignments", () => {
    expect(findSecretViolations(FAKE_SUPABASE_SECRET_ASSIGNMENT)).toContain(
      "Supabase secret key assignment",
    );
  });

  it("catches SUPABASE_SERVICE_ROLE_KEY assignments", () => {
    expect(findSecretViolations(FAKE_SERVICE_ROLE_ASSIGNMENT)).toContain(
      "generic long secret assignment",
    );
  });

  it("catches encoded service-role JWTs by decoding the payload", () => {
    const violations = findSecretViolations(
      `const jwt = "${FAKE_SERVICE_ROLE_JWT}";`,
    );
    expect(violations).toContain("Supabase service-role JWT (decoded payload)");
  });

  it("catches literal service_role claims", () => {
    const violations = findSecretViolations(
      'const claims = {"role":"service_role"};',
    );
    expect(violations).toContain("Supabase service-role JWT literal");
  });

  it("catches Resend API keys", () => {
    expect(findSecretViolations(`const resend = "${FAKE_RESEND}";`)).toContain(
      "Resend API key",
    );
  });

  it("allows sb_publishable_... client keys", () => {
    const violations = findSecretViolations(
      `const supabase = createClient(url, "${FAKE_PUBLISHABLE}");`,
    );
    expect(violations).toEqual([]);
  });

  it("allows anon-role JWTs (legitimate client credentials)", () => {
    const violations = findSecretViolations(`const jwt = "${FAKE_ANON_JWT}";`);
    expect(violations).toEqual([]);
  });

  it("allows benign bundle content", () => {
    const violations = findSecretViolations(
      'export const VERSION = "2.0.0-beta.2"; const api = "https://meguruto.app";',
    );
    expect(violations).toEqual([]);
  });

  it("allows non-JWT dotted strings (semver, hashed assets)", () => {
    const violations = findSecretViolations(
      'const a = "1.2.3"; const b = "index-97bbi2Ux.js"; const c = "a.b.c";',
    );
    expect(violations).toEqual([]);
  });
});
