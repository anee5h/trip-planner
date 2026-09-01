import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Calendar,
  Compass,
  HelpCircle,
  Languages,
  Layers,
  LogOut,
  Map,
  MessageSquare,
  Moon,
  Sliders,
  Sun,
  User as UserIcon,
  X,
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
import { recommendationAnalytics } from "@/shared/services/analytics/RecommendationAnalyticsService";

interface AccountMenuProps {
  user: SupabaseUser;
  signOut: (() => Promise<unknown> | undefined) | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFeedback: () => void;
  menuId: string;
}

function AccountMenu({
  user,
  signOut,
  open,
  onOpenChange,
  onOpenFeedback,
  menuId,
}: AccountMenuProps) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fullName = user.user_metadata?.full_name as string | undefined;
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined);
  const initial = (user.email?.[0] ?? fullName?.[0] ?? "U").toUpperCase();

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        open &&
        !wrapperRef.current?.contains(event.target as Node) &&
        !sheetRef.current?.contains(event.target as Node)
      ) {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const focusable = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>(
        'button, a, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  const closeMenu = () => onOpenChange(false);
  const menuItemClass =
    "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-200 dark:hover:bg-slate-800/70";

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-0.5 transition-all hover:ring-2 hover:ring-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        aria-label={t("navigation.userMenu")}
        data-testid="navbar-avatar-trigger"
      >
        <span className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-xs font-bold text-white shadow-xs">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            initial
          )}
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={t("actions.close")}
              className="fixed inset-0 z-[60] cursor-default bg-slate-950/40 backdrop-blur-[1px]"
              onClick={() => {
                onOpenChange(false);
                triggerRef.current?.focus();
              }}
            />
            <aside
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${menuId}-title`}
              className="fixed inset-y-0 right-0 z-[70] flex w-[min(22rem,calc(100vw-1rem))] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2
                  id={`${menuId}-title`}
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  {t("navigation.userMenu")}
                </h2>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label={t("actions.close")}
                  onClick={() => {
                    onOpenChange(false);
                    triggerRef.current?.focus();
                  }}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-lg font-bold text-white shadow-sm">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-slate-900 dark:text-white">
                      {fullName ?? user.email ?? t("navigation.userMenu")}
                    </p>
                    {fullName && user.email && (
                      <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label={t("navigation.userMenu")}
                className="flex-1 overflow-y-auto p-3"
              >
                <div className="space-y-0.5 py-1">
                  <Link
                    to="/collections"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <Layers
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.collections")}
                  </Link>
                  <Link
                    to="/bucket-list"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <Map
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.bucketList")}
                  </Link>
                  <Link
                    to="/my-trips"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <Calendar
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.itineraries")}
                  </Link>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <Link
                    to="/settings?section=account"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <UserIcon
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.editProfile")}
                  </Link>
                  <Link
                    to="/settings?section=travel"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <Sliders
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.settings")}
                  </Link>
                  <Link
                    to="/help"
                    role="menuitem"
                    onClick={closeMenu}
                    className={menuItemClass}
                  >
                    <HelpCircle
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.help")}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onOpenFeedback();
                      closeMenu();
                    }}
                    className={menuItemClass}
                  >
                    <MessageSquare
                      className="h-4 w-4 text-slate-500"
                      aria-hidden="true"
                    />
                    {t("navigation.feedback")}
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMenu();
                      void signOut?.();
                    }}
                    className={`${menuItemClass} font-semibold !text-red-600 hover:bg-red-50 dark:!text-red-400 dark:hover:bg-red-950/40`}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t("navigation.signOut")}
                  </button>
                </div>
              </div>
            </aside>
          </>,
          document.body,
        )}
    </div>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { locale, setLocale } = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const { openAuthModal } = useAuthModal();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const signupImpressionTrackedRef = useRef(false);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!loading && !user && !signupImpressionTrackedRef.current) {
      recommendationAnalytics.trackSignupCtaImpression("header", locale);
      signupImpressionTrackedRef.current = true;
    }
  }, [loading, locale, user]);

  const isDestinationsActive = location.pathname.startsWith("/destinations");
  const isCollectionsActive = location.pathname.startsWith("/collections");
  const isTripsActive =
    location.pathname.startsWith("/my-trips") ||
    location.pathname.startsWith("/bucket-list");
  const isPassportActive = location.pathname.startsWith("/passport");

  const handleSignupClick = () => {
    recommendationAnalytics.trackSignupCtaClick("header", locale);
    openAuthModal("signup", "header");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 shadow-xs shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/85 dark:shadow-slate-950/20">
      <div className="container mx-auto flex h-[52px] w-full items-center gap-2 px-3 md:h-[68px] md:gap-3 md:px-2 lg:gap-4 lg:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {/^\/destinations\/[^/]+$/.test(location.pathname) && (
            <button
              type="button"
              onClick={() =>
                location.key !== "default"
                  ? navigate(-1)
                  : navigate("/destinations")
              }
              aria-label={t("navigation.back")}
              title={t("navigation.back")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 md:hidden"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <Link
            to="/"
            aria-label="Meguruto home"
            className="flex min-w-0 shrink-0 items-center gap-2 font-bold tracking-tight"
          >
            <span
              data-testid="navbar-brand-mark-frame"
              className="inline-flex shrink-0 rounded-[10px] bg-white p-0.5 shadow-sm ring-1 ring-slate-200 dark:ring-white/50"
            >
              <MegurutoMark className="size-7 md:size-[30px]" />
            </span>
            <span
              data-testid="navbar-brand-wordmark"
              className="whitespace-nowrap text-base font-extrabold max-[359px]:hidden sm:text-lg md:text-xl"
            >
              <span className="text-emerald-700 dark:text-emerald-300">
                Meguru
              </span>
              <span className="text-slate-900 dark:text-white">to</span>
            </span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex lg:px-6">
          <GlobalSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-3">
          <nav className="hidden items-center gap-1 md:flex lg:gap-1.5">
            <Link
              to="/destinations"
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all lg:px-3 lg:text-sm ${
                isDestinationsActive
                  ? "border-emerald-700/25 bg-emerald-50 font-bold text-emerald-700 shadow-2xs dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "border-transparent text-slate-600 hover:bg-slate-100/60 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
              }`}
            >
              <Map className="h-4 w-4" aria-hidden="true" />
              <span>{t("navigation.explore")}</span>
            </Link>
            <Link
              to="/collections"
              className={`hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all lg:flex ${
                isCollectionsActive
                  ? "border-emerald-700/25 bg-emerald-50 font-bold text-emerald-700 shadow-2xs dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "border-transparent text-slate-600 hover:bg-slate-100/60 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
              }`}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span>{t("navigation.collections")}</span>
            </Link>
            <Link
              to="/my-trips"
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all lg:px-3 lg:text-sm ${
                isTripsActive
                  ? "border-emerald-700/25 bg-emerald-50 font-bold text-emerald-700 shadow-2xs dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "border-transparent text-slate-600 hover:bg-slate-100/60 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
              }`}
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <span>{t("navigation.trips")}</span>
            </Link>
            <Link
              to="/passport"
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all lg:px-3 lg:text-sm ${
                isPassportActive
                  ? "border-emerald-700/25 bg-emerald-50 font-bold text-emerald-700 shadow-2xs dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "border-transparent text-slate-600 hover:bg-slate-100/60 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-slate-800/50 dark:hover:text-emerald-400"
              }`}
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              <span>{t("navigation.passport")}</span>
            </Link>
          </nav>

          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setLanguageMenuOpen((open) => !open)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300"
              aria-label={t("navigation.selectLanguage")}
              aria-expanded={languageMenuOpen}
              aria-haspopup="menu"
              data-testid="navbar-desktop-language-toggle"
            >
              <Languages className="h-5 w-5" aria-hidden="true" />
            </button>
            {languageMenuOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
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
                    className={`min-h-10 w-full rounded-lg px-3 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      locale === value
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
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
            className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 md:flex"
            aria-label={t("navigation.toggleTheme")}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5 text-slate-600" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-center gap-0.5 md:hidden">
            <button
              type="button"
              onClick={() => setLocale(locale === "en" ? "ja" : "en")}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300"
              aria-label={t("navigation.selectLanguage")}
              title={t("navigation.selectLanguage")}
              data-testid="navbar-mobile-language-toggle"
            >
              <Languages className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300"
              aria-label={t("navigation.toggleTheme")}
              title={t("navigation.toggleTheme")}
              data-testid="navbar-mobile-theme-toggle"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-5 w-5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5 text-slate-600" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex min-w-0 items-center justify-end">
            {loading ? (
              <div
                aria-hidden="true"
                className="h-11 min-w-[5.25rem] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
              />
            ) : user ? (
              <AccountMenu
                user={user}
                signOut={signOut}
                open={userMenuOpen}
                onOpenChange={setUserMenuOpen}
                onOpenFeedback={() => setFeedbackOpen(true)}
                menuId="navbar-account-menu"
              />
            ) : (
              <Button
                type="button"
                variant="default"
                size="lg"
                onClick={handleSignupClick}
                data-testid="navbar-signup-cta"
                className="min-h-11 rounded-lg px-3 text-sm font-bold md:px-4"
              >
                {t("actions.signUp")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </header>
  );
}
