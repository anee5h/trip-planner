import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getCollections } from "@/shared/data/collections";
import {
  getCollectionDestinationGroups,
  getDestinationsForCollection,
  getCollectionProgress,
  getCollectionContent,
  UNESCO_COLLECTION_ID,
} from "@/shared/utils/collections";
import { Badge } from "@/shared/components/ui/badge";
import { useLocale } from "@/shared/context/LocaleContext";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useTranslation } from "react-i18next";
import { useLiteCatalogueReady } from "@/shared/hooks/useLiteCatalogueReady";

export default function CollectionsDirectory() {
  const {
    ready: liteReady,
    error: liteError,
    retry: retryLite,
  } = useLiteCatalogueReady();
  const collections = getCollections();
  const { visited } = useTripStore();
  const { locale } = useLocale();
  const { t } = useTranslation();
  const availableCollections = liteReady
    ? collections.filter(
        (collection) =>
          getDestinationsForCollection(collection.id, locale).length > 0,
      )
    : [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <PageHeader
        title={t("ui.curatedCollections")}
        subtitle={t("ui.curatedGuides")}
        compact
      />

      {liteError ? (
        // KAI-132: failed load is NOT ready — explicit error + retry,
        // never a spinner that runs forever.
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-20 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50 text-center px-4"
        >
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {t("home.matchesErrorTitle", "Couldn't load destinations")}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "home.matchesErrorBody",
              "The destination catalogue couldn't be loaded. Check your connection and try again.",
            )}
          </p>
          <button
            type="button"
            onClick={retryLite}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {t("ui.retry", "Retry")}
          </button>
        </div>
      ) : !liteReady ? (
        // KAI-132: lite catalogue still loading — show a spinner, not an
        // empty grid (availableCollections would be [] pre-load).
        <div className="flex flex-col items-center justify-center py-20">
          <div
            aria-hidden="true"
            className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500"
          />
          <p className="mt-4 text-sm text-slate-500">
            {t("ui.loading", "Loading…")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          {availableCollections.map((collection) => {
            const destinations = getDestinationsForCollection(
              collection.id,
              locale,
            );
            const destinationGroups = getCollectionDestinationGroups(
              collection.id,
              locale,
            );
            const isUNESCOCollection = collection.id === UNESCO_COLLECTION_ID;
            const progress = getCollectionProgress(
              collection.id,
              visited,
              locale,
            );
            const content = getCollectionContent(collection, locale);

            return (
              <Link
                key={collection.id}
                to={`/collections/${collection.slug}`}
                className="group flex min-h-64 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <Badge
                  variant="outline"
                  className="w-fit text-xs font-bold uppercase tracking-wide"
                >
                  {collection.category}
                </Badge>
                <h2 className="mt-3 text-2xl font-extrabold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-400">
                  {content.name}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {content.description}
                </p>

                <div className="mt-auto pt-5">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold md:text-[13px]">
                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      {progress.visited} / {progress.total}{" "}
                      {isUNESCOCollection
                        ? t("ui.unescoVisited").toLowerCase()
                        : t("ui.visited").toLowerCase()}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-700 transition-all duration-500"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300 md:text-[13px]">
                    <span>
                      {isUNESCOCollection
                        ? t("ui.unescoSummary", {
                            properties: destinationGroups.length,
                            places: destinations.length,
                          })
                        : `${destinations.length} ${t("ui.destinations")}`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {t("ui.viewCollection")}{" "}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
