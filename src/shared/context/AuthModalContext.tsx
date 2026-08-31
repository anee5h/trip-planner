import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { AuthModal } from "@/shared/components/auth/AuthModal";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

export type AuthModalMode = "signin" | "signup";
export type AuthModalSource = "header" | "auth_modal";

type OpenAuthModal = (mode?: AuthModalMode, source?: AuthModalSource) => void;

const AuthModalContext = createContext<OpenAuthModal | null>(null);

export function AuthModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("signin");
  const [source, setSource] = useState<AuthModalSource>("auth_modal");
  const [openGeneration, setOpenGeneration] = useState(0);
  const openAuthModal = useMemo(
    () =>
      (
        nextMode: AuthModalMode = "signin",
        nextSource: AuthModalSource = "auth_modal",
      ) => {
        if (nextMode === "signin") recommendationAnalytics.clearPendingSignup();
        setMode(nextMode);
        setSource(nextSource);
        setOpenGeneration((generation) => generation + 1);
        setIsOpen(true);
      },
    [],
  );

  return (
    <AuthModalContext.Provider value={openAuthModal}>
      {children}
      <AuthModal
        key={openGeneration}
        isOpen={isOpen}
        initialMode={mode}
        source={source}
        onClose={() => setIsOpen(false)}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const openAuthModal = useContext(AuthModalContext);
  if (!openAuthModal) {
    throw new Error("useAuthModal must be used within AuthModalProvider");
  }
  return { openAuthModal };
}
