import { useContext } from "react";
import { AuthContext } from "./authContext";

/**
 * Optional only for shared leaf components that can be rendered in isolation.
 * Page-level auth consumers must use useAuth() and fail outside AuthProvider.
 */
export function useOptionalAuth() {
  return useContext(AuthContext) ?? null;
}
