import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "./shared/hooks/useAuth";
import { TripStoreProvider } from "./shared/hooks/useTripStore";
import Navbar from "./shared/components/layout/Navbar";
import Footer from "./shared/components/layout/Footer";
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
const CollectionGroupDetails = lazy(
  () => import("./features/collections/CollectionGroupDetails"),
);

const Settings = lazy(() => import("./features/settings/Settings"));
const Help = lazy(() => import("./features/help/Help"));
const QaDashboard = lazy(() => import("./features/qa/QaDashboard"));
const Compare = lazy(() => import("./features/compare/Compare"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

import { useState } from "react";
import CompareModal from "./features/compare/components/CompareModal";
import CompareFloatingBar from "./features/compare/components/CompareFloatingBar";

import { ThemeProvider } from "./shared/context/ThemeContext";
import { LocaleProvider } from "./shared/context/LocaleContext";
import { AuthModalProvider } from "./shared/context/AuthModalContext";
import { useIdlePrefetch } from "./shared/hooks/useIdlePrefetch";
import { OnboardingFlow } from "./shared/components/auth/OnboardingFlow";

import BottomNav from "./shared/components/layout/BottomNav";

function AppInner() {
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  useIdlePrefetch();

  return (
    <>
      <Router>
        <div className="flex flex-col min-h-screen bg-background text-foreground">
          <Navbar />
          <main className="flex-grow pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
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
                    path="/collections/:slug/:groupId"
                    element={<CollectionGroupDetails />}
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
