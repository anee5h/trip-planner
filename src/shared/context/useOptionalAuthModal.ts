import { useContext } from "react";
import { AuthModalContext } from "./authModalContext";

/**
 * Optional only for shared leaf components that can be rendered closed in
 * isolation. Interactive guest persistence still fails explicitly without the
 * provider instead of silently dropping the action.
 */
export function useOptionalAuthModal() {
  const openAuthModal = useContext(AuthModalContext);
  return openAuthModal ? { openAuthModal } : null;
}
