import { describe, expect, it } from "vitest";
import { APP_VERSION, formatAppVersion } from "./version";
import pkg from "../../../package.json";

describe("formatAppVersion", () => {
  it("renders the beta machine version as v2.0.0 Beta 1", () => {
    expect(formatAppVersion("2.0.0-beta.1")).toBe("v2.0.0 Beta 1");
  });

  it("does not double-prefix versions that already start with v", () => {
    expect(formatAppVersion("v1.2.3")).toBe("v1.2.3");
  });

  it("keeps stable versions as plain vX.Y.Z", () => {
    expect(formatAppVersion("2.0.0")).toBe("v2.0.0");
  });

  it("exposes the canonical package version", () => {
    expect(pkg.version).toBe("2.0.0-beta.1");
    expect(APP_VERSION).toBe("2.0.0-beta.1");
  });
});
