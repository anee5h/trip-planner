/**
 * KAI-80: regression tests for the Allure privacy scanner's Playwright
 * trace-source exclusion.
 *
 * Proves:
 *  1. Playwright trace ZIP entries named `src@<40-hex>.txt` are NOT
 *     treated as emails (the false positive that broke the a11y CI job).
 *  2. Real emails, JWT-shaped tokens, Supabase secrets and other
 *     sensitive patterns STILL fail (email detection is not weakened).
 *  3. The ZIP decompression path surfaces the same exclusion (a trace
 *     ZIP's decompressed text is scanned with the same rule).
 */
import { describe, it, expect } from "vitest";
import { scanText } from "../check-allure-privacy.mjs";

// A realistic Playwright trace-source filename: src@<40 hex>.txt
const TRACE_SRC = `src@${"a".repeat(40)}.txt`;
// Same shape but inside surrounding text (e.g. an index line).
const TRACE_SRC_IN_LINE = `--- ${TRACE_SRC} ---`;

describe("check-allure-privacy Playwright trace-source exclusion", () => {
  it("does NOT flag the exact Playwright src@<hex>.txt filename as an email", () => {
    expect(scanText(TRACE_SRC)).toEqual([]);
    expect(scanText(`--- ${TRACE_SRC} ---\nconsole.log("x")`)).toEqual([]);
  });

  it("still flags a real email address", () => {
    const findings = scanText("contact user.name+tag@example.com please");
    expect(findings.some((f) => f.startsWith("email"))).toBe(true);
  });

  it("still flags a JWT-shaped token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0." +
      "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const findings = scanText(`token=${jwt}`);
    expect(findings.some((f) => f.startsWith("JWT"))).toBe(true);
  });

  it("still flags a supabase service-role key", () => {
    const svc =
      `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwic3ViIjoi${"a".repeat(20)}"}.` +
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const findings = scanText(`key=${svc}`);
    expect(findings.some((f) => f.startsWith("supabase-service-role"))).toBe(
      true,
    );
  });

  it("still flags a supabase project URL", () => {
    const findings = scanText("https://abcdefghijklm.supabase.co");
    expect(findings.some((f) => f.startsWith("supabase-url"))).toBe(true);
  });

  it("still flags an api-key-shaped secret", () => {
    const findings = scanText(`token=sk${"A".repeat(24)}`);
    expect(findings.some((f) => f.startsWith("api-key-ish"))).toBe(true);
  });

  it("still flags a private key block", () => {
    const findings = scanText(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
    );
    expect(findings.some((f) => f.startsWith("private-key-block"))).toBe(true);
  });

  it("still flags authorization headers", () => {
    const findings = scanText("Authorization: Bearer abcdefghijklmnop");
    expect(findings.some((f) => f.startsWith("authorization-header"))).toBe(
      true,
    );
  });

  it("still flags set-cookie headers", () => {
    const findings = scanText("set-cookie: session=abc123");
    expect(findings.some((f) => f.startsWith("set-cookie"))).toBe(true);
  });

  it("still flags a real email even when a trace src filename is nearby", () => {
    // A trace listing must not mask a genuinely sensitive adjacent line.
    const text = `${TRACE_SRC_IN_LINE}\nuser@example.com`;
    const findings = scanText(text);
    expect(findings.some((f) => f.startsWith("email"))).toBe(true);
  });

  it("allowlists the documented KAI-80 auth-fixture identity", () => {
    // a11y-fixture@example.com is the synthetic non-production test user
    // (see e2e/kai-80-a11y.spec.ts signInAsTestUser) — not a real person.
    const findings = scanText("email=a11y-fixture@example.com");
    expect(findings.some((f) => f.startsWith("email"))).toBe(false);
  });

  it("fails closed on a near-miss src@ name with the wrong hex length", () => {
    // 39 hex chars — NOT the trusted 40-hex shape. The scanner must not
    // recognize it as a Playwright source filename, so the email-like
    // pattern is surfaced (fail closed on unknown shapes).
    const findings = scanText(`src@${"b".repeat(39)}.txt`);
    expect(findings.some((f) => f.startsWith("email"))).toBe(true);
  });
});
