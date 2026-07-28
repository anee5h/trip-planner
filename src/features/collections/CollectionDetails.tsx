import { useParams, Link } from "react-router-dom";
import { useTripStore } from "@/shared/hooks/useTripStore";
import { getCollectionBySlug } from "@/shared/data/collections";
import {
  getDestinationsForCollection,
  getCollectionProgress,
} from "@/shared/utils/collections";
import CollectionBadge from "@/shared/components/ui/CollectionBadge";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import { ArrowLeft, ExternalLink, Frown, CheckCircle2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { useLocale } from "@/shared/context/LocaleContext";

export default function CollectionDetails() {
  const { slug } = useParams<{ slug: string }>();
  const collection = slug ? getCollectionBySlug(slug) : undefined;
  const { visited } = useTripStore();
  const { locale } = useLocale();

  if (!collection) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-xl">
        <Frown className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
          Collection Not Found
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          The curated collection you are looking for does not exist or has been
          relocated.
        </p>
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Collections
        </Link>
      </div>
    );
  }

  const destinations = getDestinationsForCollection(collection.id, locale);
  const progress = getCollectionProgress(collection.id, visited, locale);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Navigation Back */}
      <div className="mb-6">
        <Link
          to="/collections"
          className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> All Collections
        </Link>
      </div>

      {/* Hero Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <CollectionBadge collection={collection} size="md" />
            <Badge
              variant="outline"
              className="capitalize text-xs font-semibold"
            >
              {collection.type} Collection
            </Badge>
          </div>

          {collection.officialSource && collection.sourceUrl && (
            <a
              href={collection.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
              Source: {collection.officialSource}
            </a>
          )}
        </div>

        <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4">
          {collection.name}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg max-w-3xl leading-relaxed mb-8">
          {collection.description}
        </p>

        {/* Progress Tracker */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-4 max-w-xl mb-6">
          <div className="flex justify-between items-center text-sm font-bold mb-2">
            <span className="text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {progress.visited} / {progress.total} visited
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

        {/* Provenance & Audit Trust Panel */}
        {collection.metadata && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-slate-400 dark:text-slate-500">
                Authority:
              </span>{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                {collection.metadata.authority.replace("_", " ")}
              </span>
            </div>
            {(collection.metadata.verificationSource ||
              collection.officialSource) && (
              <div>
                <span className="text-slate-400 dark:text-slate-500">
                  Source:
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
                Last Reviewed:
              </span>{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {collection.metadata.lastVerified}
              </span>
            </div>
            {collection.metadata.expectedMembers && (
              <div>
                <span className="text-slate-400 dark:text-slate-500">
                  Expected Members:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {collection.metadata.expectedMembers} destinations
                </span>
              </div>
            )}
            {collection.metadata.reviewIntervalMonths && (
              <div>
                <span className="text-slate-400 dark:text-slate-500">
                  Audit Cycle:
                </span>{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Every {collection.metadata.reviewIntervalMonths} months
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Destination Grid & Empty State */}
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
      ) : (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Included Destinations ({destinations.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {destinations.map((dest) => (
              <DestinationCard key={dest.id} destination={dest} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
