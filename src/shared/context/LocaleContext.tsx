/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import i18n, { writeLanguagePreference } from "@/i18n";

export type AppLocale = "en" | "ja";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** The locale version of the current URL, e.g. /destinations/x -> /ja/destinations/x. */
function localeUrl(locale: AppLocale, currentPath: string): string {
  const isJaUrl = currentPath.startsWith("/ja");
  if (locale === "ja") {
    return isJaUrl ? currentPath : `/ja${currentPath}`;
  }
  return isJaUrl ? currentPath.slice(3) || "/" : currentPath;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => {
    // URL prefix is the source of truth (share URLs are crawler-visible);
    // otherwise i18n already resolved preference -> navigator.
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/ja")
    ) {
      return "ja";
    }
    return i18n.language === "ja" ? "ja" : "en";
  });

  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      setLocale(language === "ja" ? "ja" : "en");
    };
    i18n.on("languageChanged", handleLanguageChanged);
    document.documentElement.lang = locale;
    return () => i18n.off("languageChanged", handleLanguageChanged);
  }, [locale]);

  const changeLocale = (nextLocale: AppLocale) => {
    // Record the explicit choice so the navigator-based redirect in main.tsx
    // never bounces the user back to /ja after switching to English.
    writeLanguagePreference(nextLocale);
    const currentPath = window.location.pathname;
    const target = localeUrl(nextLocale, currentPath);
    if (target !== currentPath) {
      // Locale lives in the URL for crawler-visible shares: navigate to the
      // locale version. The reload must not lose the current history entry —
      // React Router stores location.state (DestinationDetails' planning
      // context: partySize, budget, travelDate, car/public modes, ...) in
      // window.history.state.usr. replaceState keeps the same entry (usr,
      // key and the router's internal idx) and only changes the URL, so the
      // language switch never adds a Back-stack entry and Back returns to
      // the actual previous route.
      const search = `${target}${window.location.search}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", search);
      window.location.reload();
      return;
    }
    void i18n.changeLanguage(nextLocale);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale: changeLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}
