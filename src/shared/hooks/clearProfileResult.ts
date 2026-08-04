/**
 * Result of clearProfileData. A boolean success is ambiguous because the
 * operation spans three destructive steps (Auth metadata, user_data row,
 * sign-out) that can partially complete.
 */
export type ClearProfileResult =
  | { status: "cleared_and_signed_out" }
  | { status: "cleared_but_signout_failed"; message: string }
  | {
      status: "partially_cleared";
      metadataCleared: boolean;
      userDataDeleted: boolean;
      message: string;
    }
  | { status: "failed"; message: string };

/**
 * Pure state transition for the clear-profile operation. Exported so the
 * business logic is unit-testable without rendering the hook or mocking
 * Supabase.
 */
export function buildClearProfileResult(input: {
  signedIn: boolean;
  metadataCleared: boolean;
  userDataDeleted: boolean;
  signOutFailed: boolean;
}): ClearProfileResult {
  if (!input.signedIn) {
    return { status: "failed", message: "Not signed in" };
  }
  if (!input.metadataCleared) {
    return {
      status: "failed",
      message: "Failed to clear profile metadata. Please try again.",
    };
  }
  if (!input.userDataDeleted) {
    return {
      status: "partially_cleared",
      metadataCleared: true,
      userDataDeleted: false,
      message:
        "Profile metadata was cleared, but the saved profile data could not be deleted. Retry to complete the operation.",
    };
  }
  if (input.signOutFailed) {
    return {
      status: "cleared_but_signout_failed",
      message:
        "Profile data was cleared, but automatic sign-out failed. Please sign out manually.",
    };
  }
  return { status: "cleared_and_signed_out" };
}
