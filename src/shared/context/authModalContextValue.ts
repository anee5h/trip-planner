import { createContext } from "react";
import type { SignupSource } from "@/shared/services/analytics/RecommendationAnalyticsTypes";

export type AuthModalMode = "signin" | "signup";
export type AuthModalSource = SignupSource;
export type OpenAuthModal = (
  mode?: AuthModalMode,
  source?: AuthModalSource,
) => void;

export const AuthModalContext = createContext<OpenAuthModal | null>(null);
