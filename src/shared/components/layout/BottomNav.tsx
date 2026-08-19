import { Link, useLocation } from "react-router-dom";
import { Home, Map, Search, Calendar, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dispatchOpenSearch } from "@/features/search/openSearch";

export default function BottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const pathname = location.pathname;
  const isHomeActive = pathname === "/";
  const isExploreActive =
    pathname.startsWith("/destinations") || pathname.startsWith("/collections");
  const isTripsActive =
    pathname.startsWith("/my-trips") || pathname.startsWith("/bucket-list");
  const isPassportActive = pathname.startsWith("/passport");

  const handleOpenSearch = () => {
    dispatchOpenSearch();
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
          className={`flex flex-col items-center justify-center gap-1 py-1 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
            isHomeActive
              ? "text-emerald-700 dark:text-emerald-300 font-bold"
              : "text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
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
          className={`flex flex-col items-center justify-center gap-1 py-1 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
            isExploreActive
              ? "text-emerald-700 dark:text-emerald-300 font-bold"
              : "text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
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
            className="group relative flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105 active:scale-95 transition-all duration-200 ring-4 ring-white dark:ring-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
          >
            <Search className="w-5 h-5 transition-transform group-hover:rotate-12" />
          </button>
          <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold mt-0.5 truncate max-w-[68px] text-center">
            {t("search.label")}
          </span>
        </div>

        {/* 4. Trips */}
        <Link
          to="/my-trips"
          aria-current={isTripsActive ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-1 py-1 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
            isTripsActive
              ? "text-emerald-700 dark:text-emerald-300 font-bold"
              : "text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
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
          className={`flex flex-col items-center justify-center gap-1 py-1 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
            isPassportActive
              ? "text-emerald-700 dark:text-emerald-300 font-bold"
              : "text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
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
