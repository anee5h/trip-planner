import React from "react";
import { Link } from "react-router-dom";
import { Compass, ArrowRight, Layers } from "lucide-react";
import { getCollections } from "@/shared/data/collections";
import { LazyImage } from "@/shared/components/ui/LazyImage";

// 4 distinct cover images matching collection themes
const EDITORIAL_COLLECTION_DATA = [
  {
    id: "original-12-castles",
    title: "Original Castles",
    category: "ARCHITECTURE & HISTORY",
    places: "12 places",
    image:
      "https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "unesco-japan",
    title: "UNESCO World Heritage",
    category: "WORLD HERITAGE",
    places: "27 places",
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "national-treasures",
    title: "National Treasures",
    category: "CULTURAL HERITAGE",
    places: "18 places",
    image:
      "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "national-parks-japan",
    title: "National Parks",
    category: "NATURE & PARKS",
    places: "34 places",
    image:
      "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80",
  },
];

export const CollectionsRail: React.FC = () => {
  const collections = getCollections();

  return (
    <section className="py-8 sm:py-12 lg:py-16 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight tracking-tight flex items-center gap-2">
              <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 shrink-0" />
              <span>Browse collections</span>
            </h2>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Curated ideas to inspire your next outing.
            </p>
          </div>

          <Link
            to="/collections"
            className="shrink-0 pt-1 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Dense Mobile Collections Rail (~1.8 cards visible on mobile) */}
        <div className="flex gap-3 sm:gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-none py-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          {EDITORIAL_COLLECTION_DATA.map((item) => {
            const rawCol = collections.find((c) => c.id === item.id);
            const slug = rawCol?.slug || item.id;

            return (
              <Link
                key={item.id}
                to={`/collections/${slug}`}
                className="group relative bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 flex flex-col justify-end w-[52vw] min-w-[180px] max-w-[205px] sm:w-auto sm:min-w-[280px] sm:max-w-[310px] h-56 sm:h-[350px] shrink-0 snap-start border border-slate-800"
              >
                {/* 4:5 Background Hero Image with Smooth Zoom */}
                <LazyImage
                  src={item.image}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-108 transition-transform duration-700 ease-out opacity-90"
                />

                {/* High Contrast Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

                {/* Clean Simplified Content Overlay */}
                <div className="relative z-10 p-4 sm:p-6 text-white flex flex-col justify-end">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
                    {item.category}
                  </span>

                  <h3 className="text-sm sm:text-xl font-extrabold text-white group-hover:text-emerald-300 transition-colors leading-tight mb-1.5 line-clamp-2">
                    {item.title}
                  </h3>

                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-300">
                    <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                    <span>{item.places}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CollectionsRail;
