import { describe, it, expect } from "vitest";
import { buildClearProfileResult } from "../clearProfileResult";

describe("clearProfileData Orchestration & Status Mapping", () => {
  it("builds cleared_and_signed_out result when both operations and signout succeed", () => {
    const result = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: true,
      signOutFailed: false,
    });
    expect(result.status).toBe("cleared_and_signed_out");
  });

  it("builds cleared_but_signout_failed result when profile cleared but signout throws", () => {
    const result = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: true,
      signOutFailed: true,
    });
    expect(result.status).toBe("cleared_but_signout_failed");
    if (result.status === "cleared_but_signout_failed") {
      expect(result.message).toContain("automatic sign-out failed");
    }
  });

  it("builds partially_cleared result when metadata cleared but user_data row deletion fails", () => {
    const result = buildClearProfileResult({
      signedIn: true,
      metadataCleared: true,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(result.status).toBe("partially_cleared");
    if (result.status === "partially_cleared") {
      expect(result.message).toContain("Profile metadata was cleared");
    }
  });

  it("builds failed result when metadata clearing fails", () => {
    const result = buildClearProfileResult({
      signedIn: true,
      metadataCleared: false,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.message).toContain("Failed to clear profile metadata");
    }
  });

  it("builds failed result when user is not signed in", () => {
    const result = buildClearProfileResult({
      signedIn: false,
      metadataCleared: false,
      userDataDeleted: false,
      signOutFailed: false,
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.message).toBe("Not signed in");
    }
  });
});
