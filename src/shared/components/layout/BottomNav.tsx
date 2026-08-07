import { Link, useLocation } from "react-router-dom";
import { Home, Map, Search, Calendar, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTripStore } from "@/shared/hooks/useTripStore";

export default function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const { compareList } = useTripStore();
  const pathname = location.pathname;

  // Hide persistent bottom nav when Compare floating tray is active to avoid bar collisions
  if (compareList.length > 0) return null;

  const isHomeActive = pathname === "/";
  const isExploreActive =
    pathname.startsWith("/destinations") || pathname.startsWith("/collections");
  const isTripsActive =
    pathname.startsWith("/my-trips") || pathname.startsWith("/bucket-list");
  const isPassportActive = pathname.startsWith("/passport");

  const handleOpenSearch = () => {
    // Trigger global search shortcut (Cmd+K / Ctrl+K) or custom event
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-lg pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-16 items-center px-1 max-w-md mx-auto">
        {/* 1. Home */}
        <Link
          to="/"
          aria-current={isHomeActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
            isHomeActive
              ? "text-emerald-600 dark:text-emerald-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
          }`}
        >
          <Home
            className={`w-5 h-5 transition-transform ${isHomeActive ? "scale-110" : ""}`}
          />
          <span className="text-[11px] truncate max-w-[68px] text-center">
            {t("navigation.home")}
          </span>
        </Link>

        {/* 2. Explore */}
        <Link
          to="/destinations"
          aria-current={isExploreActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
            isExploreActive
              ? "text-emerald-600 dark:text-emerald-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
          }`}
        >
          <Map
            className={`w-5 h-5 transition-transform ${isExploreActive ? "scale-110" : ""}`}
          />
          <span className="text-[11px] truncate max-w-[68px] text-center">
            {t("navigation.explore")}
          </span>
        </Link>

        {/* 3. Search (Centered Primary Global Action) */}
        <div className="flex flex-col items-center justify-center -mt-4">
          <button
            type="button"
            onClick={handleOpenSearch}
            aria-label={t("search.label")}
            className="group relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105 active:scale-95 transition-all duration-200 ring-4 ring-white dark:ring-slate-950 focus:outline-none"
          >
            <Search className="w-5 h-5 transition-transform group-hover:rotate-12" />
          </button>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5 truncate max-w-[68px] text-center">
            {t("search.label")}
          </span>
        </div>

        {/* 4. Trips */}
        <Link
          to="/my-trips"
          aria-current={isTripsActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
            isTripsActive
              ? "text-emerald-600 dark:text-emerald-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
          }`}
        >
          <Calendar
            className={`w-5 h-5 transition-transform ${isTripsActive ? "scale-110" : ""}`}
          />
          <span className="text-[11px] truncate max-w-[68px] text-center">
            {t("navigation.trips")}
          </span>
        </Link>

        {/* 5. Passport */}
        <Link
          to="/passport"
          aria-current={isPassportActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
            isPassportActive
              ? "text-emerald-600 dark:text-emerald-400 font-bold"
              : "text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
          }`}
        >
          <Compass
            className={`w-5 h-5 transition-transform ${isPassportActive ? "scale-110" : ""}`}
          />
          <span className="text-[11px] truncate max-w-[68px] text-center">
            {t("navigation.passport")}
          </span>
        </Link>
      </div>
    </nav>
  );
}
