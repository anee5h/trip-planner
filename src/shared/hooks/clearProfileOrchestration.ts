import type { SupabaseClient, User, AuthError } from "@supabase/supabase-js";
import {
  buildClearProfileResult,
  type ClearProfileResult,
} from "./clearProfileResult";

export interface ClearProfileDependencies {
  user: User | null;
  client: SupabaseClient | null;
  signOut: () => Promise<{ error: AuthError | null }>;
  onUserUpdated: (user: User) => void;
  profileMetadataFields: readonly string[];
}

export async function executeClearProfile(
  deps: ClearProfileDependencies,
): Promise<ClearProfileResult> {
  const { user, client, signOut, onUserUpdated, profileMetadataFields } = deps;

  const signedIn = Boolean(user && client);
  let metadataCleared = false;
  let userDataDeleted = false;

  if (signedIn && client && user) {
    const metadata: Record<string, null> = {};
    for (const field of profileMetadataFields) {
      metadata[field] = null;
    }
    const metaResult = await client.auth.updateUser({ data: metadata });
    if (metaResult.error) {
      console.error("Failed to clear profile metadata", metaResult.error);
    } else {
      metadataCleared = true;
      if (metaResult.data.user) onUserUpdated(metaResult.data.user);
    }

    if (metadataCleared) {
      const { error } = await client
        .from("user_data")
        .delete()
        .eq("id", user.id);
      if (error) {
        console.error("Failed to clear user profile data", error);
      } else {
        userDataDeleted = true;
      }
    }
  }

  let signOutFailed = false;
  if (metadataCleared && userDataDeleted) {
    const signOutResult = await signOut();
    signOutFailed = Boolean(signOutResult?.error);
  }

  return buildClearProfileResult({
    signedIn,
    metadataCleared,
    userDataDeleted,
    signOutFailed,
  });
}
