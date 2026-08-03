/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/shared/hooks/useAuth";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "tabimap_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUserProfile } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) as ThemeMode | null;
    return saved || "system";
  });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  // Sync theme preference from authenticated user profile
  useEffect(() => {
    if (user?.user_metadata?.theme) {
      const userTheme = user.user_metadata.theme as ThemeMode;
      setThemeState(userTheme);
      localStorage.setItem(LOCAL_STORAGE_KEY, userTheme);
    }
  }, [user]);

  // Listen to OS system color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? systemTheme : theme;

  // ThemeProvider is the SINGLE SOURCE OF TRUTH for DOM mutation on document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(LOCAL_STORAGE_KEY, mode);

    if (user) {
      updateUserProfile({ theme: mode }).catch((err) => {
        console.error("Failed to persist theme mode to profile:", err);
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
