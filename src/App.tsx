import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider } from "./shared/hooks/useAuth";
import { TripStoreProvider } from "./shared/hooks/useTripStore";
import Navbar from "./shared/components/layout/Navbar";
import Footer from "./shared/components/layout/Footer";
import { StartupSkeleton } from "./shared/components/layout/StartupSkeleton";
const Home = lazy(() => import("./features/home/Home"));
const Destinations = lazy(() => import("./features/destinations/Destinations"));
import { ErrorBoundary } from "./shared/components/layout/ErrorBoundary";
import { Toaster } from "sonner";

const DestinationDetails = lazy(
  () => import("./features/destinations/DestinationDetails"),
);
const Passport = lazy(() => import("./features/passport/Passport"));
const Terms = lazy(() => import("./features/legal/Terms"));
const Privacy = lazy(() => import("./features/legal/Privacy"));
const Cookies = lazy(() => import("./features/legal/Cookies"));
const MyTrips = lazy(() => import("./features/profile/MyTrips"));

const CollectionsDirectory = lazy(
  () => import("./features/collections/CollectionsDirectory"),
);
const CollectionDetails = lazy(
  () => import("./features/collections/CollectionDetails"),
);

const Settings = lazy(() => import("./features/settings/Settings"));
const Help = lazy(() => import("./features/help/Help"));
const QaDashboard = lazy(() => import("./features/qa/QaDashboard"));
const Compare = lazy(() => import("./features/compare/Compare"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RouteLoader() {
  const location = useLocation();
  return location.pathname === "/" ? <StartupSkeleton /> : <PageLoader />;
}

/**
 * Locale-boundary sync (KAI-101): Back/Forward crossing the /ja boundary
 * would otherwise blank the app (React Router renders nothing for URLs
 * outside its basename) or leave the rendered locale mismatched with the
 * URL — share previews are crawler-fetched from the URL. This listener lives
 * outside the Router on purpose (the Router tree is unmounted at that
 * point) and navigates the boundary entry onto the locale version of the
 * same page. Only fires on POP — the locale-switch flow (replaceState +
 * reload) emits no popstate.
 */
function LocaleUrlSync() {
  const { locale } = useLocale();
  useEffect(() => {
    const onPop = () => {
      const rawPath = window.location.pathname;
      if (locale === "ja" && !rawPath.startsWith("/ja")) {
        const target = `/ja${rawPath}${window.location.search}${window.location.hash}`;
        // replaceState keeps the popped entry (including React Router's
        // usr/key/idx) and only changes its URL; the reload then renders
        // that entry — same safe pattern as the language switch.
        window.history.replaceState(window.history.state, "", target);
        window.location.reload();
      } else if (locale === "en" && rawPath.startsWith("/ja")) {
        const target = `${rawPath.slice(3) || "/"}${window.location.search}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", target);
        window.location.reload();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [locale]);
  return null;
}

import { useState } from "react";
import CompareModal from "./features/compare/components/CompareModal";
import CompareFloatingBar from "./features/compare/components/CompareFloatingBar";

import { ThemeProvider } from "./shared/context/ThemeContext";
import { LocaleProvider, useLocale } from "./shared/context/LocaleContext";
import { AuthModalProvider } from "./shared/context/AuthModalContext";
import { OnboardingFlow } from "./shared/components/auth/OnboardingFlow";

import BottomNav from "./shared/components/layout/BottomNav";

function AppInner() {
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Locale-prefixed URLs (/ja/...) keep the locale visible to share-preview
  // crawlers; the basename makes every internal link stay on the locale
  // version once the user is on it.
  const basename = window.location.pathname.startsWith("/ja")
    ? "/ja"
    : undefined;

  return (
    <>
      <LocaleUrlSync />
      <Router basename={basename}>
        <div className="flex flex-col min-h-screen bg-background text-foreground">
          <Navbar />
          <main className="flex-grow pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
            <ErrorBoundary>
              <Suspense fallback={<RouteLoader />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/destinations" element={<Destinations />} />
                  <Route
                    path="/destinations/:id"
                    element={<DestinationDetails />}
                  />
                  <Route
                    path="/collections"
                    element={<CollectionsDirectory />}
                  />
                  <Route
                    path="/collections/:slug"
                    element={<CollectionDetails />}
                  />
                  <Route path="/compare" element={<Compare />} />
                  <Route
                    path="/favorites"
                    element={<Navigate to="/bucket-list" replace />}
                  />
                  <Route path="/bucket-list" element={<MyTrips />} />
                  <Route path="/my-trips" element={<MyTrips />} />
                  <Route path="/passport" element={<Passport />} />
                  <Route
                    path="/visited-map"
                    element={<Navigate to="/passport" replace />}
                  />
                  <Route
                    path="/profile"
                    element={
                      <Navigate to="/settings?section=account" replace />
                    }
                  />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/qa" element={<QaDashboard />} />
                  <Route
                    path="/editorial"
                    element={<Navigate to="/qa" replace />}
                  />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/cookies" element={<Cookies />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
          <Footer />
          <BottomNav />
          <CompareFloatingBar onOpenModal={() => setCompareModalOpen(true)} />
          <CompareModal
            isOpen={compareModalOpen}
            onClose={() => setCompareModalOpen(false)}
          />
        </div>
        <Toaster position="bottom-right" />
      </Router>
      <OnboardingFlow />
    </>
  );
}

function App() {
  // KAI-121 (rework): NO app-root catalogue preload. Legal/settings/
  // account/etc. must not fetch the full index. Only routes/features that
  // genuinely require the complete catalogue trigger
  // loadDestinationsIndex() themselves (Home, /destinations, Compare,
  // search-on-demand, recommendation paths).
  return (
    <AuthProvider>
      <ThemeProvider>
        <LocaleProvider>
          <AuthModalProvider>
            <TripStoreProvider>
              <AppInner />
            </TripStoreProvider>
          </AuthModalProvider>
        </LocaleProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
