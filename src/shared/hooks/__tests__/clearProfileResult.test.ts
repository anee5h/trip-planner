import { describe, it, expect } from "vitest";
import { buildClearProfileResult } from "../clearProfileResult";

describe("buildClearProfileResult", () => {
  it("returns failed when not signed in", () => {
    const r = buildClearProfileResult({
      signedIn: false,
      metadataCleared: false,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(r.status).toBe("failed");
    expect("message" in r && r.message).toBe("Not signed in");
  });

  it("returns failed when metadata clearing fails", () => {
    const r = buildClearProfileResult({
      signedIn: true,
      metadataCleared: false,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(r.status).toBe("failed");
  });

  it("returns partially_cleared when metadata clears but user_data deletion fails", () => {
    const r = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(r.status).toBe("partially_cleared");
    if (r.status === "partially_cleared") {
      expect(r.metadataCleared).toBe(true);
      expect(r.userDataDeleted).toBe(false);
    }
  });

  it("returns cleared_but_signout_failed when data clears but sign-out fails", () => {
    const r = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: true,
      signOutFailed: true,
    });
    expect(r.status).toBe("cleared_but_signout_failed");
  });

  it("returns cleared_and_signed_out on full success", () => {
    const r = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: true,
      signOutFailed: false,
    });
    expect(r.status).toBe("cleared_and_signed_out");
  });
});
