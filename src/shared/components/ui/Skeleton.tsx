import { cn } from "@/shared/utils/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Matches DestinationCard final dimensions exactly */
export function DestinationCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm animate-pulse">
      <Skeleton className="h-60 sm:h-64 w-full rounded-xl" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

/** Matches DestinationDetails page layout */
export function DestinationDetailsSkeleton() {
  return (
    <div className="bg-slate-50 dark:bg-background min-h-screen pb-20 animate-pulse">
      {/* Hero Banner Skeleton */}
      <div className="relative h-[380px] sm:h-[400px] md:h-[440px] w-full bg-slate-300 dark:bg-slate-800">
        <div className="absolute top-4 left-4 h-7 w-20 rounded-full bg-slate-400/40" />
        <div className="absolute bottom-0 left-0 w-full container mx-auto px-4 pb-6 space-y-3">
          <Skeleton className="h-10 w-2/3 max-w-md bg-slate-400/40 rounded-xl" />
          <Skeleton className="h-4 w-1/3 max-w-xs bg-slate-400/30 rounded-lg" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-6 w-16 bg-slate-400/30 rounded-md" />
            <Skeleton className="h-6 w-24 bg-slate-400/30 rounded-md" />
          </div>
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-36 bg-emerald-700/50 rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10 rounded-full bg-slate-400/40" />
              <Skeleton className="h-10 w-10 rounded-full bg-slate-400/40" />
              <Skeleton className="h-10 w-10 rounded-full bg-slate-400/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Overview Skeleton */}
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 space-y-4 border border-slate-200 dark:border-slate-800">
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Matches CollectionDirectory card dimensions */
export function CollectionCardSkeleton() {
  return (
    <div className="rounded-3xl p-6 space-y-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-7 w-2/3 rounded-xl" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-4/5 rounded" />
    </div>
  );
}

/** Matches stat card dimensions */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm animate-pulse">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}
