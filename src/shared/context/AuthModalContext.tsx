import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { AuthModal } from "@/shared/components/auth/AuthModal";

const AuthModalContext = createContext<(() => void) | null>(null);

export function AuthModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const openAuthModal = useMemo(() => () => setIsOpen(true), []);

  return (
    <AuthModalContext.Provider value={openAuthModal}>
      {children}
      <AuthModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
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
