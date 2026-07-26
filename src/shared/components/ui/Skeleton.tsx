import { cn } from "@/shared/utils/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200 dark:bg-slate-800",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Matches DestinationCard final dimensions exactly */
export function DestinationCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
      <Skeleton className="h-[180px] w-full rounded-xl" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

/** Matches stat card dimensions */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}
