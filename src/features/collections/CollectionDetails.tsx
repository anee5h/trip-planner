import { useParams, Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getCollectionBySlug } from "@/shared/data/collections";
import {
  getCollectionDestinationGroups,
  getDestinationsForCollection,
  getCollectionProgress,
  getCollectionContent,
  UNESCO_COLLECTION_ID,
} from "@/shared/utils/collections";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Frown,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";

export default function CollectionDetails() {
  const { slug } = useParams<{ slug: string }>();
  const collection = slug ? getCollectionBySlug(slug) : undefined;
  const { visited } = useTripStore();
  const { locale } = useLocale();
  const { t } = useTranslation();

  if (!collection) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-xl">
        <Frown className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
          {t("ui.collectionNotFound")}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          {t("ui.collectionNotFoundHint")}
        </p>
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition-colors"
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Navigation Back */}
      <div className="mb-4">
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors"
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
          {collection.category} · {collection.type}
        </Badge>

        <h1 className="mb-3 text-3xl font-extrabold text-slate-900 dark:text-white md:text-4xl">
          {content.name}
        </h1>
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
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
            <span className="text-emerald-600 dark:text-emerald-400">
              {progress.percent}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {collection.metadata && (
          <details className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <summary className="cursor-pointer font-bold text-slate-700 dark:text-slate-200">
              {t("ui.aboutCollection")}
            </summary>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <span className="text-slate-400 dark:text-slate-500">
                  {t("ui.authority")}:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                  {collection.metadata.authority.replace("_", " ")}
                </span>
              </div>
              {(collection.metadata.verificationSource ||
                collection.officialSource) && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500">
                    {t("ui.source")}:
                  </span>{" "}
                  {collection.sourceUrl ? (
                    <a
                      href={collection.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 inline-flex items-center"
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
                <span className="text-slate-400 dark:text-slate-500">
                  {t("ui.lastReviewed")}:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {collection.metadata.lastVerified}
                </span>
              </div>
              {collection.metadata.expectedMembers && (
                <div>
                  <span className="text-slate-400 dark:text-slate-500">
                    {t("ui.expected")}:
                  </span>{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {isUNESCOCollection
                      ? t("ui.unescoPlaces", {
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
                  <span className="text-slate-400 dark:text-slate-500">
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

      {destinations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-slate-500">
          <Frown className="w-12 h-12 mb-3 text-slate-400" />
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-1">
            No destinations are available in this collection yet.
          </h3>
          <p className="text-sm">
            Check back soon as new verified destinations are added.
          </p>
        </div>
      ) : isUNESCOCollection ? (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {t("ui.unescoProperties", {
                count: destinationGroups.length,
              })}
              <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("ui.unescoPlaces", { count: destinations.length })}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {destinationGroups.map((group) => {
              const isSinglePlace = group.destinations.length === 1;
              const target = isSinglePlace
                ? `/destinations/${group.destinations[0].id}`
                : `/collections/${collection.slug}/${group.propertyId}`;
              return (
                <Link
                  key={group.id}
                  to={target}
                  className="group flex min-h-40 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <h3 className="text-base font-extrabold leading-snug text-slate-900 transition-colors group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400">
                    {group.name}
                  </h3>
                  {!isSinglePlace && (
                    <span className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {t("ui.unescoPlaces", {
                        count: group.destinations.length,
                      })}
                    </span>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {isSinglePlace ? t("ui.view") : t("ui.viewPlaces")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
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
                  <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
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
