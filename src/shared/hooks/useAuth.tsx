import { useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { User, Provider, AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { executeClearProfile } from "./clearProfileOrchestration";
import type { ClearProfileResult } from "./clearProfileResult";
import { reportAuthFailureIfOperational } from "@/shared/utils/errorReporter";
import { executePendingAccountDeletionIfRequested } from "@/shared/utils/pendingAccountDeletion";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";
import { discardPendingPersistenceIntent } from "@/shared/services/auth/PendingPersistenceIntent";
import {
  getPasswordRecoveryRedirectUrl,
  isPasswordRecoveryEvent,
} from "@/shared/services/auth/passwordRecovery";
import { AuthContext, type UserProfileUpdateData } from "./authContext";
export { AuthContext } from "./authContext";
export type {
  AuthContextType,
  OAuthResponse,
  UserPreferencesPayload,
  UserProfileUpdateData,
} from "./authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // OAuth providers return cancellation/failure in the URL. Discard a
    // pending signup intent before any auth event can mistake a later login
    // for a completed registration.
    if (typeof window !== "undefined") {
      const authError =
        new URLSearchParams(window.location.search).get("error") ||
        new URLSearchParams(window.location.hash.slice(1)).get("error");
      if (authError) {
        recommendationAnalytics.trackPendingSignupError("oauth_callback");
        discardPendingPersistenceIntent();
      }
    }

    const handleSession = (
      session: Session | null,
      passwordRecovery = false,
    ) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token && !passwordRecovery) {
        void executePendingAccountDeletionIfRequested();
        recommendationAnalytics.trackPendingSignupCompletion();
      }
    };

    // Register before bootstrapping the session so PASSWORD_RECOVERY cannot
    // race past the listener during the implicit callback exchange.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const recoveryEvent = isPasswordRecoveryEvent(event);
      if (recoveryEvent) {
        // A URL hint alone is never enough: the event must carry the active
        // Supabase recovery session that updateUser will use.
        setIsPasswordRecovery(Boolean(session?.user));
      } else if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
      handleSession(session, recoveryEvent);
    });

    // Get initial session. KAI-46: a failing session bootstrap is an
    // operational auth failure — report it (best-effort, feature auth).
    // KAI-44: a session arriving with a pending-deletion flag (OAuth
    // reauthentication redirect) completes the deletion.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        handleSession(data.session);
      })
      .catch((err) => {
        reportAuthFailureIfOperational(err, "session");
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () =>
    supabase?.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

  const signInWithTwitter = () =>
    supabase?.auth.signInWithOAuth({
      provider: "twitter",
      options: { redirectTo: window.location.origin },
    });

  const signInWithLine = () =>
    supabase?.auth.signInWithOAuth({
      provider: "line" as Provider,
      options: { redirectTo: window.location.origin },
    });

  const signInWithEmail = async (email: string, password: string) => {
    const result = await supabase!.auth.signInWithPassword({ email, password });
    if (result.error) reportAuthFailureIfOperational(result.error, "sign-in");
    return result;
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const result = await supabase!.auth.signUp({ email, password });
    if (result.error) reportAuthFailureIfOperational(result.error, "sign-up");
    return result;
  };

  const resetPasswordForEmail = async (email: string) => {
    const result = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordRecoveryRedirectUrl(window.location),
    });
    if (result.error) {
      reportAuthFailureIfOperational(result.error, "reset-password");
    }
    return result;
  };

  const updatePassword = async (password: string) => {
    const result = await supabase!.auth.updateUser({ password });
    if (result.error) {
      reportAuthFailureIfOperational(result.error, "update-password");
    }
    if (result.data.user) setUser(result.data.user);
    return result;
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("type");
    url.searchParams.delete("error");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const signOut = (): Promise<{ error: AuthError | null }> | undefined =>
    supabase?.auth.signOut().then((result) => {
      if (result.error) {
        reportAuthFailureIfOperational(result.error, "sign-out");
      }
      return result;
    });

  const updateUserProfile = async (data: UserProfileUpdateData) => {
    const result = await supabase!.auth.updateUser({ data });
    if (result.error) {
      reportAuthFailureIfOperational(result.error, "update-profile");
    }
    if (result.data.user) setUser(result.data.user);
    return result;
  };

  // App-owned fields stored in Supabase Auth user_metadata by
  // updateUserProfile. Provider-managed identity fields (email, name from
  // OAuth) are left untouched.
  const PROFILE_METADATA_FIELDS: (keyof UserProfileUpdateData)[] = [
    "username",
    "full_name",
    "home_city",
    "default_locale",
    "dob",
    "units",
    "emailNotifications",
    "preferences",
  ];

  const clearProfileData = async (): Promise<ClearProfileResult> => {
    return executeClearProfile({
      user,
      client: supabase,
      signOut: () =>
        signOut?.() ?? Promise.resolve({ error: null as AuthError | null }),
      onUserUpdated: (updatedUser) => setUser(updatedUser),
      profileMetadataFields: PROFILE_METADATA_FIELDS as readonly string[],
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signInWithTwitter,
        signInWithLine,
        signInWithEmail,
        signUpWithEmail,
        resetPasswordForEmail,
        updatePassword,
        isPasswordRecovery,
        clearPasswordRecovery,
        signOut,
        updateUserProfile,
        clearProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
