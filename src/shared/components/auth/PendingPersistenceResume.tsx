import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/hooks/useAuth";
import { useTripStore } from "@/shared/hooks/useTripStore";
import {
  consumePendingPersistenceIntent,
  peekPendingPersistenceIntent,
} from "@/shared/services/auth/PendingPersistenceIntent";

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Resumes only safe, explicitly requested guest persistence actions. */
export function PendingPersistenceResume() {
  const { user, loading: authLoading, updateUserProfile } = useAuth();
  const { profileSyncStatus, isFavorite, toggleFavorite, addVisitedDate } =
    useTripStore();
  const navigate = useNavigate();
  const location = useLocation();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (authLoading || !user || inFlightRef.current) return;
    const intent = peekPendingPersistenceIntent();
    if (!intent) return;

    if (intent.type === "trip_save" || intent.type === "my_trips") {
      if (currentPath() !== intent.returnPath) {
        if (
          intent.returnPath.startsWith("/ja") &&
          !window.location.pathname.startsWith("/ja")
        ) {
          window.location.assign(intent.returnPath);
        } else {
          navigate(intent.returnPath);
        }
      }
      return;
    }

    if (profileSyncStatus !== "ready") return;
    inFlightRef.current = true;

    void (async () => {
      try {
        if (intent.type === "bucket_list_save") {
          const claimed = consumePendingPersistenceIntent();
          if (claimed?.type !== "bucket_list_save") return;
          if (!isFavorite(claimed.destinationId)) {
            toggleFavorite(claimed.destinationId);
          }
        } else if (intent.type === "passport") {
          const claimed = consumePendingPersistenceIntent();
          if (claimed?.type !== "passport") return;
          addVisitedDate(claimed.destinationId, claimed.visitDate);
        } else if (intent.type === "preferences") {
          const existing =
            (user.user_metadata?.preferences as
              Record<string, unknown> | undefined) ?? {};
          const result = await updateUserProfile({
            preferences: {
              ...existing,
              ...intent.preferences,
              preferences_set: true,
            },
          });
          if (!result.error) consumePendingPersistenceIntent();
        }
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [
    addVisitedDate,
    authLoading,
    isFavorite,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    profileSyncStatus,
    toggleFavorite,
    updateUserProfile,
    user,
  ]);

  return null;
}
