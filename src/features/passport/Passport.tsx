import { useState } from "react";
import { AlertTriangle, Loader2, LogIn } from "lucide-react";
import type { PassportTab } from "./types";
import { PassportNav } from "./components/PassportNav";
import { PassportOverview } from "./components/PassportOverview";
import { PassportJapanMap } from "./components/PassportJapanMap";
import { PassportTimeline } from "./components/PassportTimeline";
import { PassportAchievements } from "./components/PassportAchievements";
import { PassportBadges } from "./components/PassportBadges";

import { PageHeader } from "@/shared/components/ui/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { useAuthModal } from "@/shared/context/AuthModalContext";
import { useTranslation } from "react-i18next";

export default function Passport() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { profileSyncStatus, retryProfileHydration } = useTripStore();
  const [activeTab, setActiveTab] = useState<PassportTab>("overview");
  const isPassportLoading =
    authLoading ||
    (Boolean(user) &&
      (profileSyncStatus === "idle" || profileSyncStatus === "loading"));
  const hasHydrationError = Boolean(user) && profileSyncStatus === "error";
  const isSignedOut = !authLoading && !user;

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        title={t("ui.travelPassport")}
        subtitle={t("ui.profileHub")}
        description={t("ui.travelSummary")}
      />

      {isPassportLoading ? (
        <div
          className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-6 animate-spin text-emerald-700" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {t("ui.passportLoading")}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            {t("ui.passportLoadingHint")}
          </p>
        </div>
      ) : isSignedOut ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <LogIn className="size-6 text-slate-500" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {t("passport.signedOutTitle")}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-300 max-w-sm">
            {t("passport.signedOutDescription")}
          </p>
          <Button onClick={openAuthModal}>{t("actions.signIn")}</Button>
        </div>
      ) : hasHydrationError ? (
        <div
          className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"
          role="alert"
        >
          <AlertTriangle className="size-6 text-amber-500" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            {t("ui.passportLoadError")}
          </p>
          <Button onClick={retryProfileHydration}>{t("ui.retry")}</Button>
        </div>
      ) : (
        <>
          <PassportNav activeTab={activeTab} onSelectTab={setActiveTab} />

          <main className="pt-4">
            {activeTab === "overview" && (
              <PassportOverview onSelectTab={setActiveTab} />
            )}
            {activeTab === "japan-map" && <PassportJapanMap />}
            {activeTab === "timeline" && <PassportTimeline />}
            {activeTab === "achievements" && <PassportAchievements />}
            {activeTab === "badges" && <PassportBadges />}
          </main>
        </>
      )}
    </div>
  );
}
