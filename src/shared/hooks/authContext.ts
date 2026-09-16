import { createContext } from "react";
import type {
  AuthError,
  AuthResponse,
  User,
  UserResponse,
} from "@supabase/supabase-js";
import type { ClearProfileResult } from "./clearProfileResult";

export interface UserPreferencesPayload {
  partySize?: number;
  carMode?: string;
  publicTransport?: boolean;
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

export interface AuthContextType {
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
  updatePassword: (password: string) => Promise<UserResponse>;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<{ error: AuthError | null }> | undefined;
  updateUserProfile: (data: UserProfileUpdateData) => Promise<UserResponse>;
  clearProfileData: () => Promise<ClearProfileResult>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
