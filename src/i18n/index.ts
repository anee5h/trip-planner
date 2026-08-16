import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./resources/en/common.json";
import enDestination from "./resources/en/destination.json";
import jaCommon from "./resources/ja/common.json";
import jaDestination from "./resources/ja/destination.json";

export const resources = {
  en: { common: enCommon, destination: enDestination },
  ja: { common: jaCommon, destination: jaDestination },
} as const;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof resources)["en"];
  }
}

/** Language preference key — written by the locale switcher so the
 *  navigator-based redirect (main.tsx) never fights an explicit choice. */
export const LANGUAGE_PREF_KEY = "meguruto-lang";
const LANGUAGE_PREF_COOKIE = `${LANGUAGE_PREF_KEY}=`;

/** Cookie fallback for browsers where localStorage throws (private mode) —
 *  without it, switching to English while a ja navigator is active would be
 *  bounced back to /ja on the next load. */
function readLanguagePreferenceCookie(): "en" | "ja" | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(LANGUAGE_PREF_COOKIE));
    const value = match?.slice(LANGUAGE_PREF_COOKIE.length);
    if (value === "ja" || value === "en") return value;
  } catch {
    // cookie access unavailable
  }
  return null;
}

export function readLanguagePreference(): "en" | "ja" | null {
  try {
    const pref = localStorage.getItem(LANGUAGE_PREF_KEY);
    if (pref === "ja" || pref === "en") return pref;
  } catch {
    // localStorage unavailable (privacy mode, non-DOM contexts)
  }
  return readLanguagePreferenceCookie();
}

export function writeLanguagePreference(locale: "en" | "ja"): void {
  try {
    localStorage.setItem(LANGUAGE_PREF_KEY, locale);
    return;
  } catch {
    // fall through to the cookie so the choice survives reloads
  }
  try {
    document.cookie = `${LANGUAGE_PREF_COOKIE}${locale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // neither storage nor cookies available: the URL prefix still carries
    // the locale for this session
  }
}

/** Initial language: the URL locale prefix wins (share URLs are the source
 *  of truth for crawlers), then an explicit preference, then the browser. */
export function resolveInitialLanguage(): string {
  if (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/ja")
  ) {
    return "ja";
  }
  const pref = readLanguagePreference();
  if (pref) return pref;
  if (
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("ja")
  ) {
    return "ja";
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (_lngs, _ns, key) => {
    if (import.meta.env.DEV) console.warn(`Missing translation key: ${key}`);
  },
});

export default i18n;
