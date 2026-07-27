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
  Bookmark,
  HelpCircle,
  MessageSquare,
  Layers,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/shared/hooks/useAuth";
import { AuthModal } from "@/shared/components/auth/AuthModal";
import { GlobalSearch } from "@/features/search/GlobalSearch";
import { FeedbackModal } from "@/shared/components/feedback/FeedbackModal";
import { ReleaseNotesModal } from "@/shared/components/ui/ReleaseNotesModal";

export default function Navbar() {
  const location = useLocation();
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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
  const isCollectionsActive = location.pathname.startsWith("/collections");
  const isMyTripsActive = location.pathname.startsWith("/my-trips");
  const isBucketListActive = location.pathname.startsWith("/bucket-list");
  const isPassportActive = location.pathname.startsWith("/passport");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/85 backdrop-blur-xl shadow-xs shadow-slate-900/5 dark:shadow-slate-950/20">
      <div className="container mx-auto px-4 h-[68px] flex items-center justify-between gap-2 md:gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-bold text-xl tracking-tight shrink-0"
          onClick={() => setMenuOpen(false)}
        >
          <span className="text-emerald-600 dark:text-emerald-400">Tabi</span>
          <span className="text-slate-800 dark:text-slate-200">Map</span>
        </Link>

        {/* Global Search Bar (Center / Desktop & Mobile icon) */}
        <GlobalSearch />

        <div className="flex items-center gap-4 shrink-0">
          <nav className="hidden md:flex items-center gap-1.5">
            {/* Discover Cluster */}
            <div className="flex items-center gap-1.5">
              <Link
                to="/destinations"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                  isDestinationsActive
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Map className="w-4 h-4" />
                <span>Destinations</span>
              </Link>

              <Link
                to="/collections"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                  isCollectionsActive
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Collections</span>
              </Link>
            </div>

            {/* Divider between Discover & Plan */}
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 shrink-0" />

            {/* Plan Cluster */}
            <div className="flex items-center gap-1.5">
              <Link
                to="/my-trips"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                  isMyTripsActive
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Itineraries</span>
              </Link>

              <Link
                to="/bucket-list"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                  isBucketListActive
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>Bucket List</span>
              </Link>
            </div>

            {/* Divider between Plan & Passport */}
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 shrink-0" />

            {/* Standalone Passport */}
            <Link
              to="/passport"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-all rounded-lg ${
                isPassportActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/25 shadow-2xs font-bold"
                  : "text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Passport</span>
            </Link>
          </nav>

          <div className="hidden sm:flex items-center gap-2">
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-emerald-400/50 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="User menu"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    {(
                      user.email?.[0] ??
                      (user.user_metadata?.full_name as string)?.[0] ??
                      "U"
                    ).toUpperCase()}
                  </div>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 animate-in fade-in-50 zoom-in-95">
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs text-slate-400 font-medium">
                        Signed in as
                      </p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {user.email ??
                          (user.user_metadata?.full_name as string) ??
                          "User"}
                      </p>
                    </div>

                    <div className="py-1 space-y-0.5">
                      <Link
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <User className="w-4 h-4 text-slate-500" />
                        Profile
                      </Link>

                      <Link
                        to="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <Sliders className="w-4 h-4 text-slate-500" />
                        Settings
                      </Link>

                      <Link
                        to="/help"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <HelpCircle className="w-4 h-4 text-slate-500" />
                        Help
                      </Link>

                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setFeedbackOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                      >
                        <MessageSquare className="w-4 h-4 text-slate-500" />
                        Send Feedback
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
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button
                onClick={() => setAuthOpen(true)}
                className="group bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-full font-bold shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 px-6"
              >
                <LogIn className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                Sign In
              </Button>
            )}
          </div>

          <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
          <FeedbackModal
            isOpen={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
          />

          {/* Hamburger button — mobile only */}
          <button
            ref={hamburgerBtnRef}
            className="md:hidden p-2 text-slate-700 dark:text-slate-300 ml-1"
            onClick={() => setMenuOpen((o) => !o)}
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

      {/* Mobile drawer backdrop */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 top-[68px] bg-black/60 backdrop-blur-sm z-40"
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
          className="md:hidden fixed inset-x-0 top-[68px] z-40 bg-background border-b shadow-lg max-h-[calc(100vh-68px)] overflow-y-auto"
        >
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
            <Link
              to="/destinations"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isDestinationsActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 font-bold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Map className="w-5 h-5 text-emerald-500" /> Destinations
            </Link>

            <Link
              to="/collections"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isCollectionsActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 font-bold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Layers className="w-5 h-5 text-teal-500" /> Collections
            </Link>

            <Link
              to="/my-trips"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isMyTripsActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 font-bold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Calendar className="w-5 h-5 text-emerald-500" /> Itineraries
            </Link>

            <Link
              to="/bucket-list"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isBucketListActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 font-bold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Bookmark className="w-5 h-5 text-amber-500" /> Bucket List
            </Link>

            <Link
              to="/passport"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-colors ${
                isPassportActive
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 font-bold"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Compass className="w-5 h-5 text-emerald-500" /> Passport
            </Link>

            <div className="my-1 border-t border-slate-200 dark:border-slate-800" />

            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin self-center my-4" />
            ) : user ? (
              <div className="flex flex-col gap-1">
                <div className="px-4 py-2 mb-1">
                  <p className="text-xs text-slate-400 font-medium">
                    Signed in as
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {user.email ??
                      (user.user_metadata?.full_name as string) ??
                      "User"}
                  </p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <User className="w-5 h-5 text-slate-500" /> Profile
                </Link>

                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Sliders className="w-5 h-5 text-slate-500" /> Settings
                </Link>

                <Link
                  to="/help"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <HelpCircle className="w-5 h-5 text-slate-500" /> Help
                </Link>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <MessageSquare className="w-5 h-5 text-slate-500" /> Send
                  Feedback
                </button>

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut?.();
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left"
                >
                  <LogOut className="w-5 h-5 text-red-500" /> Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setAuthOpen(true);
                }}
                className="flex items-center justify-center gap-2 mt-2 w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl py-3 font-bold shadow-md transition-all duration-300"
              >
                <LogIn className="w-5 h-5" /> Sign In
              </button>
            )}

            {/* Mobile Drawer Secondary Links & Footer */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-2 pb-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setReleaseNotesOpen(true);
                }}
                className="hover:text-emerald-500 font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="View Release Notes"
              >
                <span>TabiMap Japan v1.7.52</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-extrabold border border-emerald-500/20">
                  Notes
                </span>
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Release Notes Modal */}
      <ReleaseNotesModal
        isOpen={releaseNotesOpen}
        onClose={() => setReleaseNotesOpen(false)}
        version="v1.7.21"
      />
    </header>
  );
}
