import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Calendar,
  Map,
  Menu,
  X,
  LogIn,
  Compass,
  User,
  Sliders,
  LogOut,
  HelpCircle,
  MessageSquare,
  Languages,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/shared/hooks/useAuth";
import { useAuthModal } from "@/shared/context/AuthModalContext";
import { GlobalSearch } from "@/features/search/GlobalSearch";
import { FeedbackModal } from "@/shared/components/feedback/FeedbackModal";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTheme } from "@/shared/context/ThemeContext";
import { MegurutoMark } from "@/shared/components/brand/MegurutoMark";
import { useTranslation } from "react-i18next";

export default function Navbar() {
  const location = useLocation();
  const { user, loading, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { openAuthModal } = useAuthModal();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  // DOM refs for click-outside and focus management
  const userMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerBtnRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Body scroll lock on mobile drawer open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [menuOpen]);

  // Focus trap & focus restore for mobile drawer
  useEffect(() => {
    if (!menuOpen || !mobileMenuRef.current) return;

    const focusable = mobileMenuRef.current.querySelectorAll<HTMLElement>(
      'a, button, input, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        hamburgerBtnRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isDestinationsActive = location.pathname.startsWith("/destinations");
  const isMyTripsActive = location.pathname.startsWith("/my-trips");
  const isBucketListActive = location.pathname.startsWith("/bucket-list");
  const isPassportActive = location.pathname.startsWith("/passport");
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/85 backdrop-blur-xl shadow-xs shadow-slate-900/5 dark:shadow-slate-950/20">
      {/* Desktop Header */}
      <div className="hidden md:flex container mx-auto px-4 h-[68px] items-center justify-between gap-4">
        {/* Logo */}
        <Link
          to="/"
          aria-label="Meguruto home"
          className="flex shrink-0 items-center gap-2 font-bold tracking-tight"
          onClick={() => setMenuOpen(false)}
        >
          <span
            data-testid="navbar-brand-mark-frame"
            className="inline-flex rounded-[10px] bg-white p-[2px] ring-1 ring-slate-200 shadow-sm dark:ring-white/50"
          >
            <MegurutoMark className="size-7 min-[390px]:size-[30px]" />
          </span>
          <span
            data-testid="navbar-brand-wordmark"
            className="inline text-lg min-[390px]:text-xl font-extrabold"
          >
            <span className="text-emerald-600 dark:text-emerald-300">
              Meguru
            </span>
            <span className="text-slate-900 dark:text-white">to</span>
          </span>
        </Link>

        {/* Global Search Bar (Desktop Center) */}
        <GlobalSearch />

        <div className="flex items-center gap-3 shrink-0">
          <nav className="hidden md:flex items-center gap-1.5">
            {/* Explore */}
            <Link
              to="/destinations"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                isDestinationsActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Map className="w-4 h-4" />
              <span>{t("navigation.explore")}</span>
            </Link>

            {/* Trips */}
            <Link
              to="/my-trips"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                isMyTripsActive || isBucketListActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>{t("navigation.trips")}</span>
            </Link>

            {/* Passport */}
            <Link
              to="/passport"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                isPassportActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>{t("navigation.passport")}</span>
            </Link>
          </nav>

          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setLanguageMenuOpen((open) => !open)}
              className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"
              aria-label="Select language"
            >
              <Languages className="h-5 w-5" />
            </button>
            {languageMenuOpen && (
              <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900 z-50">
                {[
                  ["en", "English"],
                  ["ja", "日本語"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setLocale(value as "en" | "ja");
                      setLanguageMenuOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-semibold ${
                      locale === value
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:text-emerald-600"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5 text-amber-400" />
            ) : (
              <Moon className="h-5 w-5 text-slate-600" />
            )}
          </button>

          {loading ? (
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          ) : user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-emerald-500/50 transition-all focus:outline-hidden"
                aria-expanded={userMenuOpen}
                aria-label="User menu"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {(
                    user.email?.[0] ??
                    (user.user_metadata?.full_name as string)?.[0] ??
                    "U"
                  ).toUpperCase()}
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-400 font-medium">
                      {t("navigation.signedInAs")}
                    </p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                      {user.email ??
                        (user.user_metadata?.full_name as string) ??
                        "User"}
                    </p>
                  </div>

                  <div className="py-1 space-y-0.5">
                    <Link
                      to="/settings?section=account"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <User className="w-4 h-4 text-slate-500" />
                      {t("navigation.editProfile")}
                    </Link>

                    <Link
                      to="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <Sliders className="w-4 h-4 text-slate-500" />
                      {t("navigation.settings")}
                    </Link>

                    <Link
                      to="/help"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4 text-slate-500" />
                      {t("navigation.help")}
                    </Link>

                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setFeedbackOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                    >
                      <MessageSquare className="w-4 h-4 text-slate-500" />
                      {t("navigation.feedback")}
                    </button>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-1 mt-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut?.();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                      {t("navigation.signOut")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              onClick={openAuthModal}
              className="group bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-full font-bold shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 px-6"
            >
              <LogIn className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
              {t("navigation.signIn")}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Header (Centered Brand & Hamburger Only) */}
      <div className="relative flex items-center justify-between px-4 h-[56px] w-full md:hidden">
        {/* Left Utility Slot (Empty for home, maintains geometric layout) */}
        <div className="w-10 flex items-center justify-start shrink-0" />

        {/* Geometrically Centered Meguruto Brand */}
        <Link
          to="/"
          aria-label="Meguruto home"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 font-bold tracking-tight z-10"
          onClick={() => setMenuOpen(false)}
        >
          <span
            data-testid="navbar-brand-mark-frame"
            className="inline-flex rounded-[8px] bg-white p-[1.5px] ring-1 ring-slate-200 shadow-xs dark:ring-white/50"
          >
            <MegurutoMark className="size-[22px] min-[390px]:size-[24px]" />
          </span>
          <span
            data-testid="navbar-brand-wordmark"
            className="inline text-base min-[390px]:text-lg font-extrabold"
          >
            <span className="text-emerald-600 dark:text-emerald-300">
              Meguru
            </span>
            <span className="text-slate-900 dark:text-white">to</span>
          </span>
        </Link>

        {/* Right Hamburger Button */}
        <div className="flex items-center justify-end w-10 shrink-0 z-20">
          <button
            ref={hamburgerBtnRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 text-slate-700 dark:text-slate-300 hover:text-emerald-600 focus:outline-hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu-drawer"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />

      {/* Mobile drawer backdrop */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 top-[56px] bg-black/60 backdrop-blur-sm z-40"
          onClick={() => {
            setMenuOpen(false);
            hamburgerBtnRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div
          ref={mobileMenuRef}
          id="mobile-menu-drawer"
          className="md:hidden fixed inset-x-0 top-[56px] z-40 bg-background border-b shadow-lg max-h-[calc(100vh-56px)] overflow-y-auto"
        >
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin self-center my-4" />
            ) : user ? (
              <div className="flex flex-col gap-1">
                <div className="px-4 py-2 mb-1 border-b border-slate-100 dark:border-slate-800/80">
                  <p className="text-xs text-slate-400 font-medium">
                    {t("navigation.signedInAs")}
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {user.email ??
                      (user.user_metadata?.full_name as string) ??
                      "User"}
                  </p>
                </div>

                <Link
                  to="/settings?section=account"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <User className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.editProfile")}
                </Link>

                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Sliders className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.settings")}
                </Link>

                <button
                  type="button"
                  onClick={() => setLocale(locale === "en" ? "ja" : "en")}
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="flex items-center gap-3">
                    <Languages className="w-5 h-5 text-slate-500" />{" "}
                    {t("navigation.language")}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {locale === "en" ? "English" : "日本語"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="flex items-center gap-3">
                    {resolvedTheme === "dark" ? (
                      <Moon className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Sun className="w-5 h-5 text-amber-500" />
                    )}
                    {t("navigation.theme")}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 capitalize">
                    {resolvedTheme === "dark"
                      ? t("theme.dark")
                      : t("theme.light")}
                  </span>
                </button>

                <Link
                  to="/help"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <HelpCircle className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.help")}
                </Link>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <MessageSquare className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.feedback")}
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut?.();
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-1"
                >
                  <LogOut className="w-5 h-5 text-red-500" />{" "}
                  {t("navigation.signOut")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setLocale(locale === "en" ? "ja" : "en")}
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="flex items-center gap-3">
                    <Languages className="w-5 h-5 text-slate-500" />{" "}
                    {t("navigation.language")}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {locale === "en" ? "English" : "日本語"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <span className="flex items-center gap-3">
                    {resolvedTheme === "dark" ? (
                      <Moon className="w-5 h-5 text-indigo-400" />
                    ) : (
                      <Sun className="w-5 h-5 text-amber-500" />
                    )}
                    {t("navigation.theme")}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 capitalize">
                    {resolvedTheme === "dark"
                      ? t("theme.dark")
                      : t("theme.light")}
                  </span>
                </button>

                <Link
                  to="/help"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <HelpCircle className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.help")}
                </Link>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <MessageSquare className="w-5 h-5 text-slate-500" />{" "}
                  {t("navigation.feedback")}
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openAuthModal();
                  }}
                  className="flex items-center justify-center gap-2 mt-2 w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl py-3 font-bold shadow-md transition-all duration-300"
                >
                  <LogIn className="w-5 h-5" /> {t("navigation.signIn")}
                </button>
              </div>
            )}

            {/* Mobile Drawer Footer */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2 pb-1">
              <span className="text-slate-400 dark:text-slate-500">
                Meguruto v{__APP_VERSION__}
              </span>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
