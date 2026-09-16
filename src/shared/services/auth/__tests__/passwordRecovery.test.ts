import { describe, expect, it } from "vitest";
import {
  getPasswordRecoveryRedirectUrl,
  inspectRecoveryCallback,
  isPasswordRecoveryEvent,
  isPasswordRecoveryRoute,
} from "../passwordRecovery";

function locationFor(url: string): URL {
  return new URL(url);
}

describe("password recovery callback recognition", () => {
  it("recognizes an implicit-flow recovery callback", () => {
    const result = inspectRecoveryCallback(
      locationFor(
        "https://meguruto.example/ja/reset-password#access_token=redacted-access&refresh_token=redacted-refresh&type=recovery",
      ),
    );

    expect(result).toEqual({
      isRecovery: true,
      hasCredentials: true,
      errorCode: null,
    });
  });

  it("does not treat an ordinary session callback as recovery", () => {
    expect(
      inspectRecoveryCallback(
        locationFor(
          "https://meguruto.example/#access_token=ordinary&refresh_token=ordinary&token_type=bearer",
        ),
      ).isRecovery,
    ).toBe(false);
  });

  it("does not treat an OAuth code callback as recovery", () => {
    expect(
      inspectRecoveryCallback(
        locationFor("https://meguruto.example/?code=oauth-code"),
      ).isRecovery,
    ).toBe(false);
  });

  it("recognizes recovery errors without exposing callback details", () => {
    const result = inspectRecoveryCallback(
      locationFor(
        "https://meguruto.example/reset-password?type=recovery&error=access_denied&error_code=otp_expired&error_description=secret%20callback%20detail",
      ),
    );

    expect(result).toEqual({
      isRecovery: true,
      hasCredentials: false,
      errorCode: "otp_expired",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("recognizes Supabase recovery auth events separately from sign-in", () => {
    expect(isPasswordRecoveryEvent("PASSWORD_RECOVERY")).toBe(true);
    expect(isPasswordRecoveryEvent("SIGNED_IN")).toBe(false);
    expect(isPasswordRecoveryEvent("INITIAL_SESSION")).toBe(false);
  });
});

describe("getPasswordRecoveryRedirectUrl", () => {
  it("keeps the Japanese URL boundary and uses the dedicated route", () => {
    expect(
      getPasswordRecoveryRedirectUrl(
        locationFor("https://meguruto.example/ja/settings"),
      ),
    ).toBe("https://meguruto.example/ja/reset-password");
  });

  it("uses the English route for an ordinary URL", () => {
    expect(
      getPasswordRecoveryRedirectUrl(
        locationFor("https://meguruto.example/settings"),
      ),
    ).toBe("https://meguruto.example/reset-password");
  });
});

describe("password recovery shell boundary", () => {
  it("identifies only the dedicated reset route as recovery UI", () => {
    expect(isPasswordRecoveryRoute("/reset-password")).toBe(true);
    expect(isPasswordRecoveryRoute("/ja/reset-password")).toBe(true);
    expect(isPasswordRecoveryRoute("/")).toBe(false);
    expect(isPasswordRecoveryRoute("/settings")).toBe(false);
  });
});
