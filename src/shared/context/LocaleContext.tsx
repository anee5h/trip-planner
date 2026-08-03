/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import i18n from "@/i18n";

export type AppLocale = "en" | "ja";

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => {
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
