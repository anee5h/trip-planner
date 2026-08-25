import { useCatalogue } from "@/shared/hooks/useCatalogue";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getCollectionBySlug } from "@/shared/data/collections";
import {
  getCollectionDestinationGroups,
  getDestinationsForCollection,
  getCollectionProgress,
  getCollectionContent,
  getUNESCOPropertyGroupDestinations,
  UNESCO_COLLECTION_ID,
} from "@/shared/utils/collections";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import { ArrowLeft, ExternalLink, Frown, CheckCircle2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";
import {
  getCollectionAuthorityLabel,
  getCollectionCategoryLabel,
  getCollectionTypeLabel,
} from "@/shared/utils/collectionLabels";

export default function CollectionDetails() {
  const {
    status: catalogueStatus,
    error: liteError,
    retry: retryLite,
  } = useCatalogue({ need: "summary" });
  const liteReady = catalogueStatus === "ready";
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const collection = slug ? getCollectionBySlug(slug) : undefined;
  const { visited } = useTripStore();
  const { locale } = useLocale();
  const { t } = useTranslation();

  if (!collection) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-xl">
        <Frown className="w-16 h-16 text-slate-500 mx-auto mb-4" />
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t("ui.collectionNotFound")}
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          {t("ui.collectionNotFoundHint")}
        </p>
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 px-5 py-2.5 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("ui.allCollections")}
        </Link>
      </div>
    );
  }

  const destinations = getDestinationsForCollection(collection.id, locale);
  const destinationGroups = getCollectionDestinationGroups(
    collection.id,
    locale,
  );
  const isUNESCOCollection = collection.id === UNESCO_COLLECTION_ID;
  const progress = getCollectionProgress(collection.id, visited, locale);
  const content = getCollectionContent(collection, locale);

  // Group view: /collections/<slug>?property=<id> shows the curated places of
  // one UNESCO property. Reuses this page's ordinary destination-card grid.
  const selectedGroup =
    isUNESCOCollection && searchParams.get("property")
      ? destinationGroups.find(
          (group) => group.propertyId === searchParams.get("property"),
        )
      : undefined;

  if (selectedGroup) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back to the whole collection */}
        <div className="mb-4">
          <Link
            to={`/collections/${collection.slug}`}
            className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> {content.name}
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white md:text-4xl">
            {selectedGroup.name}
          </h1>
          <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            {t("ui.places", { count: selectedGroup.destinations.length })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {selectedGroup.destinations.map((dest) => (
            <DestinationCard key={dest.id} destination={dest} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Navigation Back */}
      <div className="mb-4">
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> {t("ui.allCollections")}
        </Link>
      </div>

      {/* Hero Header */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <Badge
          variant="outline"
          className="text-[10px] font-bold uppercase tracking-wide"
        >
          {getCollectionCategoryLabel(collection.category, locale)} ·{" "}
          {getCollectionTypeLabel(collection.type, locale)}
        </Badge>

        <h1 className="mb-3 text-3xl font-extrabold text-slate-900 dark:text-white md:text-4xl">
          {content.name}
        </h1>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:text-base">
          {content.description}
        </p>

        {/* Progress Tracker */}
        <div className="mb-5 max-w-xl">
          <div className="flex justify-between items-center text-sm font-bold mb-2">
            <span className="text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {progress.visited} / {progress.total}{" "}
              {isUNESCOCollection
                ? t("ui.unescoVisited").toLowerCase()
                : t("ui.visited").toLowerCase()}
            </span>
            <span className="text-emerald-700 dark:text-emerald-300">
              {progress.percent}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-700 transition-all duration-500 rounded-full"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {collection.metadata && (
          <details className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-300">
            <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200">
              {t("ui.aboutCollection")}
            </summary>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <span className="text-slate-500 dark:text-slate-300">
                  {t("ui.authority")}:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                  {getCollectionAuthorityLabel(
                    collection.metadata.authority,
                    locale,
                  )}
                </span>
              </div>
              {(collection.metadata.verificationSource ||
                collection.officialSource) && (
                <div>
                  <span className="text-slate-500 dark:text-slate-300">
                    {t("ui.source")}:
                  </span>{" "}
                  {collection.sourceUrl ? (
                    <a
                      href={collection.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-emerald-700 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-300 inline-flex items-center"
                    >
                      {collection.metadata.verificationSource ||
                        collection.officialSource}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  ) : (
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {collection.metadata.verificationSource ||
                        collection.officialSource}
                    </span>
                  )}
                </div>
              )}
              <div>
                <span className="text-slate-500 dark:text-slate-300">
                  {t("ui.lastReviewed")}:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {collection.metadata.lastVerified}
                </span>
              </div>
              {collection.metadata.expectedMembers && (
                <div>
                  <span className="text-slate-500 dark:text-slate-300">
                    {t("ui.expected")}:
                  </span>{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {isUNESCOCollection
                      ? t("ui.places", {
                          count: collection.metadata.expectedMembers,
                        })
                      : `${collection.metadata.expectedMembers} ${t(
                          "ui.destinations",
                        )}`}
                  </span>
                </div>
              )}
              {collection.metadata.reviewIntervalMonths && (
                <div>
                  <span className="text-slate-500 dark:text-slate-300">
                    {t("ui.auditCycle")}:
                  </span>{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {t("ui.everyMonths", {
                      count: collection.metadata.reviewIntervalMonths,
                    })}
                  </span>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      {liteError ? (
        // KAI-132: failed load is NOT ready — explicit error + retry,
        // never a spinner that runs forever.
        <div
          role="alert"
          data-lite-error
          className="flex flex-col items-center justify-center py-16 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50 text-center px-4"
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
        // KAI-132: lite catalogue still loading — spinner, not empty state.
        <div className="flex flex-col items-center justify-center py-16">
          <div
            aria-hidden="true"
            className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500"
          />
          <p className="mt-4 text-sm text-slate-500">
            {t("ui.loading", "Loading…")}
          </p>
        </div>
      ) : destinations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-slate-500">
          <Frown className="w-12 h-12 mb-3 text-slate-500" />
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-1">
            {t("ui.noCollectionDestinations")}
          </h3>
          <p className="text-sm">{t("ui.noCollectionDestinationsHint")}</p>
        </div>
      ) : isUNESCOCollection ? (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {t("ui.unescoProperties", {
                count: destinationGroups.length,
              })}
              <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-300">
                {t("ui.places", { count: destinations.length })}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {getUNESCOPropertyGroupDestinations(locale).map((group) => (
              <DestinationCard key={group.id} destination={group} />
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {t("ui.includedDestinations", {
                count: destinations.length,
              })}
              {collection.metadata.expectedMembers &&
                collection.metadata.expectedMembers !== destinations.length && (
                  <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-300">
                    {t("ui.currentlyCatalogued", {
                      count: destinations.length,
                    })}{" "}
                    ·{" "}
                    {t("ui.expected", {
                      count: collection.metadata.expectedMembers,
                    })}
                  </span>
                )}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {destinations.map((dest) => (
              <DestinationCard key={dest.id} destination={dest} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
