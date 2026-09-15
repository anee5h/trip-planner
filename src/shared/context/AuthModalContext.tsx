import { useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { AuthModal } from "@/shared/components/auth/AuthModal";
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";
import { discardPendingPersistenceIntent } from "@/shared/services/auth/PendingPersistenceIntent";
import {
  AuthModalContext,
  type AuthModalMode,
  type AuthModalSource,
} from "./authModalContext";

export type { AuthModalMode, AuthModalSource } from "./authModalContext";

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
        onCancel={() => {
          discardPendingPersistenceIntent();
          setIsOpen(false);
        }}
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

export function useOptionalAuthModal() {
  const openAuthModal = useContext(AuthModalContext);
  return openAuthModal ? { openAuthModal } : null;
}
