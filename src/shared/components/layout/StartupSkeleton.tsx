import type { HTMLAttributes } from "react";

const SKELETON_TONE = "bg-slate-200/70 dark:bg-slate-800/70";

export function SkeletonBlock({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-xl ${SKELETON_TONE} ${className}`.trim()}
    />
  );
}

const PLANNER_FIELDS = ["vibe", "duration", "party", "budget", "transport"];

/**
 * Route-level homepage fallback for the initial lazy Home chunk.
 *
 * Navbar/Footer/BottomNav are outside the route Suspense boundary and remain
 * real UI. This shell owns only the homepage body that would otherwise be
 * replaced by the generic spinner; it intentionally stops after the first
 * discovery rail instead of pretending to load the entire page.
 */
export function StartupSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-startup-skeleton
      className="min-h-full bg-white text-slate-900 dark:bg-slate-950 dark:text-white"
    >
      <div className="motion-safe:animate-pulse">
        <section className="relative overflow-hidden bg-slate-50 pb-6 pt-6 sm:pb-8 sm:pt-8 lg:pb-8 lg:pt-10 dark:bg-slate-950">
          <div className="container mx-auto max-w-6xl px-4">
            {/* Station selector — the real control is a compact rounded bar. */}
            <SkeletonBlock className="mx-auto h-11 w-full max-w-[320px] rounded-xl sm:max-w-[380px]" />

            {/* KAI-131-compatible weather/date footprint: two mobile rows,
                three desktop columns, matching Home's h-9 controls. */}
            <div
              data-startup-weather-shell
              className="mx-auto mt-3 grid w-full max-w-[450px] grid-cols-2 items-center gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(105px,125px)] sm:gap-1.5"
            >
              <SkeletonBlock className="h-9 w-full rounded-full" />
              <SkeletonBlock className="h-9 w-full rounded-full" />
              <SkeletonBlock className="col-span-2 h-9 w-full rounded-full sm:col-span-1" />
            </div>

            {/* Hero copy and trip-mode toggle. */}
            <div className="mx-auto mb-4 mt-6 max-w-3xl text-center sm:mb-5 sm:mt-8">
              <SkeletonBlock className="mx-auto h-[29px] w-[78%] max-w-[560px] sm:h-10 lg:h-12" />
              <SkeletonBlock className="mx-auto mt-3 hidden h-5 w-[58%] max-w-[500px] sm:block" />
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <SkeletonBlock className="h-10 w-[255px] rounded-xl" />
            </div>

            {/* Mobile planner geometry: five 56px rows plus two actions. */}
            <div data-startup-planner-mobile className="space-y-2 lg:hidden">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-5 w-28 rounded-md" />
                  <SkeletonBlock className="h-4 w-28 rounded-md" />
                </div>
                <div className="space-y-2">
                  {PLANNER_FIELDS.map((field) => (
                    <SkeletonBlock
                      key={field}
                      className="h-14 w-full rounded-[14px]"
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <SkeletonBlock className="h-[52px] w-full rounded-xl" />
                  <SkeletonBlock className="h-[50px] w-full rounded-xl" />
                </div>
              </div>
            </div>

            {/* Desktop planner geometry: the real five-segment h-20 bar and
                the two h-11 actions below it. */}
            <div
              data-startup-planner-desktop
              className="hidden w-full flex-col items-center lg:flex"
            >
              <SkeletonBlock className="h-20 w-full rounded-2xl p-2" />
              <div className="mt-4 flex items-center justify-center gap-3">
                <SkeletonBlock className="h-11 w-40 rounded-xl" />
                <SkeletonBlock className="h-11 w-36 rounded-xl" />
              </div>
            </div>
          </div>
        </section>

        {/* First meaningful discovery rail; match HomeRailLayout dimensions. */}
        <section
          data-startup-rail
          className="bg-white py-6 sm:py-8 lg:py-9 dark:bg-slate-950"
        >
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <SkeletonBlock className="h-7 w-48 rounded-md sm:h-8 lg:h-9" />
                <SkeletonBlock className="mt-1 h-4 w-64 rounded-md" />
              </div>
              <SkeletonBlock className="mt-1 h-8 w-20 rounded-lg" />
            </div>
            <div className="-mx-4 flex gap-3 overflow-hidden px-4 py-2 md:mx-0 md:px-10 sm:gap-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="flex h-full w-[46vw] min-w-[160px] max-w-[180px] shrink-0 flex-col sm:w-[250px] sm:min-w-[250px] sm:max-w-[250px]"
                >
                  <SkeletonBlock className="h-40 w-full rounded-2xl" />
                  <SkeletonBlock className="mt-3 h-5 w-4/5 rounded-md" />
                  <SkeletonBlock className="mt-2 h-4 w-3/5 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
