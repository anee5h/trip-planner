import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Frown } from "lucide-react";
import { getCollectionBySlug } from "@/shared/data/collections";
import {
  getCollectionDestinationGroups,
  getCollectionContent,
} from "@/shared/utils/collections";
import DestinationCard from "@/features/destinations/components/DestinationCard";
import { PageHeader } from "@/shared/components/ui/PageHeader";
import { useLocale } from "@/shared/context/LocaleContext";
import { useTranslation } from "react-i18next";

export default function CollectionGroupDetails() {
  const { slug, groupId } = useParams<{ slug: string; groupId: string }>();
  const collection = slug ? getCollectionBySlug(slug) : undefined;
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

  const groups = getCollectionDestinationGroups(collection.id, locale);
  const group = groups.find((item) => item.propertyId === groupId);
  const content = getCollectionContent(collection, locale);

  if (!group) {
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
          to={`/collections/${collection.slug}`}
          className="inline-flex items-center text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> {content.name}
        </Link>
      </div>
    );
  }

  // A single-place group opens its destination directly.
  if (group.destinations.length === 1) {
    return (
      <Navigate to={`/destinations/${group.destinations[0].id}`} replace />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Link
        to={`/collections/${collection.slug}`}
        className="mb-4 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1.5" /> {content.name}
      </Link>

      <PageHeader
        title={group.name}
        subtitle={t("ui.unescoPlaces", { count: group.destinations.length })}
        compact
      />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group.destinations.map((dest) => (
          <DestinationCard key={dest.id} destination={dest} />
        ))}
      </div>
    </div>
  );
}
