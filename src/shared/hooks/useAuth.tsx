import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  User,
  Provider,
  AuthResponse,
  UserResponse,
  AuthError,
} from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { executeClearProfile } from "./clearProfileOrchestration";
import type { ClearProfileResult } from "./clearProfileResult";
import { reportAuthFailureIfOperational } from "@/shared/utils/errorReporter";
import { executePendingAccountDeletionIfRequested } from "@/shared/utils/pendingAccountDeletion";

export interface UserPreferencesPayload {
  partySize?: number;
  carMode?: string;
  publicModes?: string[];
  preferences_set?: boolean;
  [key: string]: unknown;
}

export interface UserProfileUpdateData {
  username?: string;
  full_name?: string;
  home_city?: string;
  default_locale?: "en" | "ja";
  dob?: string;
  units?: string;
  emailNotifications?: boolean;
  preferences?: UserPreferencesPayload;
  [key: string]: unknown;
}

export type OAuthResponse = {
  data: { provider: string; url: string | null };
  error: AuthError | null;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<OAuthResponse> | undefined;
  signInWithTwitter: () => Promise<OAuthResponse> | undefined;
  signInWithLine: () => Promise<OAuthResponse> | undefined;
  signInWithEmail: (email: string, password: string) => Promise<AuthResponse>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthResponse>;
  resetPasswordForEmail: (
    email: string,
  ) => Promise<{ data: unknown; error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }> | undefined;
  updateUserProfile: (data: UserProfileUpdateData) => Promise<UserResponse>;
  clearProfileData: () => Promise<ClearProfileResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session. KAI-46: a failing session bootstrap is an
    // operational auth failure — report it (best-effort, feature auth).
    // KAI-44: a session arriving with a pending-deletion flag (OAuth
    // reauthentication redirect) completes the deletion.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null);
        setLoading(false);
        if (data.session?.access_token) {
          void executePendingAccountDeletionIfRequested();
        }
      })
      .catch((err) => {
        reportAuthFailureIfOperational(err, "session");
        setLoading(false);
      });

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.access_token) {
        void executePendingAccountDeletionIfRequested();
      }
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
      redirectTo: window.location.origin,
    });
    if (result.error) {
      reportAuthFailureIfOperational(result.error, "reset-password");
    }
    return result;
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
